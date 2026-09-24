import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { abandonTurns, activeTurns, answerTurnApproval, cancelTurn, compactSession, enqueueTurn, resetSession } from "../bot-runner";
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
import { env } from "../env";
import { forgetMembers, publishToConversation, publishToUser } from "../events";
import { CLAUDE_CODE_LABEL, CLAUDE_CODE_PROVIDER, canUseClaudeCode, isClaudeCodeModel, resolveClaudeCodeModel } from "../claude-code";
import { profileHome, skills } from "../hermes";
import { HermesError, agentMcpServers, forgetSessions } from "../hermes-admin";
import { syncSessionSearch } from "../session-search";
import { allowedClaudeCodeModels, allowedModelOptions } from "../models";
import { deleteRoutine, findRoutine, listRoutines, updateRoutine } from "../routines";
import { watchScreen } from "../screen";
import { excerpt, groupCalls, newChain, type Forwarded, type ReplyTo } from "../group";
import { getMessage, getMessages, listMessages, postEvent, postMessage, userAuthor, type MessageDto } from "../messages";
import { requireUser, type AppEnv } from "../middleware";
import { markConversationRead, quietly } from "../inbox";
import { defineMessages, tr } from "../i18n";
import { allowedInvocations, type AttachmentRow, type Invocation } from "../prompt";
import { sessionContext } from "../session-context";
import { parseDraft } from "../views";
import type { ViewAction, ViewBlock } from "@agora/core";

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

const { agent, attachment, conversation, conversationAgent, conversationMember, message, pin, user } = schema;

const MAX_FILE = 25 * 1024 * 1024;

const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "fichier";

