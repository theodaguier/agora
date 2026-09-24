import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { ConversationEvent } from "@agora/core";
import { db, schema } from "./db";
import { directKey } from "./group";

const { agent, agentAccess, conversation, conversationAgent, conversationMember, message, task, user } = schema;

const TASK_REF = /\[\[task:([\w-]{1,64})\]\]/g;

type AgentRow = typeof agent.$inferSelect;

export const agentDto = (a: AgentRow) => ({
  id: a.id,
  name: a.name,
  avatar: { shape: a.avatarShape, color: a.avatarColor },
  onboarding: a.onboarding,
});

/** Agents an employee is allowed to use. */
export async function accessibleAgentIds(userId: string) {
  const rows = await db.select({ id: agentAccess.agentId }).from(agentAccess).where(eq(agentAccess.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Conversation as seen by a member, with its participants. A direct
 * conversation with a bot is only accessible while the employee has access to
 * the bot; a group, on the other hand, grants access to its bots.
 */
export async function loadConversation(userId: string, conversationId: string) {
  const [row] = await db
    .select({ conversation, member: conversationMember })
    .from(conversationMember)
    .innerJoin(conversation, eq(conversation.id, conversationMember.conversationId))
    .where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId)));
  if (!row) return null;
  const [members, agents] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, image: user.image, email: user.email })
      .from(conversationMember)
      .innerJoin(user, eq(user.id, conversationMember.userId))
      .where(eq(conversationMember.conversationId, conversationId))
      .orderBy(conversationMember.joinedAt),
    db
      .select({ agent, link: conversationAgent })
      .from(conversationAgent)
      .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
      .where(eq(conversationAgent.conversationId, conversationId))
      .orderBy(conversationAgent.createdAt),
  ]);
  const directBot = row.conversation.kind === "direct" && agents.length === 1 ? agents[0]! : null;
  if (directBot && !(await accessibleAgentIds(userId)).has(directBot.agent.id)) return null;
  return { ...row, members, agents, directBot };
}

export type LoadedConversation = NonNullable<Awaited<ReturnType<typeof loadConversation>>>;

/** Opens (or creates) the direct conversation between an employee and a bot. */
export async function openDirectWithAgent(userId: string, agentId: string) {
  const key = directKey({ kind: "user", id: userId }, { kind: "agent", id: agentId });
  await db
    .insert(conversation)
    .values({ id: crypto.randomUUID(), kind: "direct", directKey: key, createdBy: userId })
    .onConflictDoNothing({ target: conversation.directKey });
  const [conv] = await db.select().from(conversation).where(eq(conversation.directKey, key));
  await db.insert(conversationMember).values({ conversationId: conv!.id, userId }).onConflictDoNothing();
  await db.insert(conversationAgent).values({ conversationId: conv!.id, agentId, addedBy: userId }).onConflictDoNothing();
  return conv!.id;
}

/** Opens (or creates) the direct conversation between two employees. */
export async function openDirectWithUser(userId: string, otherId: string) {
  const key = directKey({ kind: "user", id: userId }, { kind: "user", id: otherId });
  await db
    .insert(conversation)
    .values({ id: crypto.randomUUID(), kind: "direct", directKey: key, createdBy: userId })
    .onConflictDoNothing({ target: conversation.directKey });
  const [conv] = await db.select().from(conversation).where(eq(conversation.directKey, key));
  await db
    .insert(conversationMember)
    .values([
      { conversationId: conv!.id, userId },
      { conversationId: conv!.id, userId: otherId },
    ])
    .onConflictDoNothing();
  return conv!.id;
}

/** Every accessible bot gets its direct conversation, like the former threads. */
async function ensureDirectBotConversations(userId: string) {
  const missing = await db
    .select({ agentId: agentAccess.agentId })
    .from(agentAccess)
    .where(
      and(
        eq(agentAccess.userId, userId),
        notInArray(
          agentAccess.agentId,
          db
            .select({ id: conversationAgent.agentId })
            .from(conversationAgent)
            .innerJoin(conversationMember, eq(conversationMember.conversationId, conversationAgent.conversationId))
            .innerJoin(conversation, eq(conversation.id, conversationAgent.conversationId))
            .where(and(eq(conversationMember.userId, userId), eq(conversation.kind, "direct"))),
        ),
      ),
    );
  for (const m of missing) await openDirectWithAgent(userId, m.agentId);
}

