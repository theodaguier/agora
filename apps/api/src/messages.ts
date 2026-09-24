import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { renderEvent, type ConversationEvent } from "@agora/core";
import { publishToConversation } from "./events";
import { orgLocale } from "./i18n";
import { notifyMessage, quietly } from "./inbox";
import { pushDirectMessage } from "./push";

const { agent, message, user } = schema;

type MessageRow = typeof message.$inferSelect;
type AgentRow = typeof agent.$inferSelect;

export type Author =
  | { kind: "user"; id: string; name: string; image: string | null }
  | { kind: "agent"; id: string; name: string; avatar: { shape: AgentRow["avatarShape"]; color: string } }
  | null;

export const userAuthor = (u: { id: string; name: string; image?: string | null }): Author => ({
  kind: "user",
  id: u.id,
  name: u.name,
  image: u.image ?? null,
});

export const agentAuthor = (a: AgentRow): Author => ({
  kind: "agent",
  id: a.id,
  name: a.name,
  avatar: { shape: a.avatarShape, color: a.avatarColor },
});

export const toDto = (m: MessageRow, author: Author) => ({
  id: m.id,
  kind: m.kind,
  text: m.text,
  data: m.data,
  createdAt: m.createdAt,
  author,
});

export type MessageDto = ReturnType<typeof toDto>;

const authorColumns = {
  message,
  userName: user.name,
  userImage: user.image,
  agent,
};

function withAuthor(r: { message: MessageRow; userName: string | null; userImage: string | null; agent: AgentRow | null }) {
  const m = r.message;
  if (m.authorUserId && r.userName) return toDto(m, userAuthor({ id: m.authorUserId, name: r.userName, image: r.userImage }));
  if (m.authorAgentId && r.agent) return toDto(m, agentAuthor(r.agent));
  return toDto(m, null);
}

/** The latest messages of a conversation, oldest to newest, with their authors. */
export async function listMessages(conversationId: string, limit = 500) {
  const rows = await db
    .select(authorColumns)
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(eq(message.conversationId, conversationId))
    .orderBy(sql`${message.createdAt} desc`)
    .limit(limit);
  return rows.reverse().map(withAuthor);
}

/**
 * What a group bot hasn't seen yet: messages after its `seenUntil`, up to and
 * including the triggering message. Bounds are compared in SQL: Postgres keeps
 * microseconds, which a JS Date would truncate.
 */
export async function unseenMessages(conversationId: string, agentId: string, triggerId: string, limit = 50) {
  const until = sql`(select ${message.createdAt} from ${message} where ${message.id} = ${triggerId})`;
  const after = sql`coalesce((select ${schema.conversationAgent.seenUntil} from ${schema.conversationAgent} where ${schema.conversationAgent.conversationId} = ${conversationId} and ${schema.conversationAgent.agentId} = ${agentId}), '-infinity'::timestamp)`;
  const rows = await db
    .select(authorColumns)
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(and(eq(message.conversationId, conversationId), sql`${message.createdAt} <= ${until}`, sql`${message.createdAt} > ${after}`))
    .orderBy(sql`${message.createdAt} desc`)
    .limit(limit);
  return rows.reverse().map(withAuthor);
}

/** One message of a conversation, with its author. */
export async function getMessage(conversationId: string, id: string) {
  const [row] = await db
    .select(authorColumns)
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(and(eq(message.conversationId, conversationId), eq(message.id, id)));
  return row ? withAuthor(row) : null;
}

/** Several messages of a conversation, with their authors, oldest to newest. */
export async function getMessages(conversationId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select(authorColumns)
    .from(message)
    .leftJoin(user, eq(user.id, message.authorUserId))
    .leftJoin(agent, eq(agent.id, message.authorAgentId))
    .where(and(eq(message.conversationId, conversationId), inArray(message.id, ids)))
    .orderBy(message.createdAt);
  return rows.map(withAuthor);
}

/** Saves a message and pushes it to the conversation's members. */
export async function postMessage(values: typeof message.$inferInsert, author: Author) {
  const [row] = await db.insert(message).values(values).returning();
  const dto = toDto(row!, author);
  await db.update(schema.conversation).set({ updatedAt: new Date() }).where(eq(schema.conversation.id, row!.conversationId));
  await publishToConversation(row!.conversationId, { type: "message.created", conversationId: row!.conversationId, message: dto });
  await quietly(notifyMessage(row!));
  void quietly(pushDirectMessage(row!));
  return dto;
}

/**
 * System message ("Théo added Legal"). The event is kept in `data` so each member
 * reads it in their language; `text` is its rendering in the organization's.
 */
export const postEvent = async (conversationId: string, event: ConversationEvent) =>
  postMessage({ id: crypto.randomUUID(), conversationId, kind: "event", text: renderEvent(event, await orgLocale()), data: { event } }, null);
