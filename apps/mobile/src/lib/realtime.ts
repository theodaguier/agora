import { insertMessage, type Schedule } from "@agora/core";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { apiUrl, authHeaders } from "./api";
import { demoEvents, isDemo } from "./demo";
import { presenceQuery } from "./presence";
import type { ActiveTurn, Message, PendingApproval } from "./types";

/*
 * apps/web/src/lib/realtime.ts: same store and same event handling. The stream is read with
 * expo/fetch (React Native has no EventSource, and the session travels in a header), and it is
 * closed while the app is in the background, reopened when it comes back.
 */

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

/** A step of a bot's reply, for what reacts to it as it happens (the open thread's haptics). */
export type TurnEvent = Extract<ServerEvent, { type: `bot.${string}` }>;
const turnListeners = new Set<(ev: TurnEvent) => void>();

/** Calls `fn` on each step of the replies in `conversationId`; returns the unsubscribe. */
export function onTurnEvent(conversationId: string, fn: (ev: TurnEvent) => void) {
  const l = (ev: TurnEvent) => ev.conversationId === conversationId && fn(ev);
  turnListeners.add(l);
  return () => void turnListeners.delete(l);
}

const EMPTY_TURNS: ActiveTurn[] = [];
const EMPTY_TYPING: Typing[] = [];

export const useTurns = (conversationId: string) => useSyncExternalStore(subscribe, () => state.turns[conversationId] ?? EMPTY_TURNS);

export const useTyping = (conversationId: string) => useSyncExternalStore(subscribe, () => state.typing[conversationId] ?? EMPTY_TYPING);

function updateTurns(conversationId: string, fn: (turns: ActiveTurn[]) => ActiveTurn[]) {
  set({ ...state, turns: { ...state.turns, [conversationId]: fn(state.turns[conversationId] ?? EMPTY_TURNS) } });
}

function updateTyping(conversationId: string, fn: (typing: Typing[]) => Typing[]) {
  set({ ...state, typing: { ...state.typing, [conversationId]: fn(state.typing[conversationId] ?? EMPTY_TYPING) } });
}

/**
 * Replies the stream saw end: a GET /conversations/:id that left before `bot.done` still lists
 * them, and seeding them back would leave "working…" on screen until a reload.
 */
const finished = new Set<string>();

/** Replies already started when the conversation is opened (GET /conversations/:id). */
export function seedTurns(conversationId: string, turns: ActiveTurn[]) {
  const known = state.turns[conversationId] ?? EMPTY_TURNS;
  const missing = turns.filter((t) => !finished.has(t.turnId) && !known.some((k) => k.turnId === t.turnId));
  if (missing.length) updateTurns(conversationId, (ts) => [...ts, ...missing]);
}

