/**
 * Inbox: what concerns someone personally — a mention or a reply in a group,
 * a task they were put on, a task they created that someone else completed.
 * Direct conversations stay out: their unread badge already says it all.
 */
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isSimple, withHandles } from "@agora/core";
import { simple as simpleMessages } from "@agora/core/i18n";
import { openDirectWithAgent } from "./conversations";
import { agentAuthor, postMessage } from "./messages";
import { userLocale } from "./org";
import { db, schema } from "./db";
import type { NotificationKind } from "./db/schema";
import { publishToUser } from "./events";
import { pushInbox } from "./push";
import { excerpt } from "./group";

const { agent, agentAccess, conversation, conversationMember, message, notification, task, user } = schema;

type Actor = { userId?: string | null; agentId?: string | null };
type NewNotification = { userId: string; kind: NotificationKind; conversationId?: string | null; messageId?: string | null; taskId?: string | null; text: string };

async function notify(rows: NewNotification[], actor: Actor) {
  // Nobody is notified of their own doing.
  const kept = rows.filter((r) => r.userId !== actor.userId);
  if (!kept.length) return;
  await db.insert(notification).values(
    kept.map((r) => ({ ...r, id: crypto.randomUUID(), actorUserId: actor.userId ?? null, actorAgentId: actor.agentId ?? null })),
  );
  for (const userId of new Set(kept.map((r) => r.userId))) publishToUser(userId, { type: "inbox.changed" });
  // The simple interface has no inbox: their assistant brings it to their chat, and that message is what notifies them.
  const relayed = await relayToChat(kept, actor).catch((err) => {
    console.error("inbox: relay to chat", err);
    return new Set<string>();
  });
  // Not awaited: Expo's service must not slow down what triggered the notification.
  void pushInbox(
    kept.filter((r) => !relayed.has(r.userId)),
    actor,
  );
}

/**
 * Simple interface (@agora/core isSimple): each notification also comes as a message from their assistant
 * (the first bot they can use) in their direct conversation with it, quoting what happened and linking to it.
 * Returns who got one.
 */
async function relayToChat(rows: NewNotification[], actor: Actor) {
  const people = await db
    .select({ id: user.id, role: user.role, uiMode: user.uiMode, locale: user.locale })
    .from(user)
    .where(inArray(user.id, [...new Set(rows.map((r) => r.userId))]));
  const simple = new Map(people.filter(isSimple).map((p) => [p.id, p]));
  const done = new Set<string>();
  if (!simple.size) return done;
  const [actorUser] = actor.userId ? await db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)) : [];
  const [actorAgent] = !actorUser && actor.agentId ? await db.select({ name: agent.name }).from(agent).where(eq(agent.id, actor.agentId)) : [];
  const who = actorUser?.name ?? actorAgent?.name ?? "?";
  const sources = [...new Set(rows.map((r) => r.conversationId).filter((id): id is string => !!id))];
  const titles = new Map(
    sources.length ? (await db.select({ id: conversation.id, title: conversation.title }).from(conversation).where(inArray(conversation.id, sources))).map((c) => [c.id, c.title]) : [],
  );
  for (const r of rows) {
    const person = simple.get(r.userId);
    if (!person) continue;
    const bot = await assistantOf(r.userId);
    if (!bot) continue;
    const t = simpleMessages[await userLocale(person.locale)];
    const where = (r.conversationId && titles.get(r.conversationId)) || "…";
    const text = r.kind === "task.assigned" ? t.taskFor(who) : r.kind === "task.done" ? t.taskDone(who) : t.wroteIn(who, where);
    const conversationId = await openDirectWithAgent(r.userId, bot.id);
    const relay = { kind: r.kind, authorName: who, text: r.text, conversationId: r.conversationId ?? null, messageId: r.messageId ?? null, taskId: r.taskId ?? null };
    await postMessage({ id: crypto.randomUUID(), conversationId, kind: "bot", authorAgentId: bot.id, text, data: { relay } }, agentAuthor(bot));
    done.add(r.userId);
  }
  return done;
}

/** The bot that speaks for someone in the simple interface: the first one they can use. */
async function assistantOf(userId: string) {
  const [row] = await db
    .select({ agent })
    .from(agentAccess)
    .innerJoin(agent, eq(agent.id, agentAccess.agentId))
    .where(and(eq(agentAccess.userId, userId), eq(agent.onboarding, false)))
    .orderBy(agent.createdAt)
    .limit(1);
  return row?.agent ?? null;
}

/** "@handle" not inside a word (an email), as the app colors them. */
const mentionRe = /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_.]+)/gu;

/** Colleagues whose @handle appears in a text; handles are computed like the app's. */
export async function mentionedUserIds(text: string) {
  const words = [...text.matchAll(mentionRe)].map((m) => m[1]!.toLowerCase());
  if (!words.length) return [];
  const people = withHandles(
    await db.select({ id: user.id, name: user.name, username: user.username }).from(user).where(or(isNull(user.banned), eq(user.banned, false))),
  );
  // "@lea." at the end of a sentence: the trailing dots aren't part of the handle.
  const said = new Set(words.flatMap((w) => [w, w.replace(/\.+$/, "")]));
  return people.filter((p) => said.has(p.handle)).map((p) => p.id);
}

