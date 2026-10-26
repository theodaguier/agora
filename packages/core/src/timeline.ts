import { compareMessageOrder } from "./messages";

/** Stored on the final reply, so completing or reloading never changes its place. */
export type ReplyTurn = { id: string; startedAt: string };
type Message = { id: string; createdAt: string; data?: { turn?: ReplyTurn } | null };
type Turn = { turnId: string; startedAt?: string };
export type TimelineEntry<M, T> =
  | { kind: "message"; key: string; createdAt: string; message: M }
  | { kind: "turn"; key: string; createdAt: string; turn: T };

/** One chronology for saved messages and replies still streaming; a final reply replaces its turn. */
export function conversationTimeline<M extends Message, T extends Turn>(messages: M[], turns: T[]): TimelineEntry<M, T>[] {
  const finished = new Set(messages.flatMap((m) => m.data?.turn ? [m.data.turn.id] : []));
  const entries: TimelineEntry<M, T>[] = messages.map((message) => ({
    kind: "message", key: message.data?.turn ? `turn:${message.data.turn.id}` : `message:${message.id}`,
    createdAt: message.data?.turn?.startedAt ?? message.createdAt, message,
  }));
  for (const turn of turns) {
    if (!finished.has(turn.turnId)) entries.push({ kind: "turn", key: `turn:${turn.turnId}`, createdAt: turn.startedAt ?? "9999-12-31T00:00:00.000Z", turn });
  }
  return entries.sort((a, b) => compareMessageOrder({ id: a.key, createdAt: a.createdAt }, { id: b.key, createdAt: b.createdAt }));
}
