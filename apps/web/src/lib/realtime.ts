import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import type { ActiveTurn, Message, PendingApproval } from "./api";
import type { Schedule } from "@agora/core";
import { applySchedule } from "./availability";
import { applyAgentStatus, applyPresence, presenceQuery } from "./presence";

/** Delay after which "X is typing" disappears without a new signal. */
const TYPING_MS = 5_000;

type Typing = { userId: string; name: string; until: number };

type State = {
  /** In-progress bot replies, per conversation. */
  turns: Record<string, ActiveTurn[]>;
  typing: Record<string, Typing[]>;
};

let state: State = { turns: {}, typing: {} };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const EMPTY_TURNS: ActiveTurn[] = [];
const EMPTY_TYPING: Typing[] = [];

export const useTurns = (conversationId: string) =>
  useSyncExternalStore(subscribe, () => state.turns[conversationId] ?? EMPTY_TURNS);

export const useTyping = (conversationId: string) =>
  useSyncExternalStore(subscribe, () => state.typing[conversationId] ?? EMPTY_TYPING);

function updateTurns(conversationId: string, fn: (turns: ActiveTurn[]) => ActiveTurn[]) {
  set({ ...state, turns: { ...state.turns, [conversationId]: fn(state.turns[conversationId] ?? EMPTY_TURNS) } });
}

function updateTyping(conversationId: string, fn: (typing: Typing[]) => Typing[]) {
  set({ ...state, typing: { ...state.typing, [conversationId]: fn(state.typing[conversationId] ?? EMPTY_TYPING) } });
}

/** An approval answered: drops its card right away, without waiting for the stream to confirm it. */
export function clearApproval(conversationId: string, turnId: string) {
  updateTurns(conversationId, (ts) => ts.map((t) => (t.turnId === turnId ? { ...t, approval: null } : t)));
}

/** Replies already started when the conversation is opened (GET /conversations/:id). */
export function seedTurns(conversationId: string, turns: ActiveTurn[]) {
  const known = state.turns[conversationId] ?? EMPTY_TURNS;
  const missing = turns.filter((t) => !known.some((k) => k.turnId === t.turnId));
  if (missing.length) updateTurns(conversationId, (ts) => [...ts, ...missing]);
}

type ServerEvent =
  | { type: "message.created"; conversationId: string; message: Message }
  | { type: "conversation.updated" | "conversation.removed"; conversationId: string }
  | { type: "read"; conversationId: string; userId: string }
  | { type: "typing"; conversationId: string; userId: string; name: string }
  | { type: "pins.changed"; conversationId: string }
  | { type: "bot.started"; conversationId: string; turnId: string; agentId: string; requestedBy: string | null }
  | { type: "bot.delta"; conversationId: string; turnId: string; text: string }
  | { type: "bot.tool"; conversationId: string; turnId: string; name: string; status: string }
  | { type: "bot.approval"; conversationId: string; turnId: string; approval: PendingApproval | null }
  | { type: "bot.done" | "bot.error"; conversationId: string; turnId: string };

/** Events that do not belong to a conversation. */
type GlobalEvent =
  | { type: "presence"; userId: string; online: boolean; lastSeenAt: string | null }
  | { type: "agent.status"; agentId: string; working: boolean }
  | { type: "availability"; userId: string; schedule: Schedule }
  | { type: "tasks.changed"; userIds: string[] }
  | { type: "digest.ready"; id: string }
  | { type: "inbox.changed" };