const detail = (c: LoadedConversation) => ({
  id: c.conversation.id,
  kind: c.conversation.kind,
  title: c.conversation.title,
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
 * Where a conversation's files go: the bot's Hermes profile in a direct
 * conversation with it (readable by its file tools), a per-conversation
 * shared folder otherwise (groups, colleague to colleague).
 */
/**
 * The bot whose model is read or chosen: the bot of a direct conversation, or in a group the one named
 * (`agentId`), each bot keeping its own model there (bot-runner reads it per bot).
 */
function modelTarget(conv: LoadedConversation, agentId: string | undefined) {
  if (conv.directBot) return !agentId || agentId === conv.directBot.agent.id ? conv.directBot : null;
  return agentId ? (conv.agents.find((a) => a.agent.id === agentId) ?? null) : null;
}

function attachmentDir(conv: LoadedConversation) {
  if (conv.directBot) {
    if (!env.HERMES_HOME) throw new Error("hermes_home_missing");
    return join(profileHome(conv.directBot.agent.hermesProfile), "attachments", "agora");
  }
  return join(env.HERMES_HOME || join(homedir(), ".agora"), "agora-attachments", conv.conversation.id);
}

async function storeAttachment(conv: LoadedConversation, name: string, mime: string, content: Blob) {
  const id = crypto.randomUUID();
  const dir = attachmentDir(conv);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}-${safeName(name)}`);
  await Bun.write(path, content);
  const row = { id, conversationId: conv.conversation.id, name: name.slice(0, 200), mime, size: content.size, path };
  const [saved] = await db.insert(attachment).values(row).returning();
  return saved!;
}

const publicAttachment = ({ id, name, mime, size }: Pick<AttachmentRow, "id" | "name" | "mime" | "size">) => ({ id, name, mime, size });

type Outgoing = {
  text: string;
  files: AttachmentRow[];
  invocations?: Invocation[];
  mentions?: string[];
  replyTo?: ReplyTo;
  forwarded?: Forwarded;
  viewAction?: ViewAction;
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
  // In a group: the mentioned bots, and those the message is likely addressed to.
  const calls = conv.directBot
    ? [{ agentId: conv.directBot.agent.id }]
    : conv.conversation.kind === "group"
      ? groupCalls({
          text: out.forwarded ? "" : out.text,
          mentions: out.mentions ?? [],
          repliedTo: out.replyTo?.authorAgentId,
          agents: conv.agents.map((a) => ({ id: a.agent.id, name: a.agent.name })),
          lastBot: last?.kind === "bot" && last.agentId ? { agentId: last.agentId, at: last.at } : null,
          now: new Date(),
        })
      : [];
  const chain = newChain();
  for (const call of calls) enqueueTurn({ conversationId: id, ...call, triggerId: msg.id, requestedBy: me.id, chain });
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

  .get("/:id", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(detail(conv));
  })

  .patch("/:id", async (c) => {
    const body = z.object({ title: z.string().trim().max(80) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.conversation.kind !== "group") return c.json({ error: "not_a_group" }, 400);
    const title = body.data.title || null;
    await db.update(conversation).set({ title }).where(eq(conversation.id, conv.conversation.id));
    await postEvent(conv.conversation.id, title ? { type: "group.renamed", actor: me.name, title } : { type: "group.unnamed", actor: me.name });
    await publishToConversation(conv.conversation.id, { type: "conversation.updated", conversationId: conv.conversation.id });
    return c.body(null, 204);
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
    if (people.length) await db.insert(conversationMember).values(people.map((p) => ({ conversationId: id, userId: p.id }))).onConflictDoNothing();
    if (bots.length) await db.insert(conversationAgent).values(bots.map((b) => ({ conversationId: id, agentId: b.id, addedBy: me.id }))).onConflictDoNothing();
    forgetMembers(id);
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
    const body = z
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
      .refine((b) => b.text || b.attachmentIds.length || b.invocations.length)
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    const id = conv.conversation.id;

    const files = body.data.attachmentIds.length
      ? await db.select().from(attachment).where(and(eq(attachment.conversationId, id), inArray(attachment.id, body.data.attachmentIds)))
      : [];
    if (files.length !== body.data.attachmentIds.length) return c.json({ error: "unknown_attachment" }, 400);
    // Invocations target a specific bot: the direct one, or in a group the bot whose skill was picked (skills only).
    const invocations = conv.directBot
      ? await allowedInvocations(conv.directBot.agent.hermesProfile, id, body.data.invocations)
      : conv.conversation.kind === "group"
        ? await groupInvocations(conv, id, body.data.invocations)
        : [];
    // A bot whose skill is invoked is called as if mentioned.
    const invoked = invocations.flatMap((v) => (v.kind !== "routine" && v.agentId ? [v.agentId] : []));
    const mentions =
      conv.conversation.kind === "group" ? [...new Set([...body.data.mentions, ...invoked])].filter((m) => conv.agents.some((a) => a.agent.id === m)) : [];
    let replyTo: ReplyTo | undefined;
    if (body.data.replyTo) {
      const quoted = await getMessage(id, body.data.replyTo);
      if (!quoted || quoted.kind === "event") return c.json({ error: "unknown_reply" }, 400);
      replyTo = replySnapshot(quoted);
    }

    let viewAction: ViewAction | undefined;
    if (body.data.viewAction) {
      const { messageId, index, action, draft, note } = body.data.viewAction;
      const source = await getMessage(id, messageId);
      const view = (source?.data as { views?: ViewBlock[] } | null)?.views?.[index];
      if (source?.kind !== "bot" || view?.kind !== "draft") return c.json({ error: "unknown_draft" }, 400);
      // Confirmed or to rework: the values as the employee left them (edited or not).
      const values = action === "cancel" ? undefined : parseDraft(view.type, draft ?? view.draft);
      if (values === null) return c.json({ error: "invalid_draft" }, 400);
      viewAction = { messageId, index, action, type: view.type, ...(values && { draft: values }), ...(action === "revise" && { note }) };
      // In a group, the answer goes to the bot that wrote the draft.
      if (source.author?.kind === "agent" && conv.conversation.kind === "group" && !mentions.includes(source.author.id)) mentions.push(source.author.id);
    }

    const msg = await sendUserMessage(conv, me, { text: body.data.text, files, invocations, mentions, replyTo, viewAction });
    return c.json(msg, 201);
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

  /** Uploads a file, to be sent with the next message (see attachmentDir). */
  .post("/:id/attachments", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (conv.directBot && !env.HERMES_HOME) return c.json({ error: "hermes_home_missing" }, 500);
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
        state: (live) => send("state", { live }),
      });
      const ping = setInterval(() => !writing && !next && send("ping", {}), 25_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      stop();
    });
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
    // Claude Code keeps its sessions outside Hermes.
    if (isClaudeCodeModel(link.model)) return c.json({ ...base, engine: "claude-code" as const, model: link.model!.split("::")[1]!, session: null });
    const session = env.HERMES_HOME
      ? await sessionContext(bot.hermesProfile, hermesSessionId(conv.conversation.id, bot.revision, undefined, link.sessionGeneration)).catch((err) => {
          console.error("context: state.db", err);
          return null;
        })
      : null;
    return c.json({ ...base, engine: "hermes" as const, model: session?.model ?? link.model?.split("::")[1] ?? null, session });
  })

  /** Models offered by Hermes for the bot's provider and the other signed-in ones, and Claude Code's (minus those blocked for the employee), and the one chosen here. */
  .get("/:id/models", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    const bot = conv && modelTarget(conv, c.req.query("agent"));
    if (!conv || !bot) return c.json({ error: "not_found" }, 404);
    const options = await allowedModelOptions(bot.agent.hermesProfile, c.get("user").id).catch((err) => {
      console.error("models: Hermes unavailable", err instanceof Error ? err.message : err);
      return null;
    });
    // Hermes restarting or down: the picker hides until it answers again.
    if (!options) return c.json({ error: "hermes_unavailable" }, 503);
    let [selectedProvider = null, selected = null] = bot.link.model?.split("::") ?? [];
    // Claude Code unavailable (binary missing, not logged in): the section is simply not offered.
    const ccModels = canUseClaudeCode(c.get("user"))
      ? await allowedClaudeCodeModels(c.get("user").id).catch((err) => (console.error("claude code: models", err), []))
      : [];
    const claudeCode = ccModels.length ? { provider: CLAUDE_CODE_PROVIDER, label: CLAUDE_CODE_LABEL, models: ccModels } : null;
    // Older threads stored a Claude Code alias ("opus[1m]"): shown as the exact model it points to.
    if (selectedProvider === CLAUDE_CODE_PROVIDER && selected) selected = resolveClaudeCodeModel(selected);
    // Choice has since been blocked or withdrawn: the thread falls back to an allowed model on the next message.
    const groups = [{ provider: options.provider, models: options.models }, ...options.others, ...(claudeCode ? [claudeCode] : [])];
    // (Claude Code list unavailable: its choice is kept, the bot-runner decides at the next turn.)
    if (selected && (selectedProvider !== CLAUDE_CODE_PROVIDER || claudeCode) && !groups.some((g) => g.provider === selectedProvider && g.models.some((m) => m.id === selected))) {
      [selectedProvider, selected] = [null, null];
    }
    return c.json({ ...options, selected, selectedProvider, claudeCode });
  })

  .put("/:id/model", async (c) => {
    const body = z
      .object({ model: z.string().max(120).nullable(), provider: z.string().max(60).optional(), agentId: z.string().max(64).optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const conv = await loadConversation(c.get("user").id, c.req.param("id"));
    const bot = conv && modelTarget(conv, body.data.agentId);
    if (!conv || !bot) return c.json({ error: "not_found" }, 404);
    let value: string | null = null;
    if (body.data.model && body.data.provider === CLAUDE_CODE_PROVIDER) {
      if (!canUseClaudeCode(c.get("user"))) return c.json({ error: "forbidden" }, 403);
      const models = await allowedClaudeCodeModels(c.get("user").id).catch(() => []);
      if (!models.some((m) => m.id === body.data.model)) return c.json({ error: "unknown_model" }, 400);
      value = `${CLAUDE_CODE_PROVIDER}::${body.data.model}`;
    } else if (body.data.model) {
      const options = await allowedModelOptions(bot.agent.hermesProfile, c.get("user").id);
      const provider = body.data.provider ?? options.provider;
      const group = provider === options.provider ? options : options.others.find((p) => p.provider === provider);
      if (!group?.models.some((m) => m.id === body.data.model)) return c.json({ error: "unknown_model" }, 400);
      value = `${provider}::${body.data.model}`;
    } else {
      const options = await allowedModelOptions(bot.agent.hermesProfile, c.get("user").id);
      if (!options.defaultAllowed) return c.json({ error: "forbidden_model" }, 403);
    }
    await db
      .update(conversationAgent)
      .set({ model: value })
      .where(and(eq(conversationAgent.conversationId, conv.conversation.id), eq(conversationAgent.agentId, bot.agent.id)));
    return c.body(null, 204);
  });
