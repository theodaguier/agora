/**
 * Morning recap: every day at 08:30 (organization time zone) the AI writes a
 * retrospective of the previous day, or of the previous week on Mondays.
 *
 * - The team part is written from shared material only: tasks (visible to
 *   everyone), group conversations, and per-bot activity counts. A private
 *   conversation's content never reaches it.
 * - Each account then gets a part addressed to them, from their own tasks and
 *   the conversations they are a member of, in their language.
 *
 * Written by the default profile in its own sessions (`agora-digest-*`), like
 * the memory curator. Without Hermes, or when the reply can't be read, the
 * recap falls back to plain lists built from the same material.
 */
import { withHandles } from "@agora/core";
import { and, asc, countDistinct, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "./db";
import type { DigestKind, DigestPersonal, DigestStats, DigestTeam } from "./db/schema";
import { env } from "./env";
import { publishToAll } from "./events";
import { chat } from "./hermes";
import { defineMessages, tr, type Locale } from "./i18n";
import { getOrg, LANGUAGE, userLocale } from "./org";
import { pushDigest } from "./push";
import { estimateCost, priceBook } from "./usage";

const { agent, conversation, conversationAgent, conversationMember, digest, digestPersonal, message, setting, task, taskAssignee, usageEvent, user } = schema;

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 15 * 60_000;
/** Conversation material passed to the AI, in characters. */
const TEAM_BUDGET = 60_000;
const PERSONAL_BUDGET = 30_000;
const MESSAGE_MAX = 500;
const LIST_MAX = 8;

const messages = defineMessages({
  en: {
    teamHeadline: (done: number, open: number) => `${done} task${done > 1 ? "s" : ""} completed, ${open} still open.`,
    personalHeadline: (done: number, open: number) => `You completed ${done} task${done > 1 ? "s" : ""}; ${open} still waiting for you.`,
    overdue: (title: string, due: string) => `“${title}” was due on ${due}.`,
    by: (names: string) => ` (${names})`,
  },
  fr: {
    teamHeadline: (done: number, open: number) => `${done} tâche${done > 1 ? "s" : ""} terminée${done > 1 ? "s" : ""}, ${open} encore ouverte${open > 1 ? "s" : ""}.`,
    personalHeadline: (done: number, open: number) => `Vous avez terminé ${done} tâche${done > 1 ? "s" : ""} ; ${open} vous attende${open > 1 ? "nt" : ""} encore.`,
    overdue: (title: string, due: string) => `« ${title} » était due le ${due}.`,
    by: (names: string) => ` (${names})`,
  },
});

/* ---------- time zone ---------- */

function wallClock(at: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Instant local day `day` starts at in `timeZone`. */
function startOf(day: string, timeZone: string) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  const offset = (at: number) => {
    const w = wallClock(at, timeZone);
    return Date.UTC(Number(w.day.slice(0, 4)), Number(w.day.slice(5, 7)) - 1, Number(w.day.slice(8, 10)), w.hour, w.minute) - Math.floor(at / 60_000) * 60_000;
  };
  // Twice: the offset at the guess may differ from the one at the answer (DST change).
  return new Date(utc - offset(utc - offset(utc)));
}

/** 0 = Sunday … 6 = Saturday. */
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/* ---------- configuration (admin) ---------- */

const CONFIG_KEY = "digest_config";

export const digestConfigSchema = z
  .object({
    enabled: z.boolean(),
    /** Local time of the organization, HH:MM. */
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    /** Days a recap is written, 0 = Sunday … 6 = Saturday. */
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    /** Day that looks back on the previous week instead; null = never. */
    weeklyDay: z.number().int().min(0).max(6).nullable(),
    /** Part addressed to each member. */
    personal: z.boolean(),
    /** Token usage and cost shown to members; otherwise to admins only. */
    usageForMembers: z.boolean(),
  })
  .refine((c) => c.weeklyDay === null || c.days.includes(c.weeklyDay), { message: "weekly_day_not_scheduled" });

export type DigestConfig = z.infer<typeof digestConfigSchema>;

export const DEFAULT_DIGEST_CONFIG: DigestConfig = { enabled: true, time: "08:30", days: [0, 1, 2, 3, 4, 5, 6], weeklyDay: 1, personal: true, usageForMembers: true };

export async function getDigestConfig(): Promise<DigestConfig> {
  const [row] = await db.select({ value: setting.value }).from(setting).where(eq(setting.key, CONFIG_KEY));
  try {
    const parsed = digestConfigSchema.safeParse({ ...DEFAULT_DIGEST_CONFIG, ...JSON.parse(row?.value ?? "{}") });
    return parsed.success ? parsed.data : DEFAULT_DIGEST_CONFIG;
  } catch {
    return DEFAULT_DIGEST_CONFIG;
  }
}

export async function saveDigestConfig(config: DigestConfig, userId: string) {
  const value = JSON.stringify({ ...config, days: [...new Set(config.days)].sort() });
  await db
    .insert(setting)
    .values({ key: CONFIG_KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: setting.key, set: { value, updatedBy: userId } });
}

/**
 * The recap written on local day `day`: the previous week on the weekly day,
 * otherwise everything since the previous scheduled day (the weekend, on a
 * Monday when only weekdays are scheduled).
 */
export function periodFor(day: string, config: Pick<DigestConfig, "days" | "weeklyDay"> = DEFAULT_DIGEST_CONFIG): { kind: DigestKind; start: string; end: string } {
  const end = addDays(day, -1);
  if (config.weeklyDay === weekday(day)) return { kind: "weekly", start: addDays(day, -7), end };
  let back = 1;
  while (back < 7 && !config.days.includes(weekday(addDays(day, -back)))) back++;
  return { kind: "daily", start: addDays(day, -back), end };
}

/* ---------- material ---------- */

type Material = Awaited<ReturnType<typeof collect>>;
type TaskLine = { id: string; title: string; status: string; priority: string; dueOn: string | null; assignees: { id: string; name: string; handle: string }[]; agentName: string | null; createdBy: string | null; completedAt: Date | null; createdAt: Date };
type Line = { conversationId: string; at: Date; authorUserId: string | null; agentId: string | null; author: string; text: string };

async function collect(from: Date, to: Date) {
  const inPeriod = (col: AnyPgColumn) => and(gte(col, from), lt(col, to));

  /** Active accounts, with the "@handle" the app and the agents use. */
  const people = withHandles(
    await db
      .select({ id: user.id, name: user.name, username: user.username, title: user.title, image: user.image, locale: user.locale })
      .from(user)
      .where(or(eq(user.banned, false), sql`${user.banned} is null`))
      .orderBy(asc(user.name)),
  );
  const handleOf = (id: string, name: string) => people.find((p) => p.id === id)?.handle ?? name;

  const tasksRows = await db
    .select({ task, agentName: agent.name })
    .from(task)
    .leftJoin(agent, eq(agent.id, task.agentId))
    .where(or(ne(task.status, "done"), inPeriod(task.createdAt), inPeriod(task.completedAt)))
    .orderBy(asc(task.createdAt))
    .limit(500);
  const assignees = tasksRows.length
    ? await db
        .select({ taskId: taskAssignee.taskId, id: user.id, name: user.name })
        .from(taskAssignee)
        .innerJoin(user, eq(user.id, taskAssignee.userId))
        .where(inArray(taskAssignee.taskId, tasksRows.map((r) => r.task.id)))
    : [];
  const tasks: TaskLine[] = tasksRows.map(({ task: t, agentName }) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueOn: t.dueOn,
    assignees: assignees.filter((a) => a.taskId === t.id).map(({ id, name }) => ({ id, name, handle: handleOf(id, name) })),
    agentName,
    createdBy: t.createdBy,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  }));

  const rows = await db
    .select({
      conversationId: message.conversationId,
      at: message.createdAt,
      text: message.text,
      userId: message.authorUserId,
      userName: user.name,
      agentId: message.authorAgentId,
      agentName: agent.name,
    })
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(and(ne(message.kind, "event"), gte(message.createdAt, from), lt(message.createdAt, to)))
    .orderBy(asc(message.createdAt))
    .limit(10_000);
  const lines: Line[] = rows.map((r) => ({
    conversationId: r.conversationId,
    at: r.at,
    authorUserId: r.userId,
    agentId: r.agentId,
    author: r.agentName ? `${r.agentName} (bot)` : (r.userName ?? "?"),
    text: r.text.replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX),
  }));

  const convIds = [...new Set(rows.map((r) => r.conversationId))];
  const convs = convIds.length ? await db.select().from(conversation).where(inArray(conversation.id, convIds)) : [];
  const members = convIds.length
    ? await db
        .select({ conversationId: conversationMember.conversationId, id: user.id, name: user.name })
        .from(conversationMember)
        .innerJoin(user, eq(user.id, conversationMember.userId))
        .where(inArray(conversationMember.conversationId, convIds))
    : [];
  const bots = convIds.length
    ? await db
        .select({ conversationId: conversationAgent.conversationId, name: agent.name })
        .from(conversationAgent)
        .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
        .where(inArray(conversationAgent.conversationId, convIds))
    : [];
  const conversations = convs.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    memberIds: members.filter((m) => m.conversationId === c.id).map((m) => m.id),
    participants: [...members.filter((m) => m.conversationId === c.id).map((m) => m.name), ...bots.filter((b) => b.conversationId === c.id).map((b) => `${b.name} (bot)`)],
  }));

  /** Per bot: messages written and conversations it was active in, without their content. */
  const botActivity = new Map<string, { name: string; messages: number; conversations: Set<string> }>();
  for (const r of rows) {
    if (!r.agentId || !r.agentName) continue;
    const a = botActivity.get(r.agentId) ?? { name: r.agentName, messages: 0, conversations: new Set() };
    a.messages++;
    a.conversations.add(r.conversationId);
    botActivity.set(r.agentId, a);
  }

  const routines = await db
    .select({ agentId: usageEvent.agentId, agentName: agent.name, name: usageEvent.taskName, runs: countDistinct(usageEvent.sessionId) })
    .from(usageEvent)
    .leftJoin(agent, eq(agent.id, usageEvent.agentId))
    .where(and(eq(usageEvent.source, "cron"), gte(usageEvent.occurredAt, from), lt(usageEvent.occurredAt, to)))
    .groupBy(usageEvent.agentId, agent.name, usageEvent.taskName);

  const [usageRows, book, agents] = await Promise.all([
    db
      .select({
        at: usageEvent.occurredAt,
        userId: usageEvent.userId,
        agentId: usageEvent.agentId,
        provider: usageEvent.provider,
        model: usageEvent.model,
        apiCalls: usageEvent.apiCalls,
        inputTokens: usageEvent.inputTokens,
        outputTokens: usageEvent.outputTokens,
        cacheReadTokens: usageEvent.cacheReadTokens,
        cacheWriteTokens: usageEvent.cacheWriteTokens,
        reasoningTokens: usageEvent.reasoningTokens,
        reported: usageEvent.reportedCostUsd,
      })
      .from(usageEvent)
      .where(and(gte(usageEvent.occurredAt, from), lt(usageEvent.occurredAt, to))),
    priceBook(),
    db.select({ id: agent.id, name: agent.name, shape: agent.avatarShape, color: agent.avatarColor }).from(agent).orderBy(asc(agent.name)),
  ]);
  const usage = usageRows.map((u) => ({
    at: u.at,
    userId: u.userId,
    agentId: u.agentId,
    provider: u.provider,
    model: u.model,
    tokens: u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens,
    cost: estimateCost(book(u.provider, u.model).price, u, u.reported),
  }));

  const done = tasks.filter((t) => t.completedAt && t.completedAt >= from && t.completedAt < to);
  return { from, to, tasks, done, lines, conversations, botActivity, routines, usage, agents, people };
}