function apply(qc: QueryClient, me: string, ev: ServerEvent | GlobalEvent) {
  if (ev.type === "presence") return applyPresence(qc, ev.userId, { online: ev.online, lastSeenAt: ev.lastSeenAt });
  if (ev.type === "agent.status") return applyAgentStatus(qc, ev.agentId, ev.working);
  if (ev.type === "availability") {
    applySchedule(qc, ev.userId, ev.schedule);
    // The editor (settings, admin) shows the absences' notes, which the event leaves out.
    return void qc.invalidateQueries({ queryKey: ["availability", ev.userId] });
  }
  // Also refreshes the admin's recap settings (["digest", "config"]).
  if (ev.type === "digest.ready") return void qc.invalidateQueries({ queryKey: ["digest"] });
  if (ev.type === "inbox.changed") return void qc.invalidateQueries({ queryKey: ["inbox"] });
  if (ev.type === "tasks.changed") {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    // Profiles show what each person is working on.
    for (const id of ev.userIds) qc.invalidateQueries({ queryKey: ["user", id] });
    return;
  }
  const cid = ev.conversationId;
  switch (ev.type) {
    case "message.created": {
      qc.setQueryData<Message[]>(["messages", cid], (old) => (old && !old.some((m) => m.id === ev.message.id) ? [...old, ev.message] : old));
      const author = ev.message.author;
      if (author?.kind === "user") updateTyping(cid, (ts) => ts.filter((t) => t.userId !== author.id));
      qc.invalidateQueries({ queryKey: ["conversations"] });
      return;
    }
    case "conversation.updated":
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", cid] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      return;
    case "conversation.removed":
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", cid] });
      return;
    case "pins.changed":
      qc.invalidateQueries({ queryKey: ["pins", cid] });
      return;
    case "read":
      if (ev.userId === me) qc.invalidateQueries({ queryKey: ["conversations"] });
      return;
    case "typing":
      if (ev.userId === me) return;
      updateTyping(cid, (ts) => [...ts.filter((t) => t.userId !== ev.userId), { userId: ev.userId, name: ev.name, until: Date.now() + TYPING_MS }]);
      setTimeout(() => updateTyping(cid, (ts) => ts.filter((t) => t.until > Date.now())), TYPING_MS + 50);
      return;
    case "bot.started":
      updateTurns(cid, (ts) =>
        ts.some((t) => t.turnId === ev.turnId) ? ts : [...ts, { turnId: ev.turnId, agentId: ev.agentId, requestedBy: ev.requestedBy, text: "", tools: [] }],
      );
      return;
    case "bot.delta":
      updateTurns(cid, (ts) => ts.map((t) => (t.turnId === ev.turnId ? { ...t, text: t.text + ev.text } : t)));
      return;
    case "bot.tool":
      updateTurns(cid, (ts) => ts.map((t) => (t.turnId === ev.turnId ? { ...t, tools: [...t.tools, { name: ev.name, status: ev.status }] } : t)));
      return;
    case "bot.approval":
      updateTurns(cid, (ts) => ts.map((t) => (t.turnId === ev.turnId ? { ...t, approval: ev.approval } : t)));
      return;
    case "bot.done":
    case "bot.error":
      updateTurns(cid, (ts) => ts.filter((t) => t.turnId !== ev.turnId));
      qc.invalidateQueries({ queryKey: ["conversations"] });
      // The turn may have created or removed a routine.
      qc.invalidateQueries({ queryKey: ["routines", cid] });
      return;
  }
}

const EVENT_TYPES = [
  "message.created",
  "conversation.updated",
  "conversation.removed",
  "read",
  "typing",
  "bot.started",
  "bot.delta",
  "bot.tool",
  "bot.approval",
  "bot.done",
  "bot.error",
  "presence",
  "agent.status",
  "availability",
  "tasks.changed",
  "digest.ready",
  "inbox.changed",
] as const;

/**
 * A single SSE stream per tab. No server-side replay: on each
 * reconnect we start over from REST data and drop in-progress replies.
 */
export function useEvents(me: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/api/events", { withCredentials: true });
    let connected = false;
    source.addEventListener("ready", () => {
      if (connected) {
        set({ turns: {}, typing: {} });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation"] });
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: presenceQuery.queryKey });
      }
      connected = true;
    });
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (e) => {
        try {
          apply(qc, me, JSON.parse((e as MessageEvent<string>).data) as ServerEvent | GlobalEvent);
        } catch (err) {
          console.error("events", err);
        }
      });
    }
    return () => source.close();
  }, [qc, me]);
}