/** Sidebar list: all of the employee's conversations, most recent first. */
export async function listConversations(userId: string) {
  await ensureDirectBotConversations(userId);
  const last = db
    .select({
      conversationId: message.conversationId,
      text: sql<string>`(array_agg(${message.text} order by ${message.createdAt} desc))[1]`.as("text"),
      kind: sql<string>`(array_agg(${message.kind} order by ${message.createdAt} desc))[1]`.as("last_kind"),
      event: sql<ConversationEvent | null>`(array_agg(${message.data} -> 'event' order by ${message.createdAt} desc))[1]`.as("last_event"),
      authorUserId: sql<string | null>`(array_agg(${message.authorUserId} order by ${message.createdAt} desc))[1]`.as("last_user"),
      authorAgentId: sql<string | null>`(array_agg(${message.authorAgentId} order by ${message.createdAt} desc))[1]`.as("last_agent"),
      // mapWith: without it, an aggregate comes back as text without a time zone, read as local time by the client.
      at: sql<Date>`max(${message.createdAt})`.mapWith(message.createdAt).as("at"),
      otherAt: sql<Date | null>`max(${message.createdAt}) filter (where ${message.kind} <> 'event' and ${message.authorUserId} is distinct from ${userId})`
        .mapWith(message.createdAt)
        .as("other_at"),
    })
    .from(message)
    .groupBy(message.conversationId)
    .as("last");

  const rows = await db
    .select({
      conversation,
      readAt: conversationMember.lastReadAt,
      last: { text: last.text, kind: last.kind, event: last.event, authorUserId: last.authorUserId, authorAgentId: last.authorAgentId, at: last.at, otherAt: last.otherAt },
    })
    .from(conversationMember)
    .innerJoin(conversation, eq(conversation.id, conversationMember.conversationId))
    .leftJoin(last, eq(last.conversationId, conversation.id))
    .where(eq(conversationMember.userId, userId))
    .orderBy(desc(sql`coalesce(${last.at}, ${conversation.createdAt})`));
  if (!rows.length) return [];

  const ids = rows.map((r) => r.conversation.id);
  const [members, agents, access] = await Promise.all([
    db
      .select({ conversationId: conversationMember.conversationId, id: user.id, name: user.name, image: user.image })
      .from(conversationMember)
      .innerJoin(user, eq(user.id, conversationMember.userId))
      .where(inArray(conversationMember.conversationId, ids))
      .orderBy(conversationMember.joinedAt),
    db
      .select({ conversationId: conversationAgent.conversationId, agent })
      .from(conversationAgent)
      .innerJoin(agent, eq(agent.id, conversationAgent.agentId))
      .where(inArray(conversationAgent.conversationId, ids))
      .orderBy(conversationAgent.createdAt),
    accessibleAgentIds(userId),
  ]);
  // A task cited by a bot ("[[task:<id>]]") shows as its title in the preview.
  const cited = [...new Set(rows.flatMap((r) => [...(r.last?.text ?? "").matchAll(TASK_REF)].map((m) => m[1]!)))];
  const titles = new Map(
    cited.length ? (await db.select({ id: task.id, title: task.title }).from(task).where(inArray(task.id, cited))).map((t) => [t.id, t.title]) : [],
  );
  const previewText = (text: string) => text.replace(TASK_REF, (_, id: string) => `« ${titles.get(id) ?? "…"} »`);

  return rows.flatMap(({ conversation: c, readAt, last: l }) => {
    const people = members.filter((m) => m.conversationId === c.id).map(({ id, name, image }) => ({ id, name, image }));
    const bots = agents.filter((a) => a.conversationId === c.id).map((a) => a.agent);
    const isDirectBot = c.kind === "direct" && bots.length === 1;
    if (isDirectBot && !access.has(bots[0]!.id)) return [];
    // A direct conversation between employees only shows up for the other person after the first message.
    if (c.kind === "direct" && !bots.length && !l?.at && c.createdBy !== userId) return [];
    const fromMe = l?.authorUserId === userId;
    const author = people.find((p) => p.id === l?.authorUserId)?.name ?? bots.find((b) => b.id === l?.authorAgentId)?.name ?? null;
    return [
      {
        id: c.id,
        kind: c.kind,
        title: c.title,
        members: people,
        agents: bots.map(agentDto),
        preview: l?.text ? { text: previewText(l.text), event: l.event ?? null, author: l.kind === "event" ? null : author, fromMe } : null,
        lastAt: l?.at ?? c.createdAt,
        unread: !!l?.otherAt && new Date(l.otherAt) > new Date(readAt),
      },
    ];
  });
}