/** An approval answered from this phone: closed right away, without waiting for the stream's `bot.approval`. */
export function clearApproval(conversationId: string, turnId: string, approvalId: string) {
  updateTurns(conversationId, (ts) => ts.map((t) => (t.turnId === turnId && t.approval?.id === approvalId ? { ...t, approval: null } : t)));
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
  | { type: "bot.done"; conversationId: string; turnId: string; messageId: string | null }
  | { type: "bot.error"; conversationId: string; turnId: string };

/** Events that do not belong to a conversation. */
type GlobalEvent =
  | { type: "presence"; userId: string; online: boolean; lastSeenAt: string | null }
  | { type: "agent.status"; agentId: string; working: boolean }
  | { type: "availability"; userId: string; schedule: Schedule }
  | { type: "tasks.changed"; userIds: string[] }
  | { type: "digest.ready"; id: string }
  | { type: "inbox.changed" };

type Snapshot = { users: Record<string, { online: boolean; lastSeenAt: string | null }>; workingAgents: string[]; schedules: Record<string, Schedule> };

function apply(qc: QueryClient, me: string, ev: ServerEvent | GlobalEvent) {
  const snapshot = (fn: (old: Snapshot) => Snapshot) => qc.setQueryData<Snapshot>(presenceQuery.queryKey, (old) => old && fn(old));
  if (ev.type === "presence") return snapshot((old) => ({ ...old, users: { ...old.users, [ev.userId]: { online: ev.online, lastSeenAt: ev.lastSeenAt } } }));
  if (ev.type === "agent.status")
    return snapshot((old) => {
      const others = old.workingAgents.filter((id) => id !== ev.agentId);
      return { ...old, workingAgents: ev.working ? [...others, ev.agentId] : others };
    });
  if (ev.type === "availability") return snapshot((old) => ({ ...old, schedules: { ...old.schedules, [ev.userId]: ev.schedule } }));
  if (ev.type === "digest.ready") return void qc.invalidateQueries({ queryKey: ["digest"] });
  if (ev.type === "inbox.changed") return void qc.invalidateQueries({ queryKey: ["inbox"] });
  if (ev.type === "tasks.changed") {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    for (const id of ev.userIds) qc.invalidateQueries({ queryKey: ["user", id] });
    return;
  }
  const cid = ev.conversationId;
  if (ev.type.startsWith("bot.")) for (const l of turnListeners) l(ev as TurnEvent);
  switch (ev.type) {
    case "message.created": {
      qc.setQueryData<Message[]>(["messages", cid], (old) => old && insertMessage(old, ev.message));
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
      finished.add(ev.turnId);
      updateTurns(cid, (ts) => ts.filter((t) => t.turnId !== ev.turnId));
      // The reply was lost on the way (a refetch that left before it overwrote it): fetch it.
      if (ev.type === "bot.done" && ev.messageId && !qc.getQueryData<Message[]>(["messages", cid])?.some((m) => m.id === ev.messageId))
        qc.invalidateQueries({ queryKey: ["messages", cid] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["routines", cid] });
      return;
  }
}

/** After a reconnection: start over from the REST data and drop in-progress replies (no server-side replay). */
function resync(qc: QueryClient) {
  set({ turns: {}, typing: {} });
  qc.invalidateQueries({ queryKey: ["conversations"] });
  qc.invalidateQueries({ queryKey: ["conversation"] });
  qc.invalidateQueries({ queryKey: ["messages"] });
  qc.invalidateQueries({ queryKey: presenceQuery.queryKey });
  // A recap written meanwhile opens by itself (components/announcements.tsx).
  qc.invalidateQueries({ queryKey: ["digest"] });
}

/** Reads one SSE stream until it ends or is aborted; `onEvent(type, data)` for each event. */
async function readStream(signal: AbortSignal, onEvent: (type: string, data: string) => void) {
  if (isDemo(apiUrl(""))) return demoEvents(signal, onEvent);
  const res = await fetch(apiUrl("/events"), { headers: { Accept: "text/event-stream", ...authHeaders() }, signal });
  if (!res.ok || !res.body) throw new Error(`events: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    // Events are separated by a blank line; each has "event:" and "data:" lines.
    let end: number;
    while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
      let type = "message";
      const data: string[] = [];
      for (const line of chunk.split(/\r?\n/)) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      onEvent(type, data.join("\n"));
    }
  }
}

/** The server pings every 25 s: past this silence the stream is dead (network change, a proxy dropping it). */
const SILENCE_MS = 60_000;

/**
 * A single SSE stream for the instance, while the app is in the foreground. Reconnects with
 * a growing delay; every reconnection resyncs from REST, as on the web.
 */
export function useEvents(me: string) {
  const qc = useQueryClient();
  useEffect(() => {
    let controller: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let connectedOnce = false;
    let active = AppState.currentState === "active";
    let lastEvent = Date.now();

    const connect = () => {
      if (!active || controller) return;
      const current = new AbortController();
      controller = current;
      lastEvent = Date.now();
      readStream(current.signal, (type, data) => {
        lastEvent = Date.now();
        if (type === "ping") return;
        if (type === "ready") {
          if (connectedOnce) resync(qc);
          connectedOnce = true;
          attempt = 0;
          return;
        }
        try {
          apply(qc, me, JSON.parse(data) as ServerEvent | GlobalEvent);
        } catch (err) {
          console.error("events", err);
        }
      })
        .catch(() => {})
        .finally(() => {
          if (controller !== current) return;
          controller = null;
          if (!active) return;
          const delay = Math.min(30_000, 1000 * 2 ** attempt);
          attempt += 1;
          retry = setTimeout(connect, delay);
        });
    };

    const stop = () => {
      clearTimeout(retry);
      controller?.abort();
      controller = null;
    };

    // A stream that went quiet without ending (the phone changed network) never errors: abort it, `finally` reconnects.
    // The demo's stream has no ping.
    const watchdog = setInterval(() => {
      if (controller && !isDemo(apiUrl("")) && Date.now() - lastEvent > SILENCE_MS) controller.abort();
    }, 10_000);

    const sub = AppState.addEventListener("change", (s) => {
      const next = s === "active";
      if (next === active) return;
      active = next;
      if (active) {
        // Whatever happened in the background was missed: start from REST again.
        if (connectedOnce) resync(qc);
        connect();
      } else stop();
    });
    connect();
    return () => {
      clearInterval(watchdog);
      sub.remove();
      active = false;
      stop();
    };
  }, [qc, me]);
}
