import type { IntegrationType } from "@agora/core";
import { queryOptions } from "@tanstack/react-query";
import { api, type HubSkill, type McpCatalogEntry, type McpServer, type Plugin, type PluginIndexEntry, type RegistryMcp } from "@/lib/api";

export type OfficialSkill = HubSkill & { category?: string; tags?: string[]; installed?: boolean };

export const mcpCatalogQuery = queryOptions({
  queryKey: ["hermes", "mcp", "catalog"],
  queryFn: () => api<{ entries: McpCatalogEntry[] }>("/admin/hermes/mcp/catalog"),
  staleTime: 60_000,
});

export const mcpServersQuery = queryOptions({
  queryKey: ["hermes", "mcp", "servers"],
  queryFn: () => api<{ servers: McpServer[] }>("/admin/hermes/mcp/servers"),
});

export const pluginsQuery = queryOptions({
  queryKey: ["hermes", "plugins"],
  queryFn: () => api<Plugin[]>("/admin/hermes/plugins"),
  staleTime: 60_000,
});

export const officialSkillsQuery = queryOptions({
  queryKey: ["hermes", "skills", "official"],
  queryFn: () => api<{ skills: OfficialSkill[] }>("/admin/hermes/skills/official"),
  staleTime: 10 * 60_000,
});

export const pluginIndexQuery = (q: string) =>
  queryOptions({
    queryKey: ["hermes", "plugins", "search", q],
    queryFn: () => api<{ results: PluginIndexEntry[] }>(`/admin/hermes/plugins/search?q=${encodeURIComponent(q)}`),
    staleTime: 5 * 60_000,
  });

export const hubSearchQuery = (agentId: string, q: string) =>
  queryOptions({
    queryKey: ["hermes", "hub", "search", q],
    queryFn: () => api<{ results: HubSkill[] }>(`/admin/hermes/agents/${agentId}/skills-hub?q=${encodeURIComponent(q)}`),
    staleTime: 5 * 60_000,
  });

/** skills.sh catalog: ranked by installs without a query, search otherwise. */
export const skillsShQuery = (q: string) =>
  queryOptions({
    queryKey: ["skills-sh", q],
    queryFn: () => api<{ skills: HubSkill[] }>(`/admin/hermes/skills/skills-sh?q=${encodeURIComponent(q)}`),
    staleTime: 10 * 60_000,
  });

/** Official MCP registry: search only (over 20,000 servers, no ranking). */
export const mcpRegistryQuery = (q: string) =>
  queryOptions({
    queryKey: ["mcp-registry", q],
    queryFn: () => api<{ servers: RegistryMcp[] }>(`/admin/hermes/mcp/registry?q=${encodeURIComponent(q)}`),
    staleTime: 10 * 60_000,
  });

/** Item shown in the marketplace, whatever its Hermes source. `type`: integration type of an installed connector. */
export type Item =
  | { kind: "mcp"; key: string; name: string; description: string; installed: boolean; entry: McpCatalogEntry; type?: IntegrationType }
  | { kind: "registry"; key: string; name: string; description: string; installed: boolean; server: RegistryMcp; url?: string; type?: IntegrationType }
  | { kind: "skill"; key: string; name: string; description: string; installed: boolean; identifier: string; source: string; url?: string }
  | { kind: "plugin"; key: string; name: string; description: string; installed: boolean; plugin?: Plugin; identifier?: string };

export const fromMcp = (entry: McpCatalogEntry, type?: IntegrationType): Item => ({
  type,
  kind: "mcp",
  key: `mcp:${entry.name}`,
  name: entry.name,
  description: entry.description,
  installed: entry.installed,
  entry,
});

export const fromRegistry = (server: RegistryMcp, installed: Set<string>, type?: IntegrationType): Item => ({
  type,
  kind: "registry",
  key: `registry:${server.id}`,
  name: server.name,
  description: server.description,
  installed: installed.has(server.hermesName),
  server,
  url: server.url,
});

export const fromSkill = (s: HubSkill): Item => ({
  kind: "skill",
  key: `skill:${s.identifier}`,
  name: s.name,
  description: s.description,
  installed: false,
  identifier: s.identifier,
  source: s.source,
  url: s.identifier.startsWith("skills-sh/") ? `https://skills.sh/${s.identifier.slice("skills-sh/".length)}` : undefined,
});

export const fromPlugin = (p: Plugin): Item => ({
  kind: "plugin",
  key: `plugin:${p.name}`,
  name: p.name,
  description: p.description ?? "",
  installed: /^enabled/i.test(p.status),
  plugin: p,
});

export const fromPluginIndex = (p: PluginIndexEntry): Item => ({
  kind: "plugin",
  key: `plugin-index:${p.identifier ?? p.name}`,
  name: p.name,
  description: p.description ?? "",
  installed: false,
  identifier: p.identifier ?? p.repo ?? p.url ?? p.name,
});

export const matches = (item: { name: string; description: string }, q: string) =>
  `${item.name} ${item.description}`.toLowerCase().includes(q.toLowerCase());
