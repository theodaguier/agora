import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { MAX_FILE, storeAttachment as storeFile, streamAttachment } from "../attachments";
import { callAll } from "../all-route";
import { abandonTurns, activeTurns, answerTurnApproval, cancelTurn, compactSession, conversationBusy, enqueueTurn, onConversationIdle, resetSession } from "../bot-runner";
import { hermesSessionId } from "../company";
import {
  accessibleAgentIds,
  agentDto,
  listConversations,
  loadConversation,
  openDirectWithAgent,
  openDirectWithUser,
  type LoadedConversation,
} from "../conversations";
import { db, schema } from "../db";
import { readAvatar } from "../profile";
import { env } from "../env";
import { forgetMembers, publishToConversation, publishToUser } from "../events";
import { CLAUDE_CODE_LABEL, CLAUDE_CODE_PROVIDER, canUseClaudeCode, isClaudeCodeModel, resolveClaudeCodeModel } from "../claude-code";
import { CODEX_LABEL, CODEX_PROVIDER, canUseCodex, isCodexModel } from "../codex";
import { skills, type ModelInfo } from "../hermes";
import { HermesError, agentMcpServers, forgetSessions } from "../hermes-admin";
import { syncSessionSearch } from "../session-search";
import { allowedClaudeCodeModels, allowedCodexModels, allowedModelOptions } from "../models";
import { deleteRoutine, findRoutine, listRoutines, updateRoutine } from "../routines";
import { screenInput, wakeScreen, watchScreen } from "../screen";
import { excerpt, groupCalls, newChain, type Forwarded, type ReplyTo } from "../group";
import { deleteMessage, getMessage, getMessages, listMessages, postEvent, postMessage, userAuthor, type MessageDto } from "../messages";
import { requireUser, type AppEnv } from "../middleware";
import { markConversationRead, quietly } from "../inbox";
import { defineMessages, tr } from "../i18n";
import { allowedInvocations, type AttachmentRow, type Invocation } from "../prompt";
import { sessionContext } from "../session-context";
import { projectActivity, projectData } from "../projects";
import { parseDraft } from "../views";
import {
  MAX_PROJECT_CONTEXT,
  MAX_PROJECT_RESOURCES,
  PROJECT_BOT_ACCESS_OPTIONS,
  PROJECT_STATUSES,
  projectBotAccess,
  type ProjectInfo,
  type ProjectStatus,
} from "@agora/core";
import { ALL_HANDLE, mentionsAll, SCREEN_VIEWPORTS, type QueuedMessageDto, type ViewAction, type ViewBlock } from "@agora/core";

const messages = defineMessages({
  en: {
    notPending: "This request is no longer pending.",
    requesterOnly: "Only the person who made the request can answer.",
    invalidChoice: "This choice isn't offered for this request.",
    hermesIgnored: "Hermes didn't take the answer into account.",
  },
  fr: {
    notPending: "Cette demande n'est plus en attente.",
    requesterOnly: "Seule la personne à l'origine de la demande peut répondre.",
    invalidChoice: "Choix non proposé pour cette demande.",
    hermesIgnored: "Hermes n'a pas pris la réponse en compte.",
  },
});

const { agent, attachment, conversation, conversationAgent, conversationAvatar, conversationMember, message, pin, queuedMessage, user } = schema;

const conversationAvatarUrl = (id: string, at: Date) => `/api/conversations/${encodeURIComponent(id)}/avatar?v=${at.getTime()}`;

/** A project's page properties (null on a discussion or a direct conversation). */
export const projectInfo = (c: typeof conversation.$inferSelect): ProjectInfo | null =>
  c.kind === "group" && !c.parentId
    ? {
        status: c.status ?? "in_progress",
        leadId: c.leadId,
        repo: c.repo,
        dueOn: c.dueOn,
        context: c.context ?? "",
        contextUpdatedAt: c.contextUpdatedAt?.toISOString() ?? null,
        contextAuthor: c.contextAuthor,
        resources: c.resources ?? [],
        botAccess: projectBotAccess(c.botAccess),
      }
    : null;

const detail = (c: LoadedConversation) => ({
  id: c.conversation.id,
  kind: c.conversation.kind,
  title: c.conversation.title,
  description: c.conversation.description,
  image: c.conversation.image,
  parentId: c.conversation.parentId,
  pinned: !!c.conversation.pinnedAt,
  archived: !!c.conversation.archivedAt,
  project: projectInfo(c.conversation),
  createdBy: c.conversation.createdBy,
  members: c.members.map(({ id, name, image }) => ({ id, name, image })),
  agents: c.agents.map((a) => agentDto(a.agent)),
  turns: activeTurns(c.conversation.id),
});

/** Bots an employee can add to a group: those they have access to, already configured. */
async function groupableAgents(userId: string, agentIds: string[]) {
  if (!agentIds.length) return [];
  const access = await accessibleAgentIds(userId);
  const rows = await db.select().from(agent).where(inArray(agent.id, agentIds));
  return rows.filter((a) => access.has(a.id) && !a.onboarding);
}

async function existingUsers(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids));
}

const ids = z.array(z.string().min(1).max(100)).max(50);

/**
 * The bot whose model is read or chosen: the bot of a direct conversation, or in a group the one named
 * (`agentId`), each bot keeping its own model there (bot-runner reads it per bot).
 */
function modelTarget(conv: LoadedConversation, agentId: string | undefined) {
  if (conv.directBot) return !agentId || agentId === conv.directBot.agent.id ? conv.directBot : null;
  return agentId ? (conv.agents.find((a) => a.agent.id === agentId) ?? null) : null;
}

type Pickable = Awaited<ReturnType<typeof pickable>>;

/** What the employee may pick for a bot: its Hermes models, and Claude Code's and Codex's for their subscription owner. */
async function pickable(profile: string, me: { id: string; email: string }) {
  const [options, ccModels, cxModels] = await Promise.all([
    allowedModelOptions(profile, me.id),
    // Claude Code or Codex unavailable (binary missing, not logged in): the section is simply not offered.
    canUseClaudeCode(me) ? allowedClaudeCodeModels(me.id).catch((err) => (console.error("claude code: models", err), [])) : [],
    canUseCodex(me) ? allowedCodexModels(me.id).catch((err) => (console.error("codex: models", err), [])) : [],
  ]);
  return {
    options,
    claudeCode: ccModels.length ? { provider: CLAUDE_CODE_PROVIDER, label: CLAUDE_CODE_LABEL, models: ccModels } : null,
    codex: cxModels.length ? { provider: CODEX_PROVIDER, label: CODEX_LABEL, models: cxModels } : null,
  };
}

/** The model a stored `provider::model` names among the pickable ones (null: the profile's default model). */
function modelInfo({ options, claudeCode, codex }: Pickable, value: string | null): ModelInfo | undefined {
  if (!value) return options.models.find((m) => m.id === options.defaultModel);
  const [provider, raw] = value.split("::") as [string, string | undefined];
  const id = provider === CLAUDE_CODE_PROVIDER && raw ? resolveClaudeCodeModel(raw) : raw;
  const groups = [{ provider: options.provider, models: options.models }, ...options.others, ...(claudeCode ? [claudeCode] : []), ...(codex ? [codex] : [])];
  return groups.find((g) => g.provider === provider)?.models.find((m) => m.id === id);
}

