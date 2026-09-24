import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Schedule } from "@agora/core";
import { api } from "./api";

export type Presence = { online: boolean; lastSeenAt: string | null };
type Snapshot = { users: Record<string, Presence>; workingAgents: string[]; schedules: Record<string, Schedule> };

/** Loaded once, then kept up to date by the SSE stream (presence, agent.status, availability). */
export const presenceQuery = queryOptions({
  queryKey: ["presence"],
  queryFn: () => api<Snapshot>("/presence"),
  staleTime: Infinity,
});

export function applyPresence(qc: QueryClient, userId: string, presence: Presence) {
  qc.setQueryData<Snapshot>(presenceQuery.queryKey, (old) => old && { ...old, users: { ...old.users, [userId]: presence } });
}

export function applyAgentStatus(qc: QueryClient, agentId: string, working: boolean) {
  qc.setQueryData<Snapshot>(presenceQuery.queryKey, (old) => {
    if (!old) return old;
    const others = old.workingAgents.filter((id) => id !== agentId);
    return { ...old, workingAgents: working ? [...others, agentId] : others };
  });
  // Its profile shows what it's doing.
  qc.invalidateQueries({ queryKey: ["agent", agentId, "activity"] });
}

const OFFLINE: Presence = { online: false, lastSeenAt: null };

export const usePresence = (userId: string) => useQuery({ ...presenceQuery, select: (s) => s.users[userId] ?? OFFLINE }).data ?? OFFLINE;

export const useAgentWorking = (agentId: string) => useQuery({ ...presenceQuery, select: (s) => s.workingAgents.includes(agentId) }).data ?? false;

/** Re-renders every minute, so "seen 3 min ago" stays true. */
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}
