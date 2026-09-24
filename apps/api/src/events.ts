import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** Events pushed to clients on GET /api/events. */
export type AppEvent =
  | { type: "message.created"; conversationId: string; message: unknown }
  | { type: "conversation.updated"; conversationId: string }
  | { type: "conversation.removed"; conversationId: string }
  | { type: "read"; conversationId: string; userId: string; at: string }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "pins.changed"; conversationId: string }
  | { type: "bot.started"; conversationId: string; turnId: string; agentId: string; requestedBy: string | null }
  | { type: "bot.delta"; conversationId: string; turnId: string; text: string }
  | { type: "bot.tool"; conversationId: string; turnId: string; name: string; status: string; label?: string }
  | { type: "bot.approval"; conversationId: string; turnId: string; approval: import("./bot-runner").PendingApproval | null }
  | { type: "bot.done"; conversationId: string; turnId: string; messageId: string | null }
  | { type: "bot.error"; conversationId: string; turnId: string; message: string }
  | { type: "presence"; userId: string; online: boolean; lastSeenAt: string | null }
  | { type: "agent.status"; agentId: string; working: boolean }
  /** Someone's working hours, absences or "do not disturb" changed (availability.ts). */
  | { type: "availability"; userId: string; schedule: import("@agora/core").Schedule }
  /** Someone's tasks changed: profiles are visible to everyone, so it goes to every open tab. */
  | { type: "tasks.changed"; userIds: string[] }
  /** The morning recap was just written (digest.ts). */
  | { type: "digest.ready"; id: string }
  /** Something landed in (or left) the account's inbox (inbox.ts). */
  | { type: "inbox.changed" };

type Listener = (event: AppEvent) => void;

/**
 * In-memory bus: a single API instance. To run several, replace the
 * implementation with Postgres LISTEN/NOTIFY behind the same interface.
 */
const listeners = new Map<string, Set<Listener>>();

/** A reload closes then reopens the stream: going offline waits this long, to avoid flickering. */
const OFFLINE_GRACE_MS = 8_000;
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function subscribe(userId: string, listener: Listener) {
  let set = listeners.get(userId);
  if (!set) {
    listeners.set(userId, (set = new Set()));
    const pending = offlineTimers.get(userId);
    if (pending) {
      clearTimeout(pending);
      offlineTimers.delete(userId);
    } else {
      void setPresence(userId, true);
    }
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size || listeners.get(userId) !== set) return;
    listeners.delete(userId);
    offlineTimers.set(
      userId,
      setTimeout(() => {
        offlineTimers.delete(userId);
        if (!listeners.has(userId)) void setPresence(userId, false);
      }, OFFLINE_GRACE_MS),
    );
  };
}

/** Online = at least one open tab; the last-seen date is stored on each transition. */
async function setPresence(userId: string, online: boolean) {
  const at = new Date();
  try {
    await db.update(schema.user).set({ lastSeenAt: at }).where(eq(schema.user.id, userId));
  } catch (err) {
    console.error("events: presence", err);
  }
  publishToAll({ type: "presence", userId, online, lastSeenAt: at.toISOString() });
}

export const onlineUserIds = () => [...listeners.keys()];

export function publishToAll(event: AppEvent) {
  for (const userId of listeners.keys()) publishToUser(userId, event);
}

export function publishToUser(userId: string, event: AppEvent) {
  for (const listener of listeners.get(userId) ?? []) {
    try {
      listener(event);
    } catch (err) {
      console.error("events: listener", err);
    }
  }
}

const memberCache = new Map<string, string[]>();

async function memberIds(conversationId: string) {
  const cached = memberCache.get(conversationId);
  if (cached) return cached;
  const rows = await db
    .select({ userId: schema.conversationMember.userId })
    .from(schema.conversationMember)
    .where(eq(schema.conversationMember.conversationId, conversationId));
  const ids = rows.map((r) => r.userId);
  memberCache.set(conversationId, ids);
  return ids;
}

/** Call whenever the human members of a conversation change. */
export function forgetMembers(conversationId: string) {
  memberCache.delete(conversationId);
}

export async function publishToConversation(conversationId: string, event: AppEvent) {
  for (const userId of await memberIds(conversationId)) publishToUser(userId, event);
}
