import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "./api";
import { conversationsQuery, type Routine } from "./queries";
import type { AgentSummary, Task } from "./types";

/*
 * apps/web/src/lib/profile.ts, and the profile queries of apps/web/src/lib/queries.ts. On the web a
 * profile is a side sheet opened from anywhere; on the phone it is a screen pushed on the stack.
 */

/** A colleague's profile, from the members list, a mention, a conversation header, search. */
export const openProfile = (userId: string) => router.push({ pathname: "/people/[userId]", params: { userId } });

/** A bot's profile; `conversationId` adds what the web's side panel shows for that conversation (its screen, its routines). */
export const openAgentProfile = (agentId: string, conversationId?: string) =>
  router.push({ pathname: "/agents/[agentId]", params: conversationId ? { agentId, conversationId } : { agentId } });

/** A bot's profile, visible to everyone like a colleague's; `access`: you may write to it. */
export type AgentProfile = AgentSummary & { createdAt: string; access: boolean };

export const agentProfileQuery = (id: string) =>
  queryOptions({
    queryKey: ["agent", id],
    queryFn: () => api<AgentProfile>(`/agents/${encodeURIComponent(id)}`),
    staleTime: 60_000,
  });

/** What a bot is doing right now in your conversations, and the routines it runs there. */
export type AgentActivity = {
  turns: { conversationId: string; requestedBy: string | null; tool: string | null; startedAt: string | null }[];
  /** Turns underway in conversations you're not in. */
  elsewhere: number;
  routines: (Routine & { conversationId: string })[];
};

export const agentActivityQuery = (id: string) =>
  queryOptions({
    queryKey: ["agent", id, "activity"],
    queryFn: () => api<AgentActivity>(`/agents/${encodeURIComponent(id)}/activity`),
    // The tool in use changes during a turn: follow it while the bot works.
    refetchInterval: (q) => (q.state.data?.turns.length ? 3_000 : false),
  });

/** Tasks a bot created. */
export const agentTasksQuery = (agentId: string) =>
  queryOptions({
    queryKey: ["tasks", "agent", agentId],
    queryFn: () => api<Task[]>(`/tasks?${new URLSearchParams({ agent: agentId })}`),
  });

/** Opens (or creates) the direct conversation with a bot or a colleague, then shows it in place of the profile. */
export function useOpenDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { agentId: string } | { userId: string }) =>
      api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: id } });
    },
  });
}

/* ---------- Routines (apps/web/src/components/RoutineDialog.tsx) ---------- */

export const routinePath = (conversationId: string, id: string) =>
  `/conversations/${encodeURIComponent(conversationId)}/routines/${encodeURIComponent(id)}`;

/** The conversation's routine list, and the bot activity (profile) that lists them too. */
export const refreshRoutines = (qc: QueryClient, conversationId: string) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ["routines", conversationId] }),
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "agent" && q.queryKey[2] === "activity" }),
  ]);

/** Pause or resume. */
export function useToggleRoutine(conversationId: string, routine: Routine) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Routine>(routinePath(conversationId, routine.id), { method: "PATCH", body: JSON.stringify({ enabled: !routine.enabled }) }),
    onSettled: () => refreshRoutines(qc, conversationId),
  });
}

export function useDeleteRoutine(conversationId: string, routine: Routine) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(routinePath(conversationId, routine.id), { method: "DELETE" }),
    onSuccess: () => refreshRoutines(qc, conversationId),
  });
}