const storeAttachment = (conv: LoadedConversation, name: string, mime: string, content: Blob) =>
  storeFile(conv.conversation.id, conv.directBot?.agent.hermesProfile ?? null, name, mime, content);

const publicAttachment = ({ id, name, mime, size }: Pick<AttachmentRow, "id" | "name" | "mime" | "size">) => ({ id, name, mime, size });

type Outgoing = {
  text: string;
  files: AttachmentRow[];
  invocations?: Invocation[];
  mentions?: string[];
  replyTo?: ReplyTo;
  forwarded?: Forwarded;
  viewAction?: ViewAction;
  /** Group message to "@all": the bots it concerns answer. */
  all?: boolean;
};

/** Saves an employee's message, marks the conversation read, and queues replies from the relevant bots. */
async function sendUserMessage(conv: LoadedConversation, me: { id: string; name: string; image?: string | null }, out: Outgoing) {
  const id = conv.conversation.id;
  const data = {
    ...(out.files.length && { attachments: out.files.map(publicAttachment) }),
    ...(out.invocations?.length && { invocations: out.invocations }),
    ...(out.mentions?.length && { mentions: out.mentions }),
    ...(out.replyTo && { replyTo: out.replyTo }),
    ...(out.forwarded && { forwarded: out.forwarded }),
    ...(out.viewAction && { viewAction: out.viewAction }),
  };
  // Group without a mention: the bot that just replied may be the one being answered.
  const [last] =
    conv.conversation.kind === "group" && !out.forwarded
      ? await db
          .select({ kind: message.kind, agentId: message.authorAgentId, at: message.createdAt })
          .from(message)
          .where(and(eq(message.conversationId, id), ne(message.kind, "event")))
          .orderBy(desc(message.createdAt))
          .limit(1)
      : [];
  const msg = await postMessage(
    { id: crypto.randomUUID(), conversationId: id, kind: "user", authorUserId: me.id, text: out.text, data: Object.keys(data).length ? data : null },
    userAuthor(me),
  );
  await db
    .update(conversationMember)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversationMember.conversationId, id), eq(conversationMember.userId, me.id)));
  // In a group: the mentioned bots, and those the message is likely addressed to ("@all": picked below).
  const calls = conv.directBot
    ? [{ agentId: conv.directBot.agent.id }]
    : conv.conversation.kind === "group"
      ? groupCalls({
          text: out.forwarded ? "" : out.text,
          mentions: out.mentions ?? [],
          repliedTo: out.all ? undefined : out.replyTo?.authorAgentId,
          agents: conv.agents.map((a) => ({ id: a.agent.id, name: a.agent.name })),
          lastBot: last?.kind === "bot" && last.agentId ? { agentId: last.agentId, at: last.at } : null,
          now: new Date(),
        })
      : [];
  const chain = newChain();
  for (const call of calls) enqueueTurn({ conversationId: id, ...call, triggerId: msg.id, requestedBy: me.id, chain });
  if (out.all) {
    const bots = conv.agents.filter((a) => !calls.some((c) => c.agentId === a.agent.id)).map(({ agent: a }) => ({ id: a.id, name: a.name, hermesProfile: a.hermesProfile }));
    void callAll({ conversationId: id, triggerId: msg.id, requestedBy: me.id, chain, bots }).catch((err) => console.error("conversations: @all", err));
  }
  return msg;
}

/** Group: keeps the skill invocations whose bot is in the group and has that skill enabled. */
async function groupInvocations(conv: LoadedConversation, conversationId: string, invocations: Invocation[]) {
  const byBot = new Map<string, Invocation[]>();
  for (const inv of invocations) {
    if (inv.kind !== "skill" || !inv.agentId || !conv.agents.some((a) => a.agent.id === inv.agentId)) continue;
    byBot.set(inv.agentId, [...(byBot.get(inv.agentId) ?? []), inv]);
  }
  const kept = await Promise.all(
    [...byBot].map(async ([agentId, list]) => {
      const profile = conv.agents.find((a) => a.agent.id === agentId)!.agent.hermesProfile;
      return (await allowedInvocations(profile, conversationId, list)).map((v) => ({ ...v, agentId }));
    }),
  );
  return kept.flat();
}

/** A bot leaves a group, or the group is deleted: the bot forgets it (its Hermes sessions there), in the background. */
function forgetGroup(conversationId: string, bots: { id: string; hermesProfile: string }[]) {
  for (const bot of bots) {
    forgetSessions(bot.hermesProfile, hermesSessionId(conversationId, 0, bot.id)).catch((err) => console.error("conversations: forget sessions", err));
  }
}

type MessageData = { attachments?: { id: string; name: string; mime: string }[]; forwarded?: Forwarded } | null;

/** What a reply keeps of the message it answers. */
function replySnapshot(m: MessageDto): ReplyTo {
  const first = (m.data as MessageData)?.attachments?.[0];
  return {
    id: m.id,
    authorName: m.author?.name ?? "?",
    ...(m.author?.kind === "agent" && { authorAgentId: m.author.id }),
    text: excerpt(m.text),
    ...(first && { attachment: { id: first.id, name: first.name, mime: first.mime } }),
  };
}

/** What the composer sends: text, files, invocations, mentions, a reply, an answer to a draft. */
const messageBody = z
  .object({
    text: z.string().trim().max(20_000),
    attachmentIds: z.array(z.string()).max(10).default([]),
    invocations: z
      .array(
        z.union([
          z.object({ kind: z.enum(["skill", "mcp"]), name: z.string().regex(/^[\w.-]{1,80}$/), agentId: z.string().min(1).max(100).optional() }),
          z.object({ kind: z.literal("routine"), id: z.string().regex(/^[\w-]{1,64}$/), name: z.string().max(120) }),
        ]),
      )
      .max(5)
      .default([]),
    mentions: z.array(z.string()).max(20).default([]),
    replyTo: z.string().min(1).max(100).optional(),
    /** Answer to a draft the bot showed (```view``` block): the bot carries it out itself. */
    viewAction: z
      .object({
        messageId: z.string().min(1).max(100),
        index: z.number().int().min(0).max(10),
        action: z.enum(["confirm", "cancel", "revise"]),
        draft: z.unknown().optional(),
        note: z.string().trim().max(2000).optional(),
      })
      .refine((a) => a.action !== "revise" || !!a.note)
      .optional(),
  })
  .refine((b) => b.text || b.attachmentIds.length || b.invocations.length);
type MessageBody = z.infer<typeof messageBody>;