/* ---------- figures ---------- */

const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/** Figures of one part: the whole team, or the person `userId`. */
function statsFor(m: Material, o: { userId?: string; start: string; end: string; today: string; timeZone: string }): DigestStats {
  const mine = (t: TaskLine) => !o.userId || t.assignees.some((a) => a.id === o.userId);
  const open = m.tasks.filter((t) => t.status !== "done" && mine(t));
  const done = m.done.filter(mine);
  const member = o.userId ? new Set(m.conversations.filter((c) => c.memberIds.includes(o.userId!)).map((c) => c.id)) : null;
  const written = o.userId ? m.lines.filter((l) => l.authorUserId === o.userId) : m.lines;
  const around = member ? m.lines.filter((l) => member.has(l.conversationId)) : m.lines;
  const agents = new Set(around.map((l) => l.agentId).filter(Boolean) as string[]);
  if (!o.userId) for (const r of m.routines) if (r.agentId) agents.add(r.agentId);
  const usage = o.userId ? m.usage.filter((u) => u.userId === o.userId) : m.usage;

  // One bar per hour for a single day, per day otherwise.
  const byDay = o.start !== o.end;
  const keys: string[] = [];
  if (byDay) for (let d = o.start; d <= o.end; d = addDays(d, 1)) keys.push(d);
  else keys.push(...hours);
  const keyOf = (at: Date) => {
    const w = wallClock(at.getTime(), o.timeZone);
    return byDay ? w.day : String(w.hour).padStart(2, "0");
  };
  const series = new Map(keys.map((t) => [t, { t, messages: 0, tokens: 0, tasksDone: 0 }]));
  for (const l of written) {
    const point = series.get(keyOf(l.at));
    if (point) point.messages++;
  }
  for (const u of usage) {
    const point = series.get(keyOf(u.at));
    if (point) point.tokens += u.tokens;
  }
  for (const t of done) {
    const point = series.get(keyOf(t.completedAt!));
    if (point) point.tasksDone++;
  }

  const byAgent = new Map<string, { tokens: number; cost: number }>();
  const byModel = new Map<string, { provider: string; model: string; tokens: number; cost: number }>();
  for (const u of usage) {
    if (u.agentId) {
      const a = byAgent.get(u.agentId) ?? { tokens: 0, cost: 0 };
      a.tokens += u.tokens;
      a.cost += u.cost;
      byAgent.set(u.agentId, a);
    }
    const key = `${u.provider}\0${u.model}`;
    const x = byModel.get(key) ?? { provider: u.provider, model: u.model, tokens: 0, cost: 0 };
    x.tokens += u.tokens;
    x.cost += u.cost;
    byModel.set(key, x);
  }

  const stats: DigestStats = {
    tasks: {
      done: done.length,
      created: m.tasks.filter((t) => t.createdAt >= m.from && t.createdAt < m.to && (!o.userId ? true : mine(t) || t.createdBy === o.userId)).length,
      open: open.length,
      overdue: open.filter((t) => t.dueOn && t.dueOn < o.today).length,
    },
    messages: written.length,
    conversations: new Set(written.map((l) => l.conversationId)).size,
    agents: agents.size,
    usage: {
      tokens: usage.reduce((n, u) => n + u.tokens, 0),
      cost: usage.reduce((n, u) => n + u.cost, 0),
      byAgent: [...byAgent.entries()]
        .flatMap(([id, v]) => {
          const a = m.agents.find((x) => x.id === id);
          return a ? [{ id, name: a.name, avatar: { shape: a.shape, color: a.color }, ...v }] : [];
        })
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 5),
      byModel: [...byModel.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 4),
    },
    series: [...series.values()],
  };
  if (!o.userId) {
    stats.people = m.people
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image,
        tasksDone: m.done.filter((t) => t.assignees.some((a) => a.id === p.id)).length,
        messages: m.lines.filter((l) => l.authorUserId === p.id).length,
      }))
      .filter((p) => p.tasksDone || p.messages)
      .sort((a, b) => b.tasksDone * 10 + b.messages - (a.tasksDone * 10 + a.messages))
      .slice(0, 5);
  }
  return stats;
}

