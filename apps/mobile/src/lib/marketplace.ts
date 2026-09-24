import type { IntegrationType } from "@agora/core";
import { queryOptions } from "@tanstack/react-query";
import type { Href } from "expo-router";
import * as Linking from "expo-linking";
import { useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import { defineMessages } from "./i18n";

/* apps/web/src/components/marketplace/{data.ts,use-mcp-oauth.ts}, AddSheet's waitAction, admin/ui's RestartProvider */

const messages = defineMessages({
  en: {
    hermesError: (error: string) => `Hermes: ${error}`,
    notConfirmed: "Hermes didn't confirm the installation.",
    tooLong: "The installation is taking too long.",
    noAuthUrl: "The service didn't provide an authorization URL.",
    authorizeInTab: "Allow access in the browser that just opened…",
    authDenied: "Authorization denied.",
    authExpired: "The authorization expired.",
    tabClosed: "The authorization window was closed before the end.",
  },
  fr: {
    hermesError: (error: string) => `Hermes : ${error}`,
    notConfirmed: "Hermes n'a pas confirmé l'installation.",
    tooLong: "L'installation prend trop de temps.",
    noAuthUrl: "Le service n'a pas fourni d'adresse d'autorisation.",
    authorizeInTab: "Autorise l'accès dans le navigateur ouvert…",
    authDenied: "Autorisation refusée.",
    authExpired: "L'autorisation a expiré.",
    tabClosed: "La fenêtre d'autorisation a été fermée avant la fin.",
  },
});

export type HubSkill = { name: string; description: string; source: string; identifier: string; trust_level?: string };

export type McpServer = {
  name: string;
  transport?: string;
  url?: string;
  command?: string;
  enabled?: boolean;
  auth?: string;
  /** Integration type; `typeSet` false = guessed, never chosen by an admin. */
  type: IntegrationType;
  typeSet: boolean;
};

/** Server from the official MCP registry, already translated into Hermes config by the API. */
export type RegistryMcp = {
  id: string;
  name: string;
  hermesName: string;
  description: string;
  url?: string;
  verified: boolean;
  transport: "remote" | "stdio";
  bearer: boolean;
  env: { name: string; description?: string; required: boolean; secret: boolean }[];
  command?: string;
};

export type McpCatalogEntry = {
  name: string;
  description: string;
  transport: string;
  auth_type?: string;
  required_env: (string | { name: string; description?: string })[];
  post_install?: string;
  installed: boolean;
  enabled: boolean;
};

export type Plugin = { name: string; status: string; version?: string; description?: string; source?: string };

export type PluginIndexEntry = { name: string; description?: string; identifier?: string; repo?: string; url?: string };

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

/** `owners`: ids of the bots that already have a skill of that name. */
export const fromSkill = (s: HubSkill, owners?: Map<string, string[]>): Item => ({
  kind: "skill",
  key: `skill:${s.identifier}`,
  name: s.name,
  description: s.description,
  installed: !!owners?.has(s.name),
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

/* ---------- Routes (profile/marketplace) ---------- */

export const marketplaceHref = "/profile/marketplace" as Href;
export const installedHref = "/profile/marketplace/installed" as Href;
export const customConnectorHref = "/profile/marketplace/custom" as Href;
/** Every item of a marketplace section (the web's "Show all"), for the same search. */
export const sectionHref = (section: string, q: string) => `/profile/marketplace/all?${new URLSearchParams({ section, q })}` as Href;

/* ---------- The item an add sheet opens on ---------- */

/**
 * Items come from several catalogs and searches, too big for route params: the list keeps the
 * one it opens here, and the sheet reads it back by key.
 */
const opened = new Map<string, Item>();

/** Route of the add sheet of an item. */
export const addHref = (item: Item) => {
  opened.set(item.key, item);
  return `/profile/marketplace/add?${new URLSearchParams({ key: item.key })}` as Href;
};

export const openedItem = (key: string | undefined) => (key ? opened.get(key) : undefined);

/* ---------- Hermes restart (MCP servers, plugins, credentials) ---------- */

let restartNeeded = false;
const restartListeners = new Set<() => void>();

/** Something Hermes loads at start changed: the banner asks for a restart, on every screen that shows it. */
export function flagRestart() {
  restartNeeded = true;
  restartListeners.forEach((l) => l());
}

export function clearRestart() {
  restartNeeded = false;
  restartListeners.forEach((l) => l());
}

export const useRestartNeeded = () =>
  useSyncExternalStore(
    (l) => {
      restartListeners.add(l);
      return () => restartListeners.delete(l);
    },
    () => restartNeeded,
  );

/* ---------- Skill installs ---------- */

/**
 * Waits for a Hermes dashboard background task to finish (skill install).
 * The exit code is 0 even on failure, so we read the log of the
 * last run to know whether the skill was actually installed.
 */
export async function waitAction(name: string) {
  for (let i = 0; i < 120; i++) {
    const s = await api<{ running: boolean; exit_code: number | null; lines?: string[] }>(`/admin/hermes/actions/${encodeURIComponent(name)}`);
    if (!s.running) {
      const lines = s.lines ?? [];
      const start = lines.map((l) => l.startsWith("===") && l.includes(" started ")).lastIndexOf(true);
      const run = lines.slice(start + 1).join("\n");
      const error = run.match(/Error:\s*([\s\S]*?)(?:\n\n|$)/);
      if (error) throw new Error(messages.hermesError(error[1]!.replace(/\s+/g, " ").trim()));
      if (s.exit_code !== 0 || !/^Installed:/m.test(run)) throw new Error(messages.notConfirmed);
      return run.match(/Verdict:\s*(\w+)/)?.[1] ?? null;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(messages.tooLong);
}

/* ---------- OAuth of a declared MCP connector ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The authorization itself, outside the hook (React Compiler doesn't handle `try` without `catch`). */
async function runMcpOAuth(id: string, before: (() => Promise<unknown>) | undefined, onStatus: (status: string) => void) {
  await before?.();
  const flow = await api<{ flow_id: string; authorization_url: string | null; error: string | null }>(`/mcp-requests/${id}/oauth`, { method: "POST" });
  if (!flow.authorization_url) throw new Error(flow.error ?? messages.noAuthUrl);
  const check = () => api<{ status: string; error: string | null }>(`/mcp-requests/${id}/oauth/${flow.flow_id}`);
  // Back in the app after the browser: from then on, a pending status means it was abandoned.
  let left = false;
  let returned = false;
  const sub = AppState.addEventListener("change", (state) => {
    if (state !== "active") left = true;
    else if (left) returned = true;
  });
  try {
    await Linking.openURL(flow.authorization_url);
    onStatus(messages.authorizeInTab);
    for (let i = 0; i < 150; i++) {
      await sleep(2_000);
      const s = await check();
      if (s.status === "approved") return;
      if (s.status === "error") throw new Error(s.error ?? messages.authDenied);
      if (returned) {
        await sleep(2_000);
        if ((await check()).status === "approved") return;
        await api(`/mcp-requests/${id}/oauth`, { method: "DELETE" }).catch(() => {});
        throw new Error(messages.tabClosed);
      }
    }
    throw new Error(messages.authExpired);
  } finally {
    sub.remove();
  }
}

/**
 * OAuth sign-in of an app-declared MCP connector (`/mcp-requests/:id`): opens the provider in
 * the browser and waits for Hermes to receive the tokens. The web watches its tab close; here,
 * coming back to the app without an approval ends the wait (after one last check).
 * `before` runs before the authorization starts (the install in Hermes, for instance).
 */
export function useMcpOAuth() {
  const [status, setStatus] = useState<string | null>(null);
  const authorize = (id: string, before?: () => Promise<unknown>) => runMcpOAuth(id, before, setStatus).finally(() => setStatus(null));
  return { authorize, status };
}