/** Checks a message body against the conversation and sends it: the message, or why it can't be sent. */
async function sendFromBody(conv: LoadedConversation, me: { id: string; name: string; image?: string | null }, body: MessageBody) {
  const id = conv.conversation.id;

  const files = body.attachmentIds.length
    ? await db.select().from(attachment).where(and(eq(attachment.conversationId, id), inArray(attachment.id, body.attachmentIds)))
    : [];
  if (files.length !== body.attachmentIds.length) return { error: "unknown_attachment" as const };
  // Invocations target a specific bot: the direct one, or in a group the bot whose skill was picked (skills only).
  const invocations = conv.directBot
    ? await allowedInvocations(conv.directBot.agent.hermesProfile, id, body.invocations)
    : conv.conversation.kind === "group"
      ? await groupInvocations(conv, id, body.invocations)
      : [];
  // A bot whose skill is invoked is called as if mentioned.
  const invoked = invocations.flatMap((v) => (v.kind !== "routine" && v.agentId ? [v.agentId] : []));
  const mentions =
    conv.conversation.kind === "group" ? [...new Set([...body.mentions, ...invoked])].filter((m) => conv.agents.some((a) => a.agent.id === m)) : [];
  let replyTo: ReplyTo | undefined;
  if (body.replyTo) {
    const quoted = await getMessage(id, body.replyTo);
    if (!quoted || quoted.kind === "event") return { error: "unknown_reply" as const };
    replyTo = replySnapshot(quoted);
  }

  let viewAction: ViewAction | undefined;
  if (body.viewAction) {
    const { messageId, index, action, draft, note } = body.viewAction;
    const source = await getMessage(id, messageId);
    const view = (source?.data as { views?: ViewBlock[] } | null)?.views?.[index];
    if (source?.kind !== "bot" || view?.kind !== "draft") return { error: "unknown_draft" as const };
    // Confirmed or to rework: the values as the employee left them (edited or not).
    const values = action === "cancel" ? undefined : parseDraft(view.type, draft ?? view.draft);
    if (values === null) return { error: "invalid_draft" as const };
    viewAction = { messageId, index, action, type: view.type, ...(values && { draft: values }), ...(action === "revise" && { note }) };
    // In a group, the answer goes to the bot that wrote the draft.
    if (source.author?.kind === "agent" && conv.conversation.kind === "group" && !mentions.includes(source.author.id)) mentions.push(source.author.id);
  }

  // "@all", unless a bot of the group is called that.
  const all = conv.conversation.kind === "group" && mentionsAll(body.text) && !conv.agents.some((a) => a.agent.name.trim().toLowerCase() === ALL_HANDLE);
  return { message: await sendUserMessage(conv, me, { text: body.text, files, invocations, mentions, replyTo, viewAction, all }) };
}

/* ---------- queue: messages sent while the bots work ---------- */

/** A queued message as its author sees it: its words, how many files, when. */
async function queueOf(conversationId: string, userId: string): Promise<QueuedMessageDto[]> {
  const rows = await db
    .select()
    .from(queuedMessage)
    .where(and(eq(queuedMessage.conversationId, conversationId), eq(queuedMessage.userId, userId)))
    .orderBy(asc(queuedMessage.createdAt));
  return rows.map((r) => {
    const body = r.body as Partial<MessageBody>;
    return { id: r.id, text: body.text ?? "", files: body.attachmentIds?.length ?? 0, createdAt: r.createdAt.toISOString() };
  });
}

/**
 * The bots of a conversation are done: its oldest waiting message is sent, as its author would have
 * (their replies then queue it again behind them). One at a time, so each gets its own answer.
 */
async function flushQueue(conversationId: string) {
  const [next] = await db.select().from(queuedMessage).where(eq(queuedMessage.conversationId, conversationId)).orderBy(asc(queuedMessage.createdAt)).limit(1);
  if (!next) return;
  const [taken] = await db.delete(queuedMessage).where(eq(queuedMessage.id, next.id)).returning();
  // Taken by "send now", or another flush, in between.
  if (!taken) return;
  publishToUser(taken.userId, { type: "queue.updated", conversationId, items: await queueOf(conversationId, taken.userId) });
  const [author] = await db.select({ id: schema.user.id, name: schema.user.name, image: schema.user.image }).from(schema.user).where(eq(schema.user.id, taken.userId));
  const conv = author && (await loadConversation(author.id, conversationId));
  const body = messageBody.safeParse(taken.body);
  // Left the conversation, or what it pointed to is gone (a file, a quoted message): the next one goes.
  const sent = conv && body.success ? await sendFromBody(conv, author, body.data) : null;
  if (!sent || "error" in sent) await flushQueue(conversationId);
}

onConversationIdle((conversationId) => void flushQueue(conversationId).catch((err) => console.error("conversations: queue", err)));

/** At startup: conversations with waiting messages and no bot at work get theirs. */
export async function resumeQueues() {
  const rows = await db.selectDistinct({ conversationId: queuedMessage.conversationId }).from(queuedMessage);
  for (const r of rows) if (!conversationBusy(r.conversationId)) await flushQueue(r.conversationId).catch((err) => console.error("conversations: queue", err));
}

/** A project: a group that is not itself a discussion of another project. */
const isProject = (c: LoadedConversation) => c.conversation.kind === "group" && !c.conversation.parentId;

/** The discussions of a project, for the member changes that follow the project into each of them. */
async function discussionIds(projectId: string) {
  return (await db.select({ id: conversation.id }).from(conversation).where(eq(conversation.parentId, projectId))).map((r) => r.id);
}

/** Gives a discussion every member and bot of its project it doesn't have yet. */
async function joinProjectMembers(discussionId: string, project: LoadedConversation, addedBy: string) {
  const people = project.members.map((m) => ({ conversationId: discussionId, userId: m.id }));
  const bots = project.agents.map((a) => ({ conversationId: discussionId, agentId: a.agent.id, addedBy }));
  if (people.length) await db.insert(conversationMember).values(people).onConflictDoNothing();
  if (bots.length) await db.insert(conversationAgent).values(bots).onConflictDoNothing();
  forgetMembers(discussionId);
}