/* ---------- prompt ---------- */

const STATUS = { todo: "à faire", in_progress: "en cours", done: "terminée" } as Record<string, string>;

function taskText(t: TaskLine) {
  const who = t.assignees.map((a) => a.handle).join(", ") || "personne";
  const due = t.dueOn ? `, échéance ${t.dueOn}` : "";
  const priority = t.priority === "normal" ? "" : `, priorité ${t.priority}`;
  const bot = t.agentName ? `, créée par le bot ${t.agentName}` : "";
  return `- [${t.id}] « ${t.title} » (${STATUS[t.status] ?? t.status}${priority}${due}, participants : ${who}${bot})`;
}

/** Conversations' messages within `budget` characters; the latest ones are kept when a conversation is too long. */
function transcript(material: Material, conversationIds: Set<string>, budget: number, timeZone: string) {
  const ids = [...conversationIds].filter((id) => material.lines.some((l) => l.conversationId === id));
  if (!ids.length) return "";
  const share = Math.max(3000, Math.floor(budget / ids.length));
  const hhmm = new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const out: string[] = [];
  for (const id of ids) {
    const c = material.conversations.find((x) => x.id === id);
    if (!c) continue;
    const kept: string[] = [];
    let size = 0;
    const lines = material.lines.filter((l) => l.conversationId === id);
    for (let i = lines.length - 1; i >= 0 && size < share; i--) {
      const text = `[${hhmm.format(lines[i]!.at)}] ${lines[i]!.author} : ${lines[i]!.text}`;
      size += text.length;
      kept.unshift(text);
    }
    const skipped = lines.length - kept.length;
    const title = c.title ? `« ${c.title} »` : c.kind === "group" ? "Groupe" : "Conversation privée";
    out.push([`## ${title} — ${c.participants.join(", ")}`, ...(skipped ? [`(${skipped} messages plus anciens omis)`] : []), ...kept].join("\n"));
  }
  return out.join("\n\n");
}

