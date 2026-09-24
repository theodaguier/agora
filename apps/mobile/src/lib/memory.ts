import { queryOptions } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { api } from "./api";

/* apps/web/src/components/admin/{WikiMemory,MemoryGraph,Vault}.tsx, and the api's /admin/memory */

export const memoryHref = "/profile/admin/memory" as Href;
export const companyMemoryHref = "/profile/admin/memory/company" as Href;
export const wikiHref = "/profile/admin/memory/wiki" as Href;
export const wikiPageHref = (id: string) => `/profile/admin/memory/page?${new URLSearchParams({ id })}` as Href;
export const vaultHref = "/profile/admin/memory/vault" as Href;
export const vaultRawHref = "/profile/admin/memory/vault/raw" as Href;
/** The credential sheet: `key` edits one, none adds a new one. */
export const secretHref = (key?: string) => `/profile/admin/memory/vault/secret${key ? `?${new URLSearchParams({ key })}` : ""}` as Href;

export type WikiNodeType = "entity" | "concept" | "comparison" | "query" | "session" | "raw" | "agent" | "ghost";
export type WikiNode = { id: string; label: string; type: WikiNodeType; updated?: string; tags?: string[]; summary?: string };
export type WikiEdge = { source: string; target: string };

/** Only what the list needs: it refreshes faster while the curator runs. */
type CuratorStatus = { running: boolean };
export type WikiGraph = { nodes: WikiNode[]; edges: WikiEdge[]; status: CuratorStatus };
export type WikiPage = { id: string; meta: Record<string, string | string[]>; body: string };

/** Legend order. */
export const LEGEND: WikiNodeType[] = ["agent", "entity", "concept", "comparison", "query", "session", "raw", "ghost"];

/** Node colors on the dark theme (the web graph's NODE_COLORS). */
const NODE_COLORS: Record<WikiNodeType, string> = {
  agent: "#f5f5f5",
  entity: "#4ade80",
  concept: "#b8b8b8",
  comparison: "#c4b5fd",
  query: "#fb923c",
  session: "#60a5fa",
  raw: "#5c5c5c",
  ghost: "#e3d26f",
};

/** Light theme: the near-white and light-gray nodes would vanish on a white background. */
const LIGHT_OVERRIDES: Partial<Record<WikiNodeType, string>> = { agent: "#262626", concept: "#8a8a8a" };

export const nodeColor = (type: WikiNodeType, dark: boolean) => (dark ? NODE_COLORS[type] : (LIGHT_OVERRIDES[type] ?? NODE_COLORS[type]));

export const wikiGraphQuery = queryOptions({
  queryKey: ["wiki", "graph"],
  queryFn: () => api<WikiGraph>("/admin/wiki/graph"),
  // During a compilation, the pages fill in live.
  refetchInterval: (q) => (q.state.data?.status.running ? 4000 : 30_000),
});

/** Only wiki pages and raw sources have a file behind them; agents and ghosts don't. */
export const isReadable = (id: string) => /^(wiki|raw)\//.test(id);

export const wikiPageQuery = (id: string) =>
  queryOptions({
    queryKey: ["wiki", "page", id],
    queryFn: () => api<WikiPage>(`/admin/wiki/page?id=${encodeURIComponent(id)}`),
    enabled: isReadable(id),
  });

/** Nodes linked to a node, in either direction. */
export function linkedTo(id: string, nodes: WikiNode[], edges: WikiEdge[]) {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  return nodes.filter((n) => out.has(n.id));
}

/**
 * Obsidian [[links]] read as their label, emphasized: the pages they point to are listed under
 * the page ("Linked to n pages"), where they open.
 */
export const withLinks = (body: string, nodes: WikiNode[]) => {
  const labels = new Map(nodes.map((n) => [n.id, n.label]));
  return body.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
    const clean = target.trim().replace(/\.md$/, "");
    const label = alias?.trim() || labels.get(clean) || labels.get(`wiki/${clean}`) || clean.split("/").at(-1);
    return `*${label}*`;
  });
};

/* ---------- Company memory: injected into every agent's context ---------- */

export const companyMemoryQuery = queryOptions({
  queryKey: ["admin", "memory"],
  queryFn: () => api<{ value: string; max: number }>("/admin/memory"),
});

/* ---------- Vault: the credentials of the Hermes .env files ---------- */

export type Secret = { key: string; preview: string | null; description: string; instance: boolean; agents: string[] };

export const vaultQuery = queryOptions({ queryKey: ["hermes", "vault"], queryFn: () => api<Secret[]>("/admin/hermes/vault") });

/** Same rule as the api: a shell variable name. */
export const VAULT_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type RawResult = { added: string[]; updated: string[]; removed: string[] };

/** Names defined in a .env text, as the api reads them. */
export const envNames = (text: string) =>
  new Set(
    text
      .split(/\r?\n/)
      .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
      .filter((k): k is string => !!k),
  );