export const conversations = new Hono<AppEnv>()
  .use(requireUser)

  .get("/", async (c) => c.json(await listConversations(c.get("user").id)))

  /** Opens or creates the direct conversation with a bot or a colleague. */
  .post("/direct", async (c) => {
    const body = z
      .union([z.object({ agentId: z.string().min(1) }), z.object({ userId: z.string().min(1) })])
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user").id;
    if ("agentId" in body.data) {
      if (!(await accessibleAgentIds(me)).has(body.data.agentId)) return c.json({ error: "not_found" }, 404);
      return c.json({ id: await openDirectWithAgent(me, body.data.agentId) });
    }
    const other = body.data.userId;
    if (other === me || !(await existingUsers([other])).length) return c.json({ error: "not_found" }, 404);
    return c.json({ id: await openDirectWithUser(me, other) });
  })

  .post("/group", async (c) => {
    const body = z
      .object({ title: z.string().trim().max(80).optional(), userIds: ids.default([]), agentIds: ids.default([]) })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const people = (await existingUsers([...new Set(body.data.userIds)])).filter((u) => u.id !== me.id);
    const bots = await groupableAgents(me.id, [...new Set(body.data.agentIds)]);
    if (people.length + bots.length < 2) return c.json({ error: "too_few_participants" }, 400);

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(conversation).values({ id, kind: "group", title: body.data.title || null, createdBy: me.id });
      await tx.insert(conversationMember).values([me.id, ...people.map((p) => p.id)].map((userId) => ({ conversationId: id, userId })));
      if (bots.length) await tx.insert(conversationAgent).values(bots.map((b) => ({ conversationId: id, agentId: b.id, addedBy: me.id })));
    });
    await postEvent(id, { type: "group.created", actor: me.name });
    void syncSessionSearch();
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.json({ id }, 201);
  })

  /** Opens a discussion inside a project: its own thread, with the project's members and bots. */
  .post("/:id/discussions", async (c) => {
    // Without a name: its bot names it after the first exchange (bot-runner, set_discussion_title).
    const body = z.object({ title: z.string().trim().max(80).optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const project = await loadConversation(me.id, c.req.param("id"));
    if (!project) return c.json({ error: "not_found" }, 404);
    if (!isProject(project)) return c.json({ error: "not_a_project" }, 400);
    const id = crypto.randomUUID();
    await db.insert(conversation).values({ id, kind: "group", title: body.data.title || null, parentId: project.conversation.id, createdBy: me.id });
    await joinProjectMembers(id, project, me.id);
    await postEvent(id, { type: "discussion.created", actor: me.name });
    void syncSessionSearch();
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.json({ id }, 201);
  })

  .get("/:id", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(detail(conv));
  })

  /** A project's activity: the events of its thread and of its discussions, latest first. */
  .get("/:id/project/activity", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!isProject(conv)) return c.json({ error: "not_a_project" }, 400);
    return c.json(await projectActivity(conv.conversation.id));
  })

  /** A project's data: the files and pages of its thread and of its discussions. */
  .get("/:id/project/data", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!isProject(conv)) return c.json({ error: "not_a_project" }, 400);
    return c.json(await projectData(conv.conversation.id));
  })

  /** Deletes a discussion of a project, with its messages; a project itself is left by its members, not deleted here. */
  .delete("/:id", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!conv.conversation.parentId) return c.json({ error: "not_a_discussion" }, 400);
    const id = conv.conversation.id;
    abandonTurns(id);
    await db.delete(conversation).where(eq(conversation.id, id));
    forgetGroup(id, conv.agents.map((a) => a.agent));
    void syncSessionSearch();
    for (const m of conv.members) publishToUser(m.id, { type: "conversation.removed", conversationId: id });
    return c.body(null, 204);
  })

  /** A group's (a project's) name and description; any member may change them. */
  .patch("/:id", async (c) => {
    const body = z
      .object({
        title: z.string().trim().max(80).optional(),
        description: z.string().trim().max(200).optional(),
        // A discussion's place: kept in the sidebar, put away, or moved to another project.
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        parentId: z.string().min(1).max(100).optional(),
        // A project's page.
        status: z.enum(PROJECT_STATUSES as [ProjectStatus, ...ProjectStatus[]]).optional(),
        leadId: z.string().min(1).max(100).nullable().optional(),
        repo: z
          .string()
          .trim()
          .regex(/^[\w.-]+\/[\w.-]+$/)
          .nullable()
          .optional()
          .or(z.literal("").transform(() => null)),
        dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        context: z.string().max(MAX_PROJECT_CONTEXT).optional(),
        resources: z
          .array(z.object({ url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u)), label: z.string().trim().max(60) }))
          .max(MAX_PROJECT_RESOURCES)
          .optional(),
        botAccess: z
          .object({
            context: z.enum(PROJECT_BOT_ACCESS_OPTIONS.context as ["none", "read", "write"]),
            data: z.enum(PROJECT_BOT_ACCESS_OPTIONS.data as ["none", "read", "add"]),
            discussions: z.enum(PROJECT_BOT_ACCESS_OPTIONS.discussions as ["none", "rename"]),
            sessions: z.enum(PROJECT_BOT_ACCESS_OPTIONS.sessions as ["none", "repo"]),
          })
          .partial()
          .optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind !== "group") return c.json({ error: "not_a_group" }, 400);
    const id = conv.conversation.id;
    const { title, description, pinned, archived, parentId, status, leadId, repo, dueOn, context, resources, botAccess } = body.data;
    const discussion = !!conv.conversation.parentId;
    if (!discussion && (pinned !== undefined || archived !== undefined || parentId !== undefined)) return c.json({ error: "not_a_discussion" }, 400);
    const page = [status, leadId, repo, dueOn, context, resources, botAccess].some((v) => v !== undefined);
    if (page && discussion) return c.json({ error: "not_a_project" }, 400);
    // The lead is one of its members.
    if (leadId && !conv.members.some((m) => m.id === leadId)) return c.json({ error: "not_a_member" }, 400);
    // A discussion keeps a name: the sidebar lists it by it.
    if (discussion && title !== undefined && !title) return c.json({ error: "title_required" }, 400);
    let target: LoadedConversation | null = null;
    if (parentId !== undefined && parentId !== conv.conversation.parentId) {
      target = await loadConversation(me.id, parentId);
      if (!target || !isProject(target)) return c.json({ error: "not_a_project" }, 400);
    }
    const renamed = title !== undefined && (title || null) !== conv.conversation.title;
    await db
      .update(conversation)
      .set({
        ...(title !== undefined && { title: title || null }),
        ...(description !== undefined && { description: description || null }),
        ...(pinned !== undefined && { pinnedAt: pinned ? new Date() : null }),
        ...(archived !== undefined && { archivedAt: archived ? new Date() : null }),
        ...(target && { parentId: target.conversation.id }),
        ...(status !== undefined && { status }),
        ...(leadId !== undefined && { leadId }),
        ...(repo !== undefined && { repo }),
        ...(dueOn !== undefined && { dueOn }),
        ...(context !== undefined &&
          context !== (conv.conversation.context ?? "") && {
            context: context || null,
            contextUpdatedAt: new Date(),
            contextAuthor: { kind: "user" as const, id: me.id, name: me.name },
          }),
        ...(resources !== undefined && { resources }),
        ...(botAccess !== undefined && { botAccess: { ...conv.conversation.botAccess, ...botAccess } }),
      })
      .where(eq(conversation.id, id));
    // The project's life is told in its thread, so its activity (and its bots) see it.
    if (status !== undefined && status !== (conv.conversation.status ?? "in_progress")) await postEvent(id, { type: "project.status", actor: me.name, status });
    if (context !== undefined && context !== (conv.conversation.context ?? "")) await postEvent(id, { type: "project.context", actor: me.name });
    // Moved: the new project's members join it (nobody is removed from a discussion they were in).
    if (target) {
      await joinProjectMembers(id, target, me.id);
      void syncSessionSearch();
    }
    // Only a new name is told in the thread: a description is the project's, not news.
    if (renamed) await postEvent(id, title ? { type: "group.renamed", actor: me.name, title } : { type: "group.unnamed", actor: me.name });
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.body(null, 204);
  })

  /** A group's logo: raw body, already cropped by the app. */
  .put("/:id/avatar", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind !== "group") return c.json({ error: "not_a_group" }, 400);
    const upload = await readAvatar(c.req);
    if ("error" in upload) return c.json({ error: upload.error }, upload.status);
    const id = conv.conversation.id;
    const at = new Date();
    const image = conversationAvatarUrl(id, at);
    await db.transaction(async (tx) => {
      await tx
        .insert(conversationAvatar)
        .values({ conversationId: id, ...upload, updatedAt: at })
        .onConflictDoUpdate({ target: conversationAvatar.conversationId, set: { ...upload, updatedAt: at } });
      await tx.update(conversation).set({ image }).where(eq(conversation.id, id));
    });
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.json({ image });
  })

  .delete("/:id/avatar", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    await db.transaction(async (tx) => {
      await tx.delete(conversationAvatar).where(eq(conversationAvatar.conversationId, id));
      await tx.update(conversation).set({ image: null }).where(eq(conversation.id, id));
    });
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.body(null, 204);
  })

  /** The logo, for the group's members; the URL changes with every new logo, hence the long cache. */
  .get("/:id/avatar", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const [row] = await db.select().from(conversationAvatar).where(eq(conversationAvatar.conversationId, conv.conversation.id));
    if (!row) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(row.data), {
      headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  })

  /** Adds colleagues and bots to a group. */
  .post("/:id/members", async (c) => {
    const body = z.object({ userIds: ids.default([]), agentIds: ids.default([]) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind !== "group") return c.json({ error: "not_a_group" }, 400);
    const id = conv.conversation.id;
    const people = (await existingUsers(body.data.userIds)).filter((u) => !conv.members.some((m) => m.id === u.id));
    const bots = (await groupableAgents(me.id, body.data.agentIds)).filter((b) => !conv.agents.some((a) => a.agent.id === b.id));
    if (!people.length && !bots.length) return c.body(null, 204);
    // Joining a project is joining its discussions.
    const into = isProject(conv) ? [id, ...(await discussionIds(id))] : [id];
    for (const target of into) {
      if (people.length) await db.insert(conversationMember).values(people.map((p) => ({ conversationId: target, userId: p.id }))).onConflictDoNothing();
      if (bots.length) await db.insert(conversationAgent).values(bots.map((b) => ({ conversationId: target, agentId: b.id, addedBy: me.id }))).onConflictDoNothing();
      forgetMembers(target);
      if (target !== id) await publishToConversation(target, { type: "conversation.updated", conversationId: target });
    }
    await postEvent(id, { type: "members.added", actor: me.name, names: [...people.map((p) => p.name), ...bots.map((b) => b.name)] });
    void syncSessionSearch();
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.body(null, 204);
  })

  /** Removes a member (or yourself: leaving the group). */
  .delete("/:id/members/:kind/:memberId", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind !== "group") return c.json({ error: "not_a_group" }, 400);
    const id = conv.conversation.id;
    const { kind, memberId } = c.req.param();
    const self = kind === "user" && memberId === me.id;
    if (!self && conv.conversation.createdBy !== me.id && me.role !== "admin") return c.json({ error: "forbidden" }, 403);
    // Leaving a project, or being removed from it, is also leaving its discussions.
    if (isProject(conv) && (kind === "user" || kind === "agent")) {
      for (const sub of await discussionIds(id)) {
        if (kind === "agent") {
          await db.delete(conversationAgent).where(and(eq(conversationAgent.conversationId, sub), eq(conversationAgent.agentId, memberId)));
          abandonTurns(sub, memberId);
          const bot = conv.agents.find((a) => a.agent.id === memberId);
          if (bot) forgetGroup(sub, [bot.agent]);
        } else {
          await db.delete(conversationMember).where(and(eq(conversationMember.conversationId, sub), eq(conversationMember.userId, memberId)));
          forgetMembers(sub);
          publishToUser(memberId, { type: "conversation.removed", conversationId: sub });
        }
        await publishToConversation(sub, { type: "conversation.updated", conversationId: sub });
      }
    }

    if (kind === "agent") {
      const target = conv.agents.find((a) => a.agent.id === memberId);
      if (!target) return c.json({ error: "not_found" }, 404);
      await db.delete(conversationAgent).where(and(eq(conversationAgent.conversationId, id), eq(conversationAgent.agentId, memberId)));
      abandonTurns(id, memberId);
      forgetGroup(id, [target.agent]);
      void syncSessionSearch();
      await postEvent(id, { type: "member.removed", actor: me.name, name: target.agent.name });
    } else if (kind === "user") {
      const target = conv.members.find((m) => m.id === memberId);
      if (!target) return c.json({ error: "not_found" }, 404);
      await db.delete(conversationMember).where(and(eq(conversationMember.conversationId, id), eq(conversationMember.userId, memberId)));
      forgetMembers(id);
      publishToUser(memberId, { type: "conversation.removed", conversationId: id });
      // No employees left: the group is deleted.
      if (conv.members.length <= 1) {
        abandonTurns(id);
        await db.delete(conversation).where(eq(conversation.id, id));
        forgetGroup(id, conv.agents.map((a) => a.agent));
        void syncSessionSearch();
        return c.body(null, 204);
      }
      await postEvent(id, self ? { type: "member.left", actor: me.name } : { type: "member.removed", actor: me.name, name: target.name });
      void syncSessionSearch();
    } else {
      return c.json({ error: "invalid_kind" }, 400);
    }
    await publishToConversation(id, { type: "conversation.updated", conversationId: id });
    return c.body(null, 204);
  })

  .get("/:id/messages", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(await listMessages(conv.conversation.id));
  })

  /** Saves a message, broadcasts it, and queues replies from the relevant bots. */
  .post("/:id/messages", async (c) => {
    const body = messageBody.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const sent = await sendFromBody(conv, me, body.data);
    if ("error" in sent) return c.json({ error: sent.error }, 400);
    return c.json(sent.message, 201);
  })

  /** Your messages waiting for the bots to finish (queue.ts below): sent one by one once they are done. */
  .get("/:id/queue", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(await queueOf(conv.conversation.id, me.id));
  })

  /** Sends now when no bot works in the conversation; otherwise the message waits in your queue. */
  .post("/:id/queue", async (c) => {
    const body = messageBody.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    if (!conversationBusy(id)) {
      const sent = await sendFromBody(conv, me, body.data);
      if ("error" in sent) return c.json({ error: sent.error }, 400);
      return c.json({ sent: sent.message }, 201);
    }
    await db.insert(queuedMessage).values({ id: crypto.randomUUID(), conversationId: id, userId: me.id, body: body.data });
    const items = await queueOf(id, me.id);
    publishToUser(me.id, { type: "queue.updated", conversationId: id, items });
    return c.json({ queued: items }, 201);
  })

  /** Rewords a waiting message. */
  .patch("/:id/queue/:queuedId", async (c) => {
    const text = z.object({ text: z.string().trim().max(20_000) }).safeParse(await c.req.json());
    if (!text.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    const [row] = await db
      .select()
      .from(queuedMessage)
      .where(and(eq(queuedMessage.id, c.req.param("queuedId")), eq(queuedMessage.conversationId, id), eq(queuedMessage.userId, me.id)));
    if (!row) return c.json({ error: "not_found" }, 404);
    const next = messageBody.safeParse({ ...row.body, text: text.data.text });
    if (!next.success) return c.json({ error: "invalid_body" }, 400);
    await db.update(queuedMessage).set({ body: next.data }).where(eq(queuedMessage.id, row.id));
    const items = await queueOf(id, me.id);
    publishToUser(me.id, { type: "queue.updated", conversationId: id, items });
    return c.json(items);
  })

  /** Takes a message out of the queue, unsent. */
  .delete("/:id/queue/:queuedId", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    await db.delete(queuedMessage).where(and(eq(queuedMessage.id, c.req.param("queuedId")), eq(queuedMessage.conversationId, id), eq(queuedMessage.userId, me.id)));
    const items = await queueOf(id, me.id);
    publishToUser(me.id, { type: "queue.updated", conversationId: id, items });
    return c.json(items);
  })

  /** Sends a waiting message now: it goes into the thread, and the bots take it after their current reply. */
  .post("/:id/queue/:queuedId/send", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    const [row] = await db
      .delete(queuedMessage)
      .where(and(eq(queuedMessage.id, c.req.param("queuedId")), eq(queuedMessage.conversationId, id), eq(queuedMessage.userId, me.id)))
      .returning();
    // Already sent (a second click, or the bots finished meanwhile): the queue as it is now.
    if (!row) return c.json(await queueOf(id, me.id));
    publishToUser(me.id, { type: "queue.updated", conversationId: id, items: await queueOf(id, me.id) });
    const body = messageBody.safeParse(row.body);
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const sent = await sendFromBody(conv, me, body.data);
    if ("error" in sent) return c.json({ error: sent.error }, 400);
    return c.json(sent.message, 201);
  })

  /**
   * Forwards a message to other conversations of the employee, as their own
   * message. Its files are copied: each conversation keeps its own.
   */
  .post("/:id/messages/:messageId/forward", async (c) => {
    const body = z.object({ conversationIds: ids.min(1).max(10) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const source = await loadConversation(me.id, c.req.param("id"));
    if (!source) return c.json({ error: "not_found" }, 404);
    const original = await getMessage(source.conversation.id, c.req.param("messageId"));
    if (!original || original.kind === "event") return c.json({ error: "not_found" }, 404);

    const targets = await Promise.all([...new Set(body.data.conversationIds)].map((t) => loadConversation(me.id, t)));
    if (targets.some((t) => !t)) return c.json({ error: "unknown_conversation" }, 404);
    const data = original.data as MessageData;
    const fileIds = (data?.attachments ?? []).map((a) => a.id);
    const files = fileIds.length
      ? await db.select().from(attachment).where(and(eq(attachment.conversationId, source.conversation.id), inArray(attachment.id, fileIds)))
      : [];
    if (files.length && !env.HERMES_HOME && targets.some((t) => t!.directBot)) return c.json({ error: "hermes_home_missing" }, 500);
    // Forwarding a forward keeps the first author.
    const forwarded = data?.forwarded ?? { authorName: original.author?.name ?? "?" };

    const sent = [];
    for (const target of targets) {
      const copies = [];
      for (const f of files) copies.push(await storeAttachment(target!, f.name, f.mime, Bun.file(f.path)));
      sent.push((await sendUserMessage(target!, me, { text: original.text, files: copies, forwarded })).id);
    }
    return c.json({ ids: sent }, 201);
  })

  /** Deletes a message for every member: one of your own, or a bot's. Events and colleagues' messages stay. */
  .delete("/:id/messages/:messageId", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const msg = await getMessage(conv.conversation.id, c.req.param("messageId"));
    if (!msg || msg.kind === "event") return c.json({ error: "not_found" }, 404);
    const mine = msg.kind === "user" && msg.author?.kind === "user" && msg.author.id === me.id;
    if (!mine && msg.kind !== "bot") return c.json({ error: "forbidden" }, 403);
    await deleteMessage(msg, conv.conversation.id);
    return c.body(null, 204);
  })

  /** Pinned messages and files, oldest first, with the message they belong to. */
  .get("/:id/pins", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select({ pin, pinnedByName: user.name })
      .from(pin)
      .leftJoin(user, eq(user.id, pin.pinnedBy))
      .where(eq(pin.conversationId, conv.conversation.id))
      .orderBy(asc(pin.createdAt));
    const byId = new Map((await getMessages(conv.conversation.id, [...new Set(rows.map((r) => r.pin.messageId))])).map((m) => [m.id, m]));
    return c.json(
      rows.flatMap(({ pin: p, pinnedByName }) => {
        const msg = byId.get(p.messageId);
        if (!msg) return [];
        const file = p.attachmentId ? (msg.data as MessageData)?.attachments?.find((a) => a.id === p.attachmentId) : undefined;
        if (p.attachmentId && !file) return [];
        return [{ id: p.id, pinnedAt: p.createdAt, pinnedBy: pinnedByName, message: msg, attachment: file ?? null }];
      }),
    );
  })

  /** Pins a message, or one of its files with `attachmentId`, for every member. */
  .post("/:id/pins", async (c) => {
    const body = z.object({ messageId: z.string().min(1).max(100), attachmentId: z.string().min(1).max(100).optional() }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    const msg = await getMessage(id, body.data.messageId);
    if (!msg || msg.kind === "event") return c.json({ error: "not_found" }, 404);
    const { attachmentId } = body.data;
    if (attachmentId && !(msg.data as MessageData)?.attachments?.some((a) => a.id === attachmentId)) return c.json({ error: "unknown_attachment" }, 400);
    await db
      .insert(pin)
      .values({ id: crypto.randomUUID(), conversationId: id, messageId: msg.id, attachmentId: attachmentId ?? null, pinnedBy: me.id })
      .onConflictDoNothing();
    await publishToConversation(id, { type: "pins.changed", conversationId: id });
    return c.body(null, 204);
  })

  .delete("/:id/pins", async (c) => {
    const body = z.object({ messageId: z.string().min(1).max(100), attachmentId: z.string().min(1).max(100).optional() }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;
    const { messageId, attachmentId } = body.data;
    await db
      .delete(pin)
      .where(and(eq(pin.conversationId, id), eq(pin.messageId, messageId), attachmentId ? eq(pin.attachmentId, attachmentId) : isNull(pin.attachmentId)));
    await publishToConversation(id, { type: "pins.changed", conversationId: id });
    return c.body(null, 204);
  })

  .post("/:id/read", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const at = new Date();
    await db
      .update(conversationMember)
      .set({ lastReadAt: at })
      .where(and(eq(conversationMember.conversationId, conv.conversation.id), eq(conversationMember.userId, me.id)));
    await publishToConversation(conv.conversation.id, { type: "read", conversationId: conv.conversation.id, userId: me.id, at: at.toISOString() });
    await quietly(markConversationRead(me.id, conv.conversation.id));
    return c.body(null, 204);
  })

  .post("/:id/typing", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    await publishToConversation(conv.conversation.id, { type: "typing", conversationId: conv.conversation.id, userId: me.id, name: me.name });
    return c.body(null, 204);
  })

  .post("/:id/turns/:turnId/cancel", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const result = cancelTurn(c.req.param("turnId"), conv.conversation.id, c.get("user").id);
    if (result === "not_found") return c.json({ error: "not_found" }, 404);
    if (result === "forbidden") return c.json({ error: "forbidden" }, 403);
    return c.body(null, 204);
  })

  /** Answer to an approval requested by the agent during its turn. */
  .post("/:id/turns/:turnId/approval", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const body = z
      .object({ approvalId: z.string().uuid(), choice: z.enum(["once", "session", "always", "deny"]) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const result = await answerTurnApproval(c.req.param("turnId"), conv.conversation.id, c.get("user"), body.data.approvalId, body.data.choice).catch(
      (err: Error) => {
        console.error("approval", err);
        return "hermes" as const;
      },
    );
    if (result === "not_found") return c.json({ error: tr(messages).notPending }, 404);
    if (result === "forbidden") return c.json({ error: tr(messages).requesterOnly }, 403);
    if (result === "invalid") return c.json({ error: tr(messages).invalidChoice }, 400);
    if (result === "hermes") return c.json({ error: tr(messages).hermesIgnored }, 502);
    return c.body(null, 204);
  })

  /**
   * Uploads a file, to be sent with the next message (see storeAttachment in attachments.ts).
   * The file is the raw body, its name in X-Agora-Filename (URI-encoded): written to disk as it
   * arrives. A multipart "file" field, what app builds before videos sent, is still read.
   */
  .post("/:id/attachments", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.directBot && !env.HERMES_HOME) return c.json({ error: "hermes_home_missing" }, 500);
    const rawName = c.req.header("x-agora-filename");
    if (rawName !== undefined) {
      const body = c.req.raw.body;
      if (!body || Number(c.req.header("content-length")) > MAX_FILE) return c.json({ error: "file_too_large", max: MAX_FILE }, 413);
      let name: string;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        return c.json({ error: "invalid" }, 400);
      }
      const mime = c.req.header("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
      const row = await streamAttachment(conv.conversation.id, conv.directBot?.agent.hermesProfile ?? null, name, mime, body);
      if (!row) return c.json({ error: "file_too_large", max: MAX_FILE }, 413);
      return c.json(publicAttachment(row), 201);
    }
    const file = (await c.req.parseBody())["file"];
    if (!(file instanceof File)) return c.json({ error: "missing_file" }, 400);
    if (file.size === 0 || file.size > MAX_FILE) return c.json({ error: "file_too_large", max: MAX_FILE }, 413);
    const row = await storeAttachment(conv, file.name, file.type || "application/octet-stream", file);
    return c.json(publicAttachment(row), 201);
  })

  /** What the employee can invoke with "/": active skills and allowed MCP servers for this bot. */
  .get("/:id/commands", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind === "group") {
      // Each bot's skills, tagged with the bot: picking one calls that bot.
      const perBot = await Promise.all(
        conv.agents.map(async ({ agent: a }) =>
          (await skills(a.hermesProfile).catch(() => [])).map(({ name, description, category }) => ({ name, description, category, agentId: a.id })),
        ),
      );
      return c.json({ skills: perBot.flat(), mcp: [] });
    }
    if (!conv.directBot) return c.json({ skills: [], mcp: [] });
    const profile = conv.directBot.agent.hermesProfile;
    const [skillList, mcp] = await Promise.all([skills(profile), agentMcpServers(profile)]);
    return c.json({
      skills: skillList.map(({ name, description, category }) => ({ name, description, category })),
      mcp: mcp.filter((m) => m.enabled).map(({ name, url, command }) => ({ name, description: url ?? command ?? "" })),
    });
  })

  /** Routines (Hermes cron jobs) the bot created from this conversation. */
  /**
   * The agent's screen, live (SSE): `state` {live}, then `frame` {data, url, …}
   * on each repaint. Opening this stream is what makes the API watch the
   * browser: the client only keeps it open while the screen is on display.
   */
  .get("/:id/screen", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return streamSSE(c, async (stream) => {
      // Only the latest frame matters: while a write is pending, newer frames replace older ones.
      let writing = false;
      let next: { event: string; data: string } | null = null;
      const flush = async () => {
        if (writing) return;
        writing = true;
        while (next && !stream.aborted) {
          const msg = next;
          next = null;
          await stream.writeSSE(msg).catch(() => {});
        }
        writing = false;
      };
      const send = (event: string, data: unknown) => {
        next = { event, data: JSON.stringify(data) };
        void flush();
      };
      const stop = watchScreen(conv.conversation.id, {
        frame: (f) => send("frame", f),
        state: (s) => send("state", s),
      });
      const ping = setInterval(() => !writing && !next && send("ping", {}), 25_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      stop();
    });
  })

  /** Wakes the asleep screen up: a blank browser of the conversation, on display for its members. */
  .post("/:id/screen/wake", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const ok = await wakeScreen(conv.conversation.id).catch(() => false);
    return ok ? c.body(null, 204) : c.json({ error: "no_browser" }, 503);
  })

  /**
   * Takes control of the screen: a click, a scroll, a key, pasted text, navigation or its size, forwarded to the
   * browser on display. Admins only: that browser reaches the server's own network (dev servers, services).
   */
  .post("/:id/screen/input", async (c) => {
    const at = { x: z.number().min(0).max(1), y: z.number().min(0).max(1) };
    const body = z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("click"), ...at }),
        z.object({ type: z.literal("wheel"), ...at, dx: z.number().min(-10_000).max(10_000), dy: z.number().min(-10_000).max(10_000) }),
        z.object({ type: z.literal("key"), key: z.string().min(1).max(40), code: z.string().max(40), keyCode: z.number().int().min(0).max(255), modifiers: z.number().int().min(0).max(15) }),
        z.object({ type: z.literal("text"), text: z.string().min(1).max(10_000) }),
        z.object({ type: z.literal("navigate"), url: z.string().url().max(2_000).refine((u) => /^https?:\/\//i.test(u)) }),
        z.object({ type: z.enum(["back", "forward", "reload"]) }),
        z.object({ type: z.literal("viewport"), viewport: z.enum(SCREEN_VIEWPORTS) }),
      ])
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    if (me.role !== "admin") return c.json({ error: "forbidden" }, 403);
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const done = await screenInput(conv.conversation.id, body.data).catch(() => false);
    return done ? c.body(null, 204) : c.json({ error: "no_screen" }, 409);
  })

  .get("/:id/routines", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!conv.directBot) return c.json([]);
    return c.json(await listRoutines(conv.directBot.agent.hermesProfile, conv.conversation.id));
  })

  /** Rename, reschedule, pause or resume one of this conversation's routines. */
  .patch("/:id/routines/:routineId", async (c) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        schedule: z.string().trim().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv?.directBot) return c.json({ error: "not_found" }, 404);
    const profile = conv.directBot.agent.hermesProfile;
    const routineId = c.req.param("routineId");
    if (!(await findRoutine(profile, conv.conversation.id, routineId))) return c.json({ error: "not_found" }, 404);
    try {
      await updateRoutine(profile, routineId, body.data);
    } catch (err) {
      if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
    return c.json(await findRoutine(profile, conv.conversation.id, routineId));
  })

  .delete("/:id/routines/:routineId", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv?.directBot) return c.json({ error: "not_found" }, 404);
    const profile = conv.directBot.agent.hermesProfile;
    const routineId = c.req.param("routineId");
    if (!(await findRoutine(profile, conv.conversation.id, routineId))) return c.json({ error: "not_found" }, 404);
    try {
      await deleteRoutine(profile, routineId);
    } catch (err) {
      if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
      throw err;
    }
    return c.body(null, 204);
  })

  /** Hermes session commands of a direct conversation: /new starts over, /compact summarizes then starts over. */
  .post("/:id/session", async (c) => {
    const body = z.object({ action: z.enum(["new", "compact"]) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv?.directBot) return c.json({ error: "not_found" }, 404);
    if (body.data.action === "new") resetSession(conv.conversation.id, conv.directBot.agent.id, me);
    else compactSession(conv.conversation.id, conv.directBot.agent.id, me);
    return c.body(null, 202);
  })

  /** /retry: the bot answers the employee's last message again. */
  .post("/:id/retry", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv?.directBot) return c.json({ error: "not_found" }, 404);
    const [last] = await db
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.conversationId, conv.conversation.id), eq(message.kind, "user")))
      .orderBy(desc(message.createdAt))
      .limit(1);
    if (!last) return c.json({ error: "nothing_to_retry" }, 409);
    const turnId = enqueueTurn({ conversationId: conv.conversation.id, agentId: conv.directBot.agent.id, triggerId: last.id, requestedBy: me.id, chain: newChain(), retry: true });
    return c.json({ turnId }, 202);
  })

  /** /context: how full the bot's current Hermes session is. */
  .get("/:id/context", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv?.directBot) return c.json({ error: "not_found" }, 404);
    const { agent: bot, link } = conv.directBot;
    const base = { generation: link.sessionGeneration, compacted: !!link.carryOver };
    // Claude Code and Codex keep their sessions outside Hermes.
    if (isClaudeCodeModel(link.model)) return c.json({ ...base, engine: "claude-code" as const, model: link.model!.split("::")[1]!, session: null });
    if (isCodexModel(link.model)) return c.json({ ...base, engine: "codex" as const, model: link.model!.split("::")[1]!, session: null });
    const session = env.HERMES_HOME
      ? await sessionContext(bot.hermesProfile, hermesSessionId(conv.conversation.id, bot.revision, undefined, link.sessionGeneration)).catch((err) => {
          console.error("context: state.db", err);
          return null;
        })
      : null;
    return c.json({ ...base, engine: "hermes" as const, model: session?.model ?? link.model?.split("::")[1] ?? null, session });
  })

  /** Models offered by Hermes for the bot's provider and the other signed-in ones, Claude Code's and Codex's (minus those blocked for the employee), and the one chosen here with its effort and fast mode. */
  .get("/:id/models", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    const bot = conv && modelTarget(conv, c.req.query("agent"));
    if (!conv || !bot) return c.json({ error: "not_found" }, 404);
    const offer = await pickable(bot.agent.hermesProfile, c.get("user")).catch((err) => {
      console.error("models: Hermes unavailable", err instanceof Error ? err.message : err);
      return null;
    });
    // Hermes restarting or down: the picker hides until it answers again.
    if (!offer) return c.json({ error: "hermes_unavailable" }, 503);
    const { options, claudeCode, codex } = offer;
    let [selectedProvider = null, selected = null] = bot.link.model?.split("::") ?? [];
    // Older threads stored a Claude Code alias ("opus[1m]"): shown as the exact model it points to.
    if (selectedProvider === CLAUDE_CODE_PROVIDER && selected) selected = resolveClaudeCodeModel(selected);
    // Choice has since been blocked or withdrawn: the thread falls back to an allowed model on the next message.
    // (Claude Code or Codex list unavailable: its choice is kept, the bot-runner decides at the next turn.)
    const listed = (selectedProvider !== CLAUDE_CODE_PROVIDER || claudeCode) && (selectedProvider !== CODEX_PROVIDER || codex);
    if (selected && listed && !modelInfo(offer, bot.link.model)) [selectedProvider, selected] = [null, null];
    return c.json({ ...options, selected, selectedProvider, claudeCode, codex, effort: bot.link.effort, fast: bot.link.fast });
  })

  .put("/:id/model", async (c) => {
    const body = z
      .object({ model: z.string().max(120).nullable(), provider: z.string().max(60).optional(), agentId: z.string().max(64).optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    const bot = conv && modelTarget(conv, body.data.agentId);
    if (!conv || !bot) return c.json({ error: "not_found" }, 404);
    if (body.data.provider === CLAUDE_CODE_PROVIDER && !canUseClaudeCode(c.get("user"))) return c.json({ error: "forbidden" }, 403);
    if (body.data.provider === CODEX_PROVIDER && !canUseCodex(c.get("user"))) return c.json({ error: "forbidden" }, 403);
    const offer = await pickable(bot.agent.hermesProfile, c.get("user"));
    const value = body.data.model ? `${body.data.provider ?? offer.options.provider}::${body.data.model}` : null;
    if (!value && !offer.options.defaultAllowed) return c.json({ error: "forbidden_model" }, 403);
    const info = modelInfo(offer, value);
    if (value && !info) return c.json({ error: "unknown_model" }, 400);
    // The effort and fast mode follow the new model when it has them, and go back to its defaults otherwise.
    const effort = bot.link.effort && info?.efforts?.includes(bot.link.effort) ? bot.link.effort : null;
    const fast = bot.link.fast && !!info?.fast;
    await db
      .update(conversationAgent)
      .set({ model: value, effort, fast })
      .where(and(eq(conversationAgent.conversationId, conv.conversation.id), eq(conversationAgent.agentId, bot.agent.id)));
    return c.body(null, 204);
  })

  /** The effort and fast mode of the bot's model here, among the ones that model has. */
  .put("/:id/reasoning", async (c) => {
    const body = z
      .object({ effort: z.string().max(20).nullable(), fast: z.boolean(), agentId: z.string().max(64).optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    const bot = conv && modelTarget(conv, body.data.agentId);
    if (!conv || !bot) return c.json({ error: "not_found" }, 404);
    const info = modelInfo(await pickable(bot.agent.hermesProfile, c.get("user")), bot.link.model);
    if (body.data.effort && !info?.efforts?.includes(body.data.effort)) return c.json({ error: "unsupported_effort" }, 400);
    if (body.data.fast && !info?.fast) return c.json({ error: "unsupported_fast" }, 400);
    await db
      .update(conversationAgent)
      .set({ effort: body.data.effort, fast: body.data.fast })
      .where(and(eq(conversationAgent.conversationId, conv.conversation.id), eq(conversationAgent.agentId, bot.agent.id)));
    return c.body(null, 204);
  });