function periodText(kind: DigestKind, start: string, end: string) {
  return kind === "weekly" ? `la semaine du ${start} au ${end}` : `la journée du ${start}`;
}

const SYSTEM =
  "Dans cette session, tu n'es pas l'assistant d'un membre : tu rédiges uniquement le récap du matin de l'organisation. Ignore ta personnalité habituelle, ta mémoire et le wiki, n'utilise aucun outil et suis la consigne du message.";

const RULES = [
  "Règles :",
  "- N'invente rien : seulement ce qui figure dans le matériau ci-dessous, pas dans ta mémoire. Pas de chiffre qui n'y apparaît pas.",
  "- Dates en toutes lettres (« jeudi 24 septembre », « demain »), jamais au format AAAA-MM-JJ ni JJ/MM.",
  "- Phrases courtes et concrètes, une idée par élément, en nommant les personnes et les bots concernés. Pas de formule de politesse, pas d'emoji, pas de markdown dans les textes.",
  "- Au plus 6 éléments par liste ; une liste peut être vide.",
  "- Jamais de mot de passe, token, clé ou donnée bancaire.",
  "- Nomme les membres et les bots uniquement par leur mention de l'annuaire (ex. @lea, @Compta), jamais par leur nom complet : l'app les affiche avec leur avatar.",
  "- Cite une tâche par `[[task:<id>]]`, avec l'id entre crochets de la liste, et non par son titre : l'app l'affiche avec son titre et son statut.",
].join("\n");

