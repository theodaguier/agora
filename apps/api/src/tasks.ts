/**
 * Tasks assigned to employees, by a colleague (web app) or by a bot
 * (```tasks``` block, same mechanism as ```mcp-request```). Everyone can see
 * anyone's tasks on their profile; the agents get the tasks of the people they
 * talk to in their context, with the directory of employees they can assign.
 */
import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import type { TaskPriority, TaskStatus } from "./db/schema";
import { HermesError } from "./hermes-admin";
import { publishToAll } from "./events";
import { postEvent } from "./messages";
import { notifyAssigned, notifyDone, quietly } from "./inbox";
import { errors } from "./errors.messages";
import { defineMessages, tr } from "./i18n";
import { slugHandle, withHandles } from "@agora/core";
import { AVAILABILITY_PROMPT, availabilityNote, schedulesOf } from "./availability";

const messages = defineMessages({
  en: { notFound: "Task not found", unknownAssignee: "Unknown assignee" },
  fr: { notFound: "Tâche introuvable", unknownAssignee: "Destinataire inconnu" },
});

const { agent, task, taskAssignee, user } = schema;
type Row = typeof task.$inferSelect;
type Viewer = { id: string; role?: string | null };

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const satisfies TaskStatus[];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const satisfies TaskPriority[];

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000);
const dueOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)));

/** Task entered in the app: one task, shared by everyone tagged (yourself if nobody). */
export const taskInput = z.object({
  title,
  description: description.default(""),
  assigneeIds: z.array(z.string().min(1)).min(1).max(20),
  dueOn: dueOn.nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
});

export const taskPatch = z
  .object({ title, description, status: z.enum(TASK_STATUSES), priority: z.enum(TASK_PRIORITIES), dueOn: dueOn.nullable(), assigneeIds: z.array(z.string().min(1)).min(1).max(20) })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

/** Block emitted by a bot. */
export const tasksBlockSchema = z
  .object({
    create: z
      .array(
        z
          .object({
            title,
            description: description.optional(),
            assignees: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
            assignee: z.string().trim().min(1).max(120).optional(),
            due: dueOn.optional(),
            priority: z.enum(TASK_PRIORITIES).optional(),
          })
          .refine((c) => c.assignee || c.assignees?.length),
      )
      .max(10)
      .default([]),
    update: z
      .array(
        z
          .object({ id: z.string().min(1).max(64), status: z.enum(TASK_STATUSES).optional(), priority: z.enum(TASK_PRIORITIES).optional() })
          .refine((u) => u.status || u.priority),
      )
      .max(20)
      .default([]),
  })
  .refine((b) => b.create.length + b.update.length > 0);

export type TasksBlock = z.infer<typeof tasksBlockSchema>;

export const TASKS_PROMPT = [
  "# Tâches",
  "L'app gère les tâches des membres, visibles par tous. Une tâche est partagée par ses participants et apparaît aussi chez celui qui l'a créée. Tu peux en créer (pour ton interlocuteur ou des collègues de l'annuaire) et changer leur statut, avec ce bloc, seul, à la fin de ta réponse :",
  "```tasks",
  '{"create": [{"title": "…", "description": "…", "assignees": ["@lea", "@theo"], "due": "2026-10-01", "priority": "high"}], "update": [{"id": "…", "status": "done"}, {"id": "…", "priority": "urgent"}]}',
  "```",
  "- `assignees` : les @handle des participants (annuaire). `description`, `due` (AAAA-MM-JJ) et `priority` sont facultatifs. Les deux listes sont facultatives.",
  "- `status` : `todo`, `in_progress` ou `done`. `priority` : `low`, `normal` (par défaut), `high` ou `urgent` ; ne la change que si on te le demande ou si l'urgence est explicite. N'utilise que des `id` listés dans ton contexte.",
  "- Ne crée une tâche que si on te le demande ou si c'est clairement convenu dans la conversation ; annonce-la dans ta réponse. Ne recrée pas une tâche déjà listée.",
].join("\n");

/** How to cite a task in a text; the app shows it with its title and status. */
export const TASK_REF_PROMPT =
  "Pour citer une tâche listée ici, écris `[[task:<id>]]` avec son id entre crochets (ex. [[task:3f2c…]]) : l'app l'affiche avec son titre et son statut, donc ne réécris pas son titre à côté.";

/* ---------- Reading ---------- */

const creator = alias(user, "creator");

