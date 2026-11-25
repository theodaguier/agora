/**
 * The interface an admin gives each person: "full" (every section) or "simple" (one chat with their
 * assistant and its history, like ChatGPT: same features, asked for in words). Admins always get the full one.
 */
export type UiMode = "simple" | "full";

export const UI_MODES: readonly UiMode[] = ["simple", "full"];

/** Does this account get the simple interface? */
export const isSimple = (user: { role?: string | null; uiMode?: string | null } | null | undefined) => user?.uiMode === "simple" && user.role !== "admin";

/** Day buckets of the simple interface's history, newest first, like ChatGPT's. */
export type HistoryBucket = "today" | "yesterday" | "week" | "month" | "older";

/** Which bucket an activity date falls in, in the viewer's local time. */
export function historyBucket(at: Date, now = new Date()): HistoryBucket {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  if (days < 30) return "month";
  return "older";
}

/**
 * What an inbox item becomes in the simple interface (apps/api inbox.ts relayToChat): their assistant's
 * message carries it, and the app shows it as a quote opening the conversation or the task.
 */
export type InboxRelay = {
  kind: "mention" | "reply" | "task.assigned" | "task.done";
  authorName: string;
  text: string;
  conversationId: string | null;
  messageId: string | null;
  taskId: string | null;
};

/** A routine's result posted in its conversation (apps/api routine-delivery.ts): the grey line above it. */
export type RoutineRunRef = { id: string; name: string; at: string };
