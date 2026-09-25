import { queryOptions } from "@tanstack/react-query";
import { mergeMessages } from "@agora/core";
import {
  api,
  conversationPath,
  type AdminAgent,
  type AdminInvitation,
  type AdminModels,
  type AdminUser,
  type AgentProfile,
  type AgentSummary,
  type Brands,
  type ConversationDetail,
  type ConversationSummary,
  type Digest,
  type Inbox,
  type Message,
  type ModelOptions,
  type Person,
  type Pin,
  type Skill,
  type Task,
  type UserProfile,
} from "./api";

/** logo.dev key and MCP servers' domains; changes rarely. */
export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: () => api<Brands>("/integrations/brands"),
  staleTime: 5 * 60_000,
});

export const agentsQuery = queryOptions({
  queryKey: ["agents"],
  queryFn: () => api<AgentSummary[]>("/agents"),
});

/** Latest morning recap, or null before the first one. */
export const digestQuery = queryOptions({
  queryKey: ["digest"],
  queryFn: () => api<Digest | null>("/digest"),
  staleTime: 10 * 60_000,
});

/** Your inbox; `unread`: unread items only. The unread count comes with both. */
export const inboxQuery = (unread = false) =>
  queryOptions({
    queryKey: ["inbox", unread ? "unread" : "all"],
    queryFn: () => api<Inbox>(`/inbox${unread ? "?unread=1" : ""}`),
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
    queryFn: async ({ client, queryKey }) => mergeMessages(await api<Message[]>(conversationPath(conversationId, "/messages")), client.getQueryData<Message[]>(queryKey)),
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
  staleTime: 60_000,
});

export const userProfileQuery = (id: string) =>
  queryOptions({
    queryKey: ["user", id],
    queryFn: () => api<UserProfile>(`/users/${encodeURIComponent(id)}`),
    staleTime: 60_000,
  });

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

/** One task, cited in a message. */
export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: ["tasks", "one", id],
    queryFn: () => api<Task>(`/tasks/${encodeURIComponent(id)}`),
    retry: false,
  });

/** Tasks someone works on or created. */
export const tasksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["tasks", userId],
    queryFn: () => api<Task[]>(`/tasks?${new URLSearchParams({ user: userId })}`),
  });

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: () => api<AdminUser[]>("/admin/users"),
});

export const adminInvitationsQuery = queryOptions({
  queryKey: ["admin", "invitations"],
  queryFn: () => api<AdminInvitation[]>("/admin/invitations"),
});

export const adminAgentsQuery = queryOptions({
  queryKey: ["admin", "agents"],
  queryFn: () => api<AdminAgent[]>("/admin/agents"),
});

/** A bot's Hermes skills (enabled or not), as the agent page and the marketplace show them. */
export const agentSkillsQuery = (agentId: string) =>
  queryOptions({
    queryKey: ["hermes", "skills", agentId],
    queryFn: () => api<Skill[]>(`/admin/hermes/agents/${agentId}/skills`),
  });

export const adminModelsQuery = queryOptions({
  queryKey: ["admin", "models"],
  queryFn: () => api<AdminModels>("/admin/models"),
});

/** AI provider known to Hermes: configurable by API key (keyEnv) or already signed in on the server. */
export type AiProvider = { slug: string; name: string; keyEnv: string | null; configured: boolean; models: string[] };

export const providersQuery = queryOptions({
  queryKey: ["admin", "providers"],
  queryFn: () => api<{ current: { provider: string; model: string }; providers: AiProvider[] }>("/admin/hermes/providers"),
});

export const modelsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["models", conversationId],
    queryFn: () => api<ModelOptions>(conversationPath(conversationId, "/models")),
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

/** /context: how full the bot's current session is (session null: nothing sent yet, or Claude Code / Codex). */
export type SessionContext = {
  engine: "hermes" | "claude-code" | "codex";
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