/** A participant; `current`: it's the task they're working on right now. */
type Person = { id: string; name: string; image: string | null; current: boolean };
type Joined = { task: Row; creatorName: string | null; creatorImage: string | null; agent: typeof agent.$inferSelect | null; assignees: Person[] };

/** Tasks with their creator, their bot and their participants. */
async function load(where: SQL | undefined, limit = 200): Promise<Joined[]> {
  const rows = await db
    .select({ task, creatorName: creator.name, creatorImage: creator.image, agent })
    .from(task)
    .leftJoin(creator, eq(creator.id, task.createdBy))
    .leftJoin(agent, eq(agent.id, task.agentId))
    .where(where)
    .orderBy(...order)
    .limit(limit);
  if (!rows.length) return [];
  const people = await db
    .select({ taskId: taskAssignee.taskId, id: user.id, name: user.name, image: user.image, currentTaskId: user.currentTaskId })
    .from(taskAssignee)
    .innerJoin(user, eq(user.id, taskAssignee.userId))
    .where(
      inArray(
        taskAssignee.taskId,
        rows.map((r) => r.task.id),
      ),
    )
    .orderBy(asc(taskAssignee.createdAt));
  return rows.map((r) => ({
    ...r,
    assignees: people.filter((p) => p.taskId === r.task.id).map(({ id, name, image, currentTaskId }) => ({ id, name, image, current: currentTaskId === r.task.id })),
  }));
}

/** Tasks someone works on or created. */
const involving = (userId: string) =>
  or(eq(task.createdBy, userId), inArray(task.id, db.select({ id: taskAssignee.taskId }).from(taskAssignee).where(eq(taskAssignee.userId, userId))));

const canEdit = (r: Pick<Joined, "task" | "assignees">, viewer: Viewer) =>
  viewer.role === "admin" || viewer.id === r.task.createdBy || r.assignees.some((a) => a.id === viewer.id);

function toDto(r: Joined, viewer: Viewer) {
  const t = r.task;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueOn: t.dueOn,
    assignees: r.assignees,
    /** Who created it: the bot, otherwise the employee. */
    assignedBy: r.agent
      ? { kind: "agent" as const, id: r.agent.id, name: r.agent.name, avatar: { shape: r.agent.avatarShape, color: r.agent.avatarColor } }
      : t.createdBy && r.creatorName
        ? { kind: "user" as const, id: t.createdBy, name: r.creatorName, image: r.creatorImage }
        : null,
    /** For a bot's task: the employee whose conversation it came from. */
    requestedBy: r.agent && t.createdBy && r.creatorName ? { id: t.createdBy, name: r.creatorName } : null,
    conversationId: t.conversationId,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    canEdit: canEdit(r, viewer),
    canDelete: viewer.role === "admin" || viewer.id === t.createdBy,
  };
}

export type TaskDto = ReturnType<typeof toDto>;

