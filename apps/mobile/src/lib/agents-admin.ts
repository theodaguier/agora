import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useMe } from "@/components/server-scope";
import { api } from "./api";
import { sessionQuery } from "./queries";
import type { AvatarShape } from "./types";

/* Admin side of the bots: apps/web/src/components/admin/{Agents,AgentDetail,AgentProfile,AgentSoul,AvatarPicker,Access}.tsx */

export type AdminAgent = {
  id: string;
  name: string;
  hermesProfile: string;
  avatarShape: AvatarShape;
  avatarColor: string;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  username: string | null;
  title: string;
  agents: string[];
};

export type Toolset = {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
  /** Gives the server to whoever talks to the agent: off by default, turned on only after a warning. */
  risky?: boolean;
};

export type Skill = { name: string; description: string; category?: string; enabled: boolean; provenance?: string };

export type AgentMcp = { name: string; url?: string; command?: string; instanceEnabled: boolean; enabled: boolean };

/** The profile's default model and the models its provider offers. */
export type AgentModelOptions = { provider: string; defaultModel: string; models: { id: string; reasoning: boolean }[] };

/** Screens of the bots admin (routes under profile/admin/agents). */
export type AgentSection = "profile" | "soul" | "model" | "tools" | "skills" | "memory" | "access";

export const agentsHref = "/profile/admin/agents" as Href;
export const newAgentHref = "/profile/admin/agents/new" as Href;
// An agent's access is the Access screen seen from that agent: one screen, reached from both places.
export const agentHref = (id: string, section?: AgentSection) =>
  (section === "access"
    ? `/profile/admin/access/agent/${encodeURIComponent(id)}`
    : `/profile/admin/agents/${encodeURIComponent(id)}${section ? `/${section}` : ""}`) as Href;

export const avatarColors = ["#9a6a4b", "#22b35e", "#f26b1d", "#2f7cf6", "#14a89a", "#9a7cf0", "#9ca3af", "#e5484d"];

/** The main profile: sees every MCP server and every credential of the instance. */
export const isDefaultProfile = (a: Pick<AdminAgent, "hermesProfile">) => a.hermesProfile === "default";

export const adminAgentsQuery = queryOptions({
  queryKey: ["admin", "agents"],
  queryFn: () => api<AdminAgent[]>("/admin/agents"),
});

export const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: () => api<AdminUser[]>("/admin/users"),
});

export const orgQuery = queryOptions({
  queryKey: ["org"],
  // requireTwoFactor: every account must turn on two-step verification (components/two-factor.tsx).
  queryFn: () => api<{ name: string; locale: "fr" | "en"; image: string | null; requireTwoFactor?: boolean }>("/org"),
  staleTime: 5 * 60_000,
});

export const agentModelQuery = (agentId: string) =>
  queryOptions({ queryKey: ["hermes", "model", agentId], queryFn: () => api<AgentModelOptions>(`/admin/hermes/agents/${agentId}/model`) });

export const toolsetsQuery = (agentId: string) =>
  queryOptions({ queryKey: ["hermes", "toolsets", agentId], queryFn: () => api<Toolset[]>(`/admin/hermes/agents/${agentId}/toolsets`) });

export const agentMcpQuery = (agentId: string) =>
  queryOptions({ queryKey: ["hermes", "agent-mcp", agentId], queryFn: () => api<AgentMcp[]>(`/admin/hermes/agents/${agentId}/mcp`) });

export const mcpTypesQuery = queryOptions({
  queryKey: ["hermes", "mcp", "types"],
  queryFn: () => api<Record<string, import("@agora/core").IntegrationType>>("/admin/hermes/mcp/types"),
});

export const skillsQuery = (agentId: string) =>
  queryOptions({ queryKey: ["hermes", "skills", agentId], queryFn: () => api<Skill[]>(`/admin/hermes/agents/${agentId}/skills`) });

export const soulQuery = (agentId: string) =>
  queryOptions({ queryKey: ["hermes", "soul", agentId], queryFn: () => api<{ value: string }>(`/admin/hermes/agents/${agentId}/soul`) });

export const agentMemoryQuery = (agentId: string) =>
  queryOptions({
    queryKey: ["hermes", "agent-memory", agentId],
    queryFn: () => api<{ notes: string; users: string }>(`/admin/hermes/agents/${agentId}/memory`),
  });

/** Hermes prefixes toolset labels with an emoji ("🔍 Web Search"): the list stays text-only. */
export const withoutEmoji = (label: string) => label.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");

/** Same rule as the api for a Hermes profile name. */
export const PROFILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * Admin screens: `allowed` once the session says so, `denied` for everyone else (they go back).
 * `pending` while the session loads, so an admin is never bounced on a cold start.
 */
export function useAdminAccess(): "pending" | "allowed" | "denied" {
  const me = useMe();
  const session = useQuery(sessionQuery);
  if (me.role === "admin") return "allowed";
  return session.isPending ? "pending" : "denied";
}

type ActionStatus = { name: string; running: boolean; exit_code: number | null; lines?: string[] };

/** Hermes dashboard background task (skill install or uninstall): polled until it ends. */
export function useHermesAction(name: string | null, onDone: (ok: boolean) => void) {
  return useQuery({
    queryKey: ["hermes", "action", name],
    enabled: !!name,
    queryFn: async () => {
      const status = await api<ActionStatus>(`/admin/hermes/actions/${encodeURIComponent(name!)}`);
      if (!status.running) onDone(status.exit_code === 0);
      return status;
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.running ? false : 1500),
  });
}