function directoryText(m: Material) {
  return [
    "# Annuaire : la mention à écrire pour chacun",
    ...m.people.map((p) => `- ${p.name}${p.title ? ` (${p.title})` : ""} : @${p.handle}`),
    ...m.agents.map((a) => `- ${a.name} (bot) : @${a.name}`),
  ].join("\n");
}

function teamPrompt(m: Material, p: { kind: DigestKind; start: string; end: string }, orgName: string, locale: Locale, timeZone: string, today: string) {
  const groups = new Set(m.conversations.filter((c) => c.kind === "group").map((c) => c.id));
  const open = m.tasks.filter((t) => t.status !== "done");
  const bots = [...m.botActivity.values()].map((a) => `- ${a.name} : ${a.messages} messages dans ${a.conversations.size} conversation(s)`);
  const routines = m.routines.map((r) => `- ${r.agentName ?? "?"} : routine « ${r.name ?? "?"} » exécutée ${r.runs} fois`);
  return `Rédige le récap d'équipe de ${orgName} pour ${periodText(p.kind, p.start, p.end)}, en ${LANGUAGE[locale]}. Nous sommes le ${today}. Il sera lu par tous les membres ce matin : ce sur quoi l'équipe et les bots ont travaillé, ce qui a été fait, ce qui est en cours et ce qui reste à faire.

${RULES}
- Les conversations privées ne te sont pas transmises : ne parle que de ce qui figure ici.

Réponds UNIQUEMENT par ce bloc :
\`\`\`json
{"headline": "<une ou deux phrases qui résument la période>", "done": ["<fait marquant>"], "inProgress": ["<travail en cours>"], "next": ["<à faire, échéance proche ou point à surveiller>"]}
\`\`\`

${directoryText(m)}

# Tâches terminées sur la période (${m.done.length})
${m.done.map(taskText).join("\n") || "Aucune."}

# Tâches ouvertes (${open.length})
${open.slice(0, 80).map(taskText).join("\n") || "Aucune."}

# Activité des bots
${bots.join("\n") || "Aucune."}
${routines.join("\n")}

# Conversations de groupe
${transcript(m, groups, TEAM_BUDGET, timeZone) || "Aucune."}`;
}

