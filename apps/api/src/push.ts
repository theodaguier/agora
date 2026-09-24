/**
 * Push notifications to the mobile app, through Expo's push service. Each paired phone stores its
 * Expo push token on its `mobile_link` row, so signing a phone out (its session deleted) also
 * stops its notifications. What gets pushed: a direct message, what lands in someone's inbox
 * (mention, reply, task given or completed), and the morning recap. Someone absent, in "do not disturb" or outside their
 * working hours gets nothing, as bots don't disturb them either.
 */
import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { canDisturb } from "./availability";
import { db, schema } from "./db";
import type { NotificationKind } from "./db/schema";
import { excerpt } from "./group";
import { defineMessages, orgLocale, tr } from "./i18n";

const { mobileLink, session } = schema;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo takes at most 100 messages per request. */
const CHUNK = 100;

export type Push = {
  title: string;
  subtitle?: string;
  body: string;
  /** Read by the app when the notification is tapped: where to go. */
  data: { conversationId?: string | null; messageId?: string | null; taskId?: string | null; digestId?: string };
};

/** Push tokens of the users' signed-in phones. */
async function tokensOf(userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select({ token: mobileLink.pushToken, userId: mobileLink.userId })
    .from(mobileLink)
    .innerJoin(session, eq(session.id, mobileLink.sessionId))
    .where(and(inArray(mobileLink.userId, userIds), isNotNull(mobileLink.pushToken), gt(session.expiresAt, new Date())));
}

/** Sends `push` to each user's phones; never throws. */
export async function pushTo(userIds: string[], push: Push) {
  try {
    const reachable: string[] = [];
    for (const id of new Set(userIds)) if (await canDisturb(id)) reachable.push(id);
    const tokens = (await tokensOf(reachable)).map((r) => r.token!).filter(Boolean);
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          batch.map((to) => ({ to, title: push.title, subtitle: push.subtitle, body: excerpt(push.body, 180), data: push.data, sound: "default" })),
        ),
      });
      if (!res.ok) {
        console.error("push: expo", res.status, await res.text().catch(() => ""));
        continue;
      }
      // A token the phone no longer answers to (app deleted, notifications revoked) is dropped.
      const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const gone = batch.filter((_, j) => data?.[j]?.details?.error === "DeviceNotRegistered");
      if (gone.length) await db.update(mobileLink).set({ pushToken: null }).where(inArray(mobileLink.pushToken, gone));
    }
  } catch (err) {
    console.error("push", err);
  }
}

const { agent, conversation, conversationMember, user } = schema;

const messages = defineMessages({
  en: {
    attachment: "Sent an attachment",
    mention: "Mentioned you",
    reply: "Replied to you",
    assigned: (title: string) => `Gave you a task: ${title}`,
    done: (title: string) => `Completed: ${title}`,
    someone: "Agora",
    daily: "Morning recap",
    weekly: "Weekly recap",
  },
  fr: {
    attachment: "A envoyé une pièce jointe",
    mention: "T'a mentionné",
    reply: "T'a répondu",
    assigned: (title: string) => `T'a confié une tâche : ${title}`,
    done: (title: string) => `A terminé : ${title}`,
    someone: "Agora",
    daily: "Récap du matin",
    weekly: "Récap de la semaine",
  },
});

/** Each recipient in their language (their own, else the organization's). */
async function localesOf(userIds: string[]) {
  const org = await orgLocale();
  const rows = userIds.length ? await db.select({ id: user.id, locale: user.locale }).from(user).where(inArray(user.id, userIds)) : [];
  return new Map(rows.map((r) => [r.id, r.locale ?? org]));
}

async function actorName(actor: { userId?: string | null; agentId?: string | null }) {
  if (actor.agentId) return (await db.select({ name: agent.name }).from(agent).where(eq(agent.id, actor.agentId)))[0]?.name;
  if (actor.userId) return (await db.select({ name: user.name }).from(user).where(eq(user.id, actor.userId)))[0]?.name;
  return undefined;
}

/** A message in a direct conversation, to the other person (a person's own bot conversation included). */
export async function pushDirectMessage(m: { id: string; conversationId: string; kind: string; text: string; authorUserId?: string | null; authorAgentId?: string | null }) {
  if (m.kind === "event") return;
  const [conv] = await db.select({ kind: conversation.kind }).from(conversation).where(eq(conversation.id, m.conversationId));
  if (conv?.kind !== "direct") return;
  const members = await db.select({ id: conversationMember.userId }).from(conversationMember).where(eq(conversationMember.conversationId, m.conversationId));
  const to = members.map((r) => r.id).filter((id) => id !== m.authorUserId);
  if (!to.length) return;
  const name = (await actorName({ userId: m.authorUserId, agentId: m.authorAgentId })) ?? "";
  const locales = await localesOf(to);
  for (const id of to) {
    const t = tr(messages, locales.get(id));
    await pushTo([id], { title: name || t.someone, body: m.text.trim() || t.attachment, data: { conversationId: m.conversationId, messageId: m.id } });
  }
}

type InboxRow = { userId: string; kind: NotificationKind; conversationId?: string | null; messageId?: string | null; taskId?: string | null; text: string };

/** What just landed in people's inbox. */
export async function pushInbox(rows: InboxRow[], actor: { userId?: string | null; agentId?: string | null }) {
  if (!rows.length) return;
  const name = await actorName(actor);
  const locales = await localesOf(rows.map((r) => r.userId));
  const titles = new Map<string, string | null>();
  for (const r of rows) {
    const t = tr(messages, locales.get(r.userId));
    let group: string | null | undefined;
    if (r.conversationId && (r.kind === "mention" || r.kind === "reply")) {
      if (!titles.has(r.conversationId)) {
        titles.set(r.conversationId, (await db.select({ title: conversation.title }).from(conversation).where(eq(conversation.id, r.conversationId)))[0]?.title ?? null);
      }
      group = titles.get(r.conversationId);
    }
    const body = r.kind === "task.assigned" ? t.assigned(r.text) : r.kind === "task.done" ? t.done(r.text) : r.text;
    await pushTo([r.userId], {
      title: name ?? t.someone,
      subtitle: group ?? (r.kind === "mention" ? t.mention : r.kind === "reply" ? t.reply : undefined),
      body,
      data: { conversationId: r.conversationId, messageId: r.messageId, taskId: r.taskId },
    });
  }
}

/** A recap was just written: to every account, with the headline of the part addressed to them, else the team's. */
export async function pushDigest(d: { id: string; kind: "daily" | "weekly"; team: string; personal: Map<string, string> }) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(or(eq(user.banned, false), isNull(user.banned)));
  const locales = await localesOf(rows.map((r) => r.id));
  for (const { id } of rows) {
    const t = tr(messages, locales.get(id));
    await pushTo([id], { title: d.kind === "weekly" ? t.weekly : t.daily, body: d.personal.get(id) ?? d.team, data: { digestId: d.id } });
  }
}