type PostedMessage = {
  id: string;
  conversationId: string;
  kind: string;
  text: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
  data?: Record<string, unknown> | null;
};

/** Mentions and replies of a message just posted in a group, for its human members. */
export async function notifyMessage(m: PostedMessage) {
  if (m.kind === "event" || m.data?.forwarded) return;
  const [conv] = await db.select({ kind: conversation.kind }).from(conversation).where(eq(conversation.id, m.conversationId));
  if (conv?.kind !== "group") return;
  const members = new Set(
    (await db.select({ id: conversationMember.userId }).from(conversationMember).where(eq(conversationMember.conversationId, m.conversationId))).map((r) => r.id),
  );
  const mentioned = (await mentionedUserIds(m.text)).filter((id) => members.has(id));
  const quotedId = (m.data?.replyTo as { id?: string } | undefined)?.id;
  const [quoted] = quotedId ? await db.select({ author: message.authorUserId }).from(message).where(eq(message.id, quotedId)) : [];
  // A reply that also mentions its author counts once, as a mention.
  const repliedTo = quoted?.author && members.has(quoted.author) && !mentioned.includes(quoted.author) ? quoted.author : null;
  const base = { conversationId: m.conversationId, messageId: m.id, text: excerpt(m.text) };
  await notify(
    [...mentioned.map((userId) => ({ ...base, userId, kind: "mention" as const })), ...(repliedTo ? [{ ...base, userId: repliedTo, kind: "reply" as const }] : [])],
    { userId: m.authorUserId, agentId: m.authorAgentId },
  );
}

type TaskRef = { id: string; title: string; conversationId?: string | null };

/** People just put on a task by someone else. */
export const notifyAssigned = (t: TaskRef, userIds: string[], actor: Actor) =>
  notify(
    userIds.map((userId) => ({ userId, kind: "task.assigned", taskId: t.id, conversationId: t.conversationId ?? null, text: t.title })),
    actor,
  );

/** A task's creator, when someone else completes it. */
export const notifyDone = (t: TaskRef & { createdBy: string | null }, actor: Actor) =>
  t.createdBy ? notify([{ userId: t.createdBy, kind: "task.done", taskId: t.id, conversationId: t.conversationId ?? null, text: t.title }], actor) : Promise.resolve();

/** Never lets a notification failure break what triggered it. */
export const quietly = (p: Promise<unknown>) => p.catch((err) => console.error("inbox", err));

/* ---------- Reading ---------- */

const actorUser = alias(user, "actor_user");
const LIMIT = 100;

export async function listInbox(userId: string, opts: { unread?: boolean } = {}) {
  const rows = await db
    .select({ n: notification, userName: actorUser.name, userImage: actorUser.image, agent, taskTitle: task.title, taskStatus: task.status })
    .from(notification)
    .leftJoin(actorUser, eq(actorUser.id, notification.actorUserId))
    .leftJoin(agent, eq(agent.id, notification.actorAgentId))
    .leftJoin(task, eq(task.id, notification.taskId))
    .where(and(eq(notification.userId, userId), opts.unread ? isNull(notification.readAt) : undefined))
    .orderBy(desc(notification.createdAt))
    .limit(LIMIT);
  return rows.map(({ n, userName, userImage, agent: a, taskTitle, taskStatus }) => ({
    id: n.id,
    kind: n.kind,
    text: n.text,
    read: !!n.readAt,
    createdAt: n.createdAt,
    conversationId: n.conversationId,
    messageId: n.messageId,
    task: n.taskId && taskTitle && taskStatus ? { id: n.taskId, title: taskTitle, status: taskStatus } : null,
    actor: a
      ? { kind: "agent" as const, id: a.id, name: a.name, avatar: { shape: a.avatarShape, color: a.avatarColor } }
      : n.actorUserId && userName
        ? { kind: "user" as const, id: n.actorUserId, name: userName, image: userImage }
        : null,
  }));
}

export async function unreadCount(userId: string) {
  return db.$count(notification, and(eq(notification.userId, userId), isNull(notification.readAt)));
}

/** Marks read (or unread) some notifications, or all of them without ids. */
export async function markRead(userId: string, opts: { ids?: string[]; read?: boolean } = {}) {
  const read = opts.read ?? true;
  await db
    .update(notification)
    .set({ readAt: read ? new Date() : null })
    .where(and(eq(notification.userId, userId), opts.ids ? inArray(notification.id, opts.ids) : isNull(notification.readAt)));
  publishToUser(userId, { type: "inbox.changed" });
}

/** Opening a conversation reads its mentions and replies. */
export async function markConversationRead(userId: string, conversationId: string) {
  const done = await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), eq(notification.conversationId, conversationId), isNull(notification.readAt), inArray(notification.kind, ["mention", "reply"])))
    .returning({ id: notification.id });
  if (done.length) publishToUser(userId, { type: "inbox.changed" });
}