function personalPrompt(
  m: Material,
  p: { kind: DigestKind; start: string; end: string },
  person: { id: string; name: string; title: string },
  mine: { done: TaskLine[]; open: TaskLine[]; given: TaskLine[] },
  conversationIds: Set<string>,
  locale: Locale,
  timeZone: string,
  today: string,
) {
  return `Rédige la partie personnelle du récap du matin de ${person.name}${person.title ? ` (${person.title})` : ""} pour ${periodText(p.kind, p.start, p.end)}, en ${LANGUAGE[locale]}. Adresse-toi directement à cette personne (${locale === "fr" ? "vouvoiement" : "second person"}) : ce qu'elle a fait, ce qui l'attend aujourd'hui, ce qui demande son attention (retards, échéances proches, demandes restées sans réponse). Nous sommes le ${today}.

${RULES}

Réponds UNIQUEMENT par ce bloc :
\`\`\`json
{"headline": "<une ou deux phrases, adressées à la personne>", "done": ["<ce qu'elle a fait>"], "next": ["<ce qui l'attend, le plus pressant d'abord>"], "attention": ["<retard, échéance, demande en attente>"]}
\`\`\`

${directoryText(m)}
Ne mentionne pas ${person.name} : c'est à elle que tu t'adresses.

# Ses tâches terminées sur la période (${mine.done.length})
${mine.done.map(taskText).join("\n") || "Aucune."}

# Ses tâches ouvertes (${mine.open.length})
${mine.open.map(taskText).join("\n") || "Aucune."}

# Tâches ouvertes qu'elle a confiées à d'autres (${mine.given.length})
${mine.given.map(taskText).join("\n") || "Aucune."}

# Ses conversations sur la période
${transcript(m, conversationIds, PERSONAL_BUDGET, timeZone) || "Aucune."}`;
}

/* ---------- reply ---------- */

const list = z
  .array(z.string())
  .catch([])
  .transform((l) => l.map((s) => s.trim()).filter(Boolean).slice(0, LIST_MAX));
const teamSchema = z.object({ headline: z.string().trim().min(1).max(600), done: list, inProgress: list, next: list });
const personalSchema = z.object({ headline: z.string().trim().min(1).max(600), done: list, next: list, attention: list });