/** Open tasks first (most pressing, then by deadline), then the latest done ones. */
const order = [
  sql`case ${task.status} when 'in_progress' then 0 when 'todo' then 1 else 2 end`,
  sql`case ${task.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
  sql`${task.dueOn} asc nulls last`,
  desc(task.completedAt),
  desc(task.createdAt),
];

/** Tasks someone works on or created (yourself by default). */
export async function listTasks(viewer: Viewer, userId = viewer.id) {
  return (await load(involving(userId))).map((r) => toDto(r, viewer));
}

/** Tasks a bot created, for its profile. */
export async function listAgentTasks(viewer: Viewer, agentId: string) {
  return (await load(eq(task.agentId, agentId))).map((r) => toDto(r, viewer));
}

/** One task, to show a task cited in a message; anyone can read it. */
export async function getTask(viewer: Viewer, id: string) {
  return toDto(await one(id), viewer);
}

async function one(id: string) {
  const [row] = await load(eq(task.id, id), 1);
  if (!row) throw new HermesError(tr(messages).notFound, 404);
  return row;
}

/* ---------- Writing ---------- */

const changed = (r: Pick<Joined, "task" | "assignees">, more: string[] = []) =>
  publishToAll({ type: "tasks.changed", userIds: [...r.assignees.map((a) => a.id), ...(r.task.createdBy ? [r.task.createdBy] : []), ...more] });

/** Every id is an active (not banned) account. */
async function checkPeople(ids: string[]) {
  const active = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, ids), or(isNull(user.banned), eq(user.banned, false))));
  if (active.length !== ids.length) throw new HermesError(tr(messages).unknownAssignee, 400);
}

export async function createTask(input: z.infer<typeof taskInput>, viewer: Viewer) {
  const ids = [...new Set(input.assigneeIds)];
  await checkPeople(ids);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(task).values({ id, title: input.title, description: input.description, dueOn: input.dueOn, priority: input.priority, createdBy: viewer.id });
    await tx.insert(taskAssignee).values(ids.map((userId) => ({ taskId: id, userId })));
  });
  const row = await one(id);
  changed(row);
  await quietly(notifyAssigned(row.task, ids, { userId: viewer.id }));
  return toDto(row, viewer);
}

const statusChange = (status: TaskStatus) => ({ status, completedAt: status === "done" ? new Date() : null });

export async function updateTask(id: string, patch: z.infer<typeof taskPatch>, viewer: Viewer) {
  const row = await one(id);
  if (!canEdit(row, viewer)) throw new HermesError(tr(errors).notAllowed, 403);
  // Only whoever created it may reword it; participants move it along, prioritize it and choose who's on it.
  const reword = patch.title !== undefined || patch.description !== undefined || patch.dueOn !== undefined;
  if (reword && viewer.role !== "admin" && viewer.id !== row.task.createdBy) throw new HermesError(tr(errors).notAllowed, 403);
  const ids = patch.assigneeIds && [...new Set(patch.assigneeIds)];
  if (ids) await checkPeople(ids);
  await db.transaction(async (tx) => {
    const values = {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.dueOn !== undefined && { dueOn: patch.dueOn }),
      ...(patch.priority && { priority: patch.priority }),
      ...(patch.status && patch.status !== row.task.status && statusChange(patch.status)),
    };
    if (Object.keys(values).length) await tx.update(task).set(values).where(eq(task.id, id));
    if (ids) {
      await tx.delete(taskAssignee).where(and(eq(taskAssignee.taskId, id), notInArray(taskAssignee.userId, ids)));
      await tx
        .insert(taskAssignee)
        .values(ids.map((userId) => ({ taskId: id, userId })))
        .onConflictDoNothing();
    }
  });
  const removed = ids ? row.assignees.filter((a) => !ids.includes(a.id)).map((a) => a.id) : [];
  await followStatus(id, patch.status && patch.status !== row.task.status ? patch.status : undefined, viewer.id, ids ?? row.assignees.map((a) => a.id), removed);
  // Also those just removed, so their list drops it.
  changed(row, ids ?? []);
  if (ids) await quietly(notifyAssigned(row.task, ids.filter((i) => !row.assignees.some((a) => a.id === i)), { userId: viewer.id }));
  if (patch.status === "done" && row.task.status !== "done") await quietly(notifyDone(row.task, { userId: viewer.id }));
  return toDto(await one(id), viewer);
}

/**
 * Keeps "what I'm working on" in step with the task: starting it makes it the
 * current task of whoever started it (if they're on it); finishing it or moving
 * it back to to-do clears it for everyone; leaving it clears it for those who left.
 */
async function followStatus(taskId: string, status: TaskStatus | undefined, by: string | null, participants: string[], removed: string[] = []) {
  if (status === "in_progress" && by && participants.includes(by)) await db.update(user).set({ currentTaskId: taskId }).where(eq(user.id, by));
  if (status === "done" || status === "todo") await db.update(user).set({ currentTaskId: null }).where(eq(user.currentTaskId, taskId));
  if (removed.length) await db.update(user).set({ currentTaskId: null }).where(and(eq(user.currentTaskId, taskId), inArray(user.id, removed)));
}

/**
 * Sets (or clears, with null) the task someone is working on. They must be on
 * it; a to-do task moves to in progress.
 */
export async function setCurrentTask(taskId: string | null, viewer: Viewer) {
  if (!taskId) {
    await db.update(user).set({ currentTaskId: null }).where(eq(user.id, viewer.id));
    publishToAll({ type: "tasks.changed", userIds: [viewer.id] });
    return;
  }
  const row = await one(taskId);
  if (!row.assignees.some((a) => a.id === viewer.id)) throw new HermesError(tr(errors).notAllowed, 403);
  await db.update(user).set({ currentTaskId: taskId }).where(eq(user.id, viewer.id));
  if (row.task.status !== "in_progress") await db.update(task).set(statusChange("in_progress")).where(eq(task.id, taskId));
  changed(row);
}

/** What someone is working on right now, if anything. */
export async function currentTaskOf(userId: string) {
  const [row] = await db
    .select({ id: task.id, title: task.title, status: task.status })
    .from(user)
    .innerJoin(task, eq(task.id, user.currentTaskId))
    .where(eq(user.id, userId));
  return row ?? null;
}

export async function deleteTask(id: string, viewer: Viewer) {
  const row = await one(id);
  if (viewer.role !== "admin" && viewer.id !== row.task.createdBy) throw new HermesError(tr(errors).notAllowed, 403);
  await db.delete(task).where(eq(task.id, id));
  changed(row);
}

/* ---------- Bots ---------- */

type Member = { id: string; name: string; username: string | null; title: string; handle: string; working: string | null; away: string | null };

/** Employees a bot can assign tasks to or mention (not banned), with their @handle. */
async function directory(): Promise<Member[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, username: user.username, title: user.title, working: task.title })
    .from(user)
    .leftJoin(task, eq(task.id, user.currentTaskId))
    .where(or(isNull(user.banned), eq(user.banned, false)))
    .orderBy(asc(user.name))
    .limit(200);
  const schedules = await schedulesOf(rows.map((r) => r.id));
  return withHandles(
    rows.map((r) => {
      const s = schedules.get(r.id);
      return { ...r, away: s ? availabilityNote(s) : null };
    }),
  );
}

/** "@lea", "lea", "Léa Test" or an id → the employee. */
export function resolveAssignee<M extends Pick<Member, "id" | "name" | "handle">>(ref: string, members: M[]) {
  const key = ref.trim().replace(/^@/, "").replace(/\.+$/, "").toLowerCase();
  return (
    members.find((m) => m.id === ref.trim()) ??
    members.find((m) => m.handle === key) ??
    members.find((m) => m.name.toLowerCase() === key || slugHandle(m.name) === slugHandle(key)) ??
    null
  );
}

/**
 * Applies the block emitted by a bot. Its tasks are assigned on behalf of the
 * employee whose turn it is; it can only move tasks that employee could move,
 * or that it assigned itself. Each change is posted in the conversation.
 */
export async function applyTasksBlock(
  block: TasksBlock,
  ctx: { conversationId: string; agentId: string; botName: string; requestedBy: string | null },
) {
  const members = await directory();
  const [requester] = ctx.requestedBy ? await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, ctx.requestedBy)) : [];
  const touched = new Set<string>();

  for (const item of block.create) {
    const targets = [...new Map([...(item.assignees ?? []), ...(item.assignee ? [item.assignee] : [])].map((ref) => resolveAssignee(ref, members)).filter((m) => !!m).map((m) => [m.id, m])).values()];
    if (!targets.length) continue;
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(task).values({
        id,
        title: item.title,
        description: item.description ?? "",
        dueOn: item.due ?? null,
        priority: item.priority ?? "normal",
        createdBy: requester?.id ?? null,
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
      });
      await tx.insert(taskAssignee).values(targets.map((m) => ({ taskId: id, userId: m.id })));
    });
    for (const m of targets) touched.add(m.id);
    if (requester) touched.add(requester.id);
    // Whoever asked the bot already knows.
    await quietly(notifyAssigned({ id, title: item.title, conversationId: ctx.conversationId }, targets.map((m) => m.id).filter((i) => i !== requester?.id), { agentId: ctx.agentId }));
    await postEvent(ctx.conversationId, { type: "task.assigned", actor: ctx.botName, title: item.title, assignee: targets.map((m) => m.name).join(", ") });
  }

  if (block.update.length) {
    const rows = await load(inArray(task.id, [...new Set(block.update.map((u) => u.id))]), 20);
    for (const u of block.update) {
      const row = rows.find((r) => r.task.id === u.id);
      if (!row) continue;
      const status = u.status && u.status !== row.task.status ? u.status : undefined;
      const priority = u.priority && u.priority !== row.task.priority ? u.priority : undefined;
      if (!status && !priority) continue;
      const allowed = row.task.agentId === ctx.agentId || (requester && canEdit(row, requester));
      if (!allowed) continue;
      await db
        .update(task)
        .set({ ...(status && statusChange(status)), ...(priority && { priority }) })
        .where(eq(task.id, row.task.id));
      if (status) await followStatus(row.task.id, status, requester?.id ?? null, row.assignees.map((a) => a.id));
      if (status === "done" && row.task.createdBy !== requester?.id) await quietly(notifyDone(row.task, { agentId: ctx.agentId }));
      for (const a of row.assignees) touched.add(a.id);
      if (row.task.createdBy) touched.add(row.task.createdBy);
      if (status) await postEvent(ctx.conversationId, { type: "task.status", actor: ctx.botName, title: row.task.title, status });
      if (priority) await postEvent(ctx.conversationId, { type: "task.priority", actor: ctx.botName, title: row.task.title, priority });
    }
  }
  if (touched.size) publishToAll({ type: "tasks.changed", userIds: [...touched] });
}

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "à faire", in_progress: "en cours", done: "terminée" };
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "priorité basse", normal: "", high: "priorité haute", urgent: "URGENTE" };

/** Tasks to show a bot per person in the conversation: every open one, and the few last done. */
const OPEN_MAX = 20;
const DONE_MAX = 3;
/** For the rest of the directory: open tasks only, fewer. */
const OTHERS_MAX = 5;

/**
 * Context block for a bot: the tasks of the people in the conversation
 * (assigned to them, and open ones they assigned), then the directory of
 * employees with their open tasks, so it can answer about a colleague too.
 */
export async function tasksContext(people: { id: string; name: string }[]) {
  const members = await directory();
  const ids = people.map((p) => p.id);
  const rows = await load(or(ne(task.status, "done"), ...ids.map(involving)), 500);
  const on = (r: Joined, id: string) => r.assignees.some((a) => a.id === id);
  const line = (r: Joined) => {
    const t = r.task;
    const by = r.agent ? `${r.agent.name}${r.creatorName ? ` pour ${r.creatorName}` : ""}` : (r.creatorName ?? "?");
    const who = r.assignees.map((a) => a.name).join(", ") || "personne";
    const due = t.dueOn ? `, échéance ${t.dueOn}` : "";
    const desc = t.description ? ` — ${t.description.replace(/\s+/g, " ").slice(0, 200)}` : "";
    const priority = PRIORITY_LABEL[t.priority] ? `, ${PRIORITY_LABEL[t.priority]}` : "";
    return `- [${t.id}] « ${t.title} » (${STATUS_LABEL[t.status]}${priority}${due}, participants : ${who}, créée par ${by})${desc}`;
  };
  const sections = people.map((p) => {
    const mine = rows.filter((r) => on(r, p.id));
    const open = mine.filter((r) => r.task.status !== "done").slice(0, OPEN_MAX);
    const done = mine.filter((r) => r.task.status === "done").slice(0, DONE_MAX);
    const given = rows.filter((r) => r.task.createdBy === p.id && !on(r, p.id) && r.task.status !== "done").slice(0, OPEN_MAX);
    const now = members.find((m) => m.id === p.id)?.working;
    const away = members.find((m) => m.id === p.id)?.away;
    return [
      `## ${p.name}${now ? ` — travaille en ce moment sur « ${now} »` : ""}${away ? ` [${away}]` : ""}`,
      open.length || done.length ? [...open, ...done].map(line).join("\n") : "- Aucune tâche.",
      ...(given.length ? [`Tâches en cours que ${p.name} a créées pour d'autres :`, ...given.map(line)] : []),
    ].join("\n");
  });
  const others = members.map((m) => {
      const who = `- ${m.name} (@${m.handle})${m.title ? ` — ${m.title}` : ""}${m.working ? `, travaille en ce moment sur « ${m.working} »` : ""}${m.away ? ` [${m.away}]` : ""}`;
      if (ids.includes(m.id)) return `${who} : tâches ci-dessus`;
      const open = rows.filter((r) => on(r, m.id) && r.task.status !== "done");
      if (!open.length) return `${who} : aucune tâche en cours`;
      const more = open.length > OTHERS_MAX ? `\n  - … et ${open.length - OTHERS_MAX} autres` : "";
      return `${who} :\n${open.slice(0, OTHERS_MAX).map((r) => `  ${line(r)}`).join("\n")}${more}`;
    });
  return [
    "# Tâches des membres de la conversation",
    ...sections,
    "",
    "# Annuaire des membres et leurs tâches en cours",
    "Pour mentionner un membre dans ta réponse, écris son @handle tel qu'indiqué (ex. @lea) ; c'est aussi ce que tu mets dans `assignees`.",
    TASK_REF_PROMPT,
    AVAILABILITY_PROMPT,
    others.join("\n"),
  ].join("\n");
}
