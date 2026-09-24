import { queryOptions } from "@tanstack/react-query";
import { api, conversationPath } from "./api";
import type { AgentSummary, ConversationDetail, ConversationSummary, Message, Person, Pin, SessionUser, Task, UserProfile } from "./types";

/* Same queries as apps/web/src/lib/queries.ts, one QueryClient per instance (ServerScope). */

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => api<{ user: SessionUser } | null>("/auth/get-session"),
  select: (s) => s?.user ?? null,
});

/** Versions the organization's server runs: the product and the Hermes engine. */
export const serverVersionQuery = queryOptions({
  queryKey: ["server-version"],
  queryFn: () => api<{ app: string; hermes: string }>("/me/version"),
  staleTime: 10 * 60_000,
});

export const agentsQuery = queryOptions({
  queryKey: ["agents"],
  queryFn: () => api<AgentSummary[]>("/agents"),
});

export const conversationsQuery = queryOptions({
  queryKey: ["conversations"],
  queryFn: () => api<ConversationSummary[]>("/conversations"),
});

export const conversationQuery = (id: string) =>
  queryOptions({
    queryKey: ["conversation", id],
    queryFn: () => api<ConversationDetail>(conversationPath(id)),
  });

export const messagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["messages", conversationId],
    queryFn: () => api<Message[]>(conversationPath(conversationId, "/messages")),
  });

export const pinsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["pins", conversationId],
    queryFn: () => api<Pin[]>(conversationPath(conversationId, "/pins")),
  });

/** Colleagues to write to. */
export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: () => api<Person[]>("/users"),
});

export const tasksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["tasks", userId],
    queryFn: () => api<Task[]>(`/tasks?${new URLSearchParams({ user: userId })}`),
  });

export const userProfileQuery = (id: string) =>
  queryOptions({
    queryKey: ["user", id],
    queryFn: () => api<UserProfile>(`/users/${encodeURIComponent(id)}`),
    staleTime: 60_000,
  });

/** Models of the conversation's bot; in a group, of the bot named (each keeps its own). */
export const modelsQuery = (conversationId: string, agentId?: string) =>
  queryOptions({
    queryKey: ["models", conversationId, agentId ?? null],
    queryFn: () =>
      api<import("./types").ModelOptions>(conversationPath(conversationId, `/models${agentId ? `?agent=${encodeURIComponent(agentId)}` : ""}`)),
    staleTime: 5 * 60_000,
  });

export type Routine = {
  id: string;
  name: string;
  cron: string | null;
  schedule: string;
  nextRunAt: string | null;
  enabled: boolean;
};

export const routinesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["routines", conversationId],
    queryFn: () => api<Routine[]>(conversationPath(conversationId, "/routines")),
  });

/** /context: how full the bot's current session is (session null: nothing sent yet, or Claude Code). */
export type SessionContext = {
  engine: "hermes" | "claude-code";
  model: string | null;
  generation: number;
  /** /compact summary still waiting for the next message. */
  compacted: boolean;
  session: {
    model: string | null;
    messages: number;
    tokens: number;
    window: number | null;
    autoCompressions: number;
    totals: { input: number; output: number; cacheRead: number };
  } | null;
};

export const contextQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["context", conversationId],
    queryFn: () => api<SessionContext>(conversationPath(conversationId, "/context")),
  });

export type Commands = {
  /** In a group, every bot's skills, tagged with the bot. */
  skills: { name: string; description: string; category?: string; agentId?: string }[];
  mcp: { name: string; description: string }[];
};

export const commandsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["commands", conversationId],
    queryFn: () => api<Commands>(conversationPath(conversationId, "/commands")),
    staleTime: 60_000,
  });