function parseReply<T>(reply: string, schema: z.ZodType<T>): T | null {
  const block = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].at(-1)?.[1] ?? reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
  try {
    const parsed = schema.safeParse(JSON.parse(block));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function write<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  if (!env.HERMES_API_URL) return null;
  try {
    let reply = "";
    for await (const ev of chat({
      profile: "default",
      sessionId: `agora-digest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      system: SYSTEM,
      text: prompt,
      signal: AbortSignal.timeout(10 * 60_000),
    })) {
      if (ev.type === "delta") reply += ev.text;
    }
    return parseReply(reply, schema);
  } catch (err) {
    console.error("digest: write", err);
    return null;
  }
}

/* ---------- plain lists, when the AI can't write it ---------- */

const names = (t: TaskLine) => t.assignees.map((a) => `@${a.handle}`).join(", ");

function plainTeam(m: Material, locale: Locale): DigestTeam {
  const t = tr(messages, locale);
  const open = m.tasks.filter((x) => x.status !== "done");
  return {
    headline: t.teamHeadline(m.done.length, open.length),
    done: m.done.slice(0, LIST_MAX).map((x) => `${x.title}${names(x) ? t.by(names(x)) : ""}`),
    inProgress: open.filter((x) => x.status === "in_progress").slice(0, LIST_MAX).map((x) => `${x.title}${names(x) ? t.by(names(x)) : ""}`),
    next: open.filter((x) => x.status === "todo").slice(0, LIST_MAX).map((x) => `${x.title}${names(x) ? t.by(names(x)) : ""}`),
  };
}

function plainPersonal(mine: { done: TaskLine[]; open: TaskLine[] }, locale: Locale, today: string): DigestPersonal {
  const t = tr(messages, locale);
  return {
    headline: t.personalHeadline(mine.done.length, mine.open.length),
    done: mine.done.slice(0, LIST_MAX).map((x) => x.title),
    next: mine.open.slice(0, LIST_MAX).map((x) => x.title),
    attention: mine.open.filter((x) => x.dueOn && x.dueOn < today).slice(0, LIST_MAX).map((x) => t.overdue(x.title, x.dueOn!)),
  };
}

/* ---------- generation ---------- */

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const pressing = (a: TaskLine, b: TaskLine) =>
  (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) ||
  (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
  (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");

let running = false;

/** Writes the recap of local day `day` (today by default), replacing an existing one. */
export async function generateDigest(opts: { day?: string } = {}) {
  if (running) return { status: "running" as const };
  running = true;
  const org = await getOrg();
  const config = await getDigestConfig();
  const day = opts.day ?? wallClock(Date.now(), org.timezone).day;
  const period = periodFor(day, config);
  const [existing] = await db.select().from(digest).where(eq(digest.day, day));
  const attempts = (existing?.attempts ?? 0) + 1;
  try {
    const from = startOf(period.start, org.timezone);
    const to = startOf(addDays(period.end, 1), org.timezone);
    const m = await collect(from, to);
    const id = crypto.randomUUID();
    const scope = { start: period.start, end: period.end, today: day, timeZone: org.timezone };
    const stats = statsFor(m, scope);
    const base = { id, day, kind: period.kind, periodStart: period.start, periodEnd: period.end, locale: org.locale, stats, error: null, attempts };

    const empty = !stats.messages && !stats.tasks.done && !stats.tasks.created && !m.routines.length;
    if (empty) {
      await save({ ...base, status: "empty", team: null }, []);
      return { status: "empty" as const, id };
    }

    const team = (await write(teamPrompt(m, period, org.name, org.locale, org.timezone, day), teamSchema)) ?? plainTeam(m, org.locale);

    const personal: { userId: string; content: DigestPersonal; stats: DigestStats }[] = [];
    for (const person of config.personal ? m.people : []) {
      const on = (t: TaskLine) => t.assignees.some((a) => a.id === person.id);
      const mine = {
        done: m.done.filter(on),
        open: m.tasks.filter((t) => t.status !== "done" && on(t)).sort(pressing),
        given: m.tasks.filter((t) => t.status !== "done" && t.createdBy === person.id && !on(t)),
      };
      const conversationIds = new Set(m.conversations.filter((c) => c.memberIds.includes(person.id)).map((c) => c.id));
      // Someone who only received messages has nothing to recap.
      const wrote = m.lines.some((l) => l.authorUserId === person.id);
      if (!mine.done.length && !mine.open.length && !mine.given.length && !wrote) continue;
      const locale = await userLocale(person.locale);
      const content =
        (await write(personalPrompt(m, period, person, mine, conversationIds, locale, org.timezone, day), personalSchema)) ?? plainPersonal(mine, locale, day);
      personal.push({ userId: person.id, content, stats: statsFor(m, { ...scope, userId: person.id }) });
    }

    await save({ ...base, status: "ready", team }, personal);
    publishToAll({ type: "digest.ready", id });
    // Once per day: a recap written again (by an admin) replaces it without notifying twice.
    if (existing?.status !== "ready") {
      void pushDigest({ id, kind: period.kind, team: team.headline, personal: new Map(personal.map((p) => [p.userId, p.content.headline])) });
    }
    return { status: "ready" as const, id };
  } catch (err) {
    console.error("digest: generate", err);
    const error = err instanceof Error ? err.message : String(err);
    await db
      .insert(digest)
      .values({ id: crypto.randomUUID(), day, kind: period.kind, periodStart: period.start, periodEnd: period.end, status: "failed", locale: org.locale, error, attempts })
      .onConflictDoUpdate({ target: digest.day, set: { status: "failed", error, attempts, updatedAt: new Date() } })
      .catch(() => {});
    return { status: "failed" as const, error };
  } finally {
    running = false;
  }

  async function save(row: typeof digest.$inferInsert, personal: { userId: string; content: DigestPersonal; stats: DigestStats }[]) {
    await db.transaction(async (tx) => {
      await tx.delete(digest).where(eq(digest.day, day));
      await tx.insert(digest).values(row);
      if (personal.length) await tx.insert(digestPersonal).values(personal.map((p) => ({ digestId: row.id, ...p })));
    });
  }
}

/** Latest written recap, with the part addressed to `userId`. */
export async function latestDigest(userId: string, isAdmin: boolean) {
  const [row] = await db.select().from(digest).where(eq(digest.status, "ready")).orderBy(desc(digest.day)).limit(1);
  if (!row?.team) return null;
  const [mine] = await db
    .select({ content: digestPersonal.content, stats: digestPersonal.stats })
    .from(digestPersonal)
    .where(and(eq(digestPersonal.digestId, row.id), eq(digestPersonal.userId, userId)));
  const [seen] = await db.select({ id: user.digestSeen }).from(user).where(eq(user.id, userId));
  const showUsage = isAdmin || (await getDigestConfig()).usageForMembers;
  const hideUsage = (s: DigestStats | null) => (s && !showUsage ? { ...s, usage: null, series: s.series.map((p) => ({ ...p, tokens: 0 })) } : s);
  return {
    id: row.id,
    day: row.day,
    kind: row.kind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    team: row.team,
    personal: mine ? { ...mine.content, stats: hideUsage(mine.stats) } : null,
    stats: hideUsage(row.stats),
    /** Bots, to show their mentions with their avatar even when the reader can't use them. */
    agents: (await db.select({ id: agent.id, name: agent.name, shape: agent.avatarShape, color: agent.avatarColor }).from(agent)).map((a) => ({
      id: a.id,
      name: a.name,
      avatar: { shape: a.shape, color: a.color },
      onboarding: false,
    })),
    createdAt: row.createdAt,
    seen: seen?.id === row.id,
  };
}

/* ---------- schedule ---------- */

let timer: ReturnType<typeof setInterval> | null = null;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const digestRunning = () => running;

/** Next scheduled recap (local day and time), or null when they're turned off. */
export async function nextDigest(config: DigestConfig) {
  if (!config.enabled) return null;
  const org = await getOrg();
  const now = wallClock(Date.now(), org.timezone);
  const [today] = await db.select({ id: digest.id }).from(digest).where(eq(digest.day, now.day));
  for (let i = 0; i < 8; i++) {
    const day = addDays(now.day, i);
    if (!config.days.includes(weekday(day))) continue;
    // Today's is either written or about to be (within the minute).
    if (i === 0 && today) continue;
    return { day, time: config.time, kind: periodFor(day, config).kind };
  }
  return null;
}

/** Every minute: once the configured time has come in the organization's time zone, writes today's recap if it isn't there yet. */
export function startDigest() {
  if (timer) return;
  const tick = async () => {
    try {
      const org = await getOrg();
      if (!org.setupCompleted) return;
      const config = await getDigestConfig();
      const now = wallClock(Date.now(), org.timezone);
      if (!config.enabled || !config.days.includes(weekday(now.day))) return;
      if (now.hour * 60 + now.minute < minutesOf(config.time)) return;
      const [row] = await db.select().from(digest).where(eq(digest.day, now.day));
      if (row && (row.status !== "failed" || row.attempts >= MAX_ATTEMPTS || Date.now() - row.updatedAt.getTime() < RETRY_AFTER_MS)) return;
      await generateDigest({ day: now.day });
    } catch (err) {
      console.error("digest: schedule", err);
    }
  };
  timer = setInterval(tick, 60_000);
  setTimeout(tick, 30_000);
}
