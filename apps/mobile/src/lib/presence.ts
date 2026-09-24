import type { Schedule } from "@agora/core";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";

/* apps/web/src/lib/presence.ts */

export type Presence = { online: boolean; lastSeenAt: string | null };
type Snapshot = { users: Record<string, Presence>; workingAgents: string[]; schedules: Record<string, Schedule> };

export const presenceQuery = queryOptions({
  queryKey: ["presence"],
  queryFn: () => api<Snapshot>("/presence"),
});

const OFFLINE: Presence = { online: false, lastSeenAt: null };

export const usePresence = (userId: string) => useQuery({ ...presenceQuery, select: (s) => s.users[userId] ?? OFFLINE }).data ?? OFFLINE;

export const useAgentWorking = (agentId: string) => useQuery({ ...presenceQuery, select: (s) => s.workingAgents.includes(agentId) }).data ?? false;

/** Re-renders every minute, so statuses that depend on the clock stay true. Returns the time of the last tick. */
export function useMinuteTick() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
