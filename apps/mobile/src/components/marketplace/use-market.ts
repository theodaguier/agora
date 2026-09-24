import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { adminAgentsQuery, skillsQuery, type AdminAgent, type Skill } from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";
import {
  fromMcp,
  fromPlugin,
  fromPluginIndex,
  fromRegistry,
  fromSkill,
  hubSearchQuery,
  matches,
  mcpCatalogQuery,
  mcpRegistryQuery,
  mcpServersQuery,
  officialSkillsQuery,
  pluginIndexQuery,
  pluginsQuery,
  skillsShQuery,
  type Item,
} from "@/lib/marketplace";

/* useMarket of apps/web/src/components/marketplace/Marketplace.tsx: every catalog, searched together. */

export type Section = "mcp" | "registry" | "skill" | "skillsSh" | "plugin";

export const sectionTitles = defineMessages<Record<Section, string>>({
  en: { mcp: "Connectors", registry: "MCP registry", skill: "Skills", skillsSh: "skills.sh", plugin: "Hermes plugins" },
  fr: { mcp: "Connecteurs", registry: "Registre MCP", skill: "Skills", skillsSh: "skills.sh", plugin: "Plugins Hermes" },
});

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A skill installed from a hub (skills.sh, official…), with the bots that have it. */
export type InstalledSkill = { name: string; description: string; agents: AdminAgent[] };

/**
 * useSkillOwners of apps/web/src/components/marketplace/data.ts. Skills are installed per bot, so we
 * read each bot's list: `owners` covers every skill (bundled ones too), `installed` only hub ones.
 */
export function useSkillOwners() {
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  // Stable per agent list, so React Query reruns it only when a list changes.
  const combine = useCallback(
    (lists: UseQueryResult<Skill[]>[]) => {
      const owners = new Map<string, string[]>();
      const hub = new Map<string, InstalledSkill>();
      agents.forEach((agent, i) => {
        for (const s of lists[i]?.data ?? []) {
          owners.set(s.name, [...(owners.get(s.name) ?? []), agent.id]);
          if (s.provenance !== "hub") continue;
          const entry = hub.get(s.name) ?? { name: s.name, description: s.description, agents: [] };
          entry.agents.push(agent);
          hub.set(s.name, entry);
        }
      });
      return { owners, installed: [...hub.values()], pending: lists.some((l) => l.isPending) };
    },
    [agents],
  );
  return useQueries({ queries: agents.map((a) => skillsQuery(a.id)), combine });
}

/** Not installed first: what's left to add comes before what's already there. */
const firstUninstalled = (xs: Item[]) => [...xs.filter((x) => !x.installed), ...xs.filter((x) => x.installed)];

export function useMarket(query: string) {
  const agents = useQuery(adminAgentsQuery);
  const catalog = useQuery(mcpCatalogQuery);
  const plugins = useQuery(pluginsQuery);
  const official = useQuery(officialSkillsQuery);
  // Local catalogs filter as you type (deferred, so typing stays fluid); the remote searches wait for a pause.
  const local = useDeferredValue(query.trim());
  const q = useDebounced(local, 400);
  const searchAgent = agents.data?.[0]?.id;
  const hub = useQuery({ ...hubSearchQuery(searchAgent ?? "", q), enabled: !!searchAgent && q.length > 1 });
  const servers = useQuery(mcpServersQuery);
  const registry = useQuery({ ...mcpRegistryQuery(q), enabled: q.length > 1 });
  const skillsSh = useQuery({ ...skillsShQuery(q.length > 1 ? q : ""), placeholderData: (prev) => prev });
  const index = useQuery({ ...pluginIndexQuery(q), enabled: q.length > 1 });
  const skillOwners = useSkillOwners();

  return {
    ...marketItems(local, q, agents.data ?? [], {
      servers: servers.data,
      catalog: catalog.data,
      official: official.data,
      skillsSh: skillsSh.data,
      skillsShStale: skillsSh.isPlaceholderData,
      registry: registry.data,
      hub: hub.data,
      plugins: plugins.data,
      index: index.data,
      skillOwners,
    }),
    // Sections still waiting for their first load: shown as skeletons.
    pending: { mcp: catalog.isPending, skill: official.isPending, skillsSh: skillsSh.isPending, plugin: plugins.isPending } as Partial<Record<Section, boolean>>,
    // Typing counts as searching until the remote searches have started.
    searching: (local.length > 1 && local !== q) || hub.isFetching || skillsSh.isFetching || registry.isFetching || index.isFetching,
    error: catalog.error ?? plugins.error ?? official.error ?? skillsSh.error,
    refetch: () => Promise.all([catalog.refetch(), plugins.refetch(), official.refetch(), servers.refetch(), skillsSh.refetch(), agents.refetch()]),
  };
}

/** The data of a query (its options object or factory result), undefined until loaded. */
type DataOf<Q extends { queryFn?: unknown }> = Awaited<ReturnType<Extract<NonNullable<Q["queryFn"]>, (...args: never[]) => unknown>>> | undefined;

type MarketData = {
  servers: DataOf<typeof mcpServersQuery>;
  catalog: DataOf<typeof mcpCatalogQuery>;
  official: DataOf<typeof officialSkillsQuery>;
  skillsSh: DataOf<ReturnType<typeof skillsShQuery>>;
  /** skills.sh still shows the previous query's results. */
  skillsShStale: boolean;
  registry: DataOf<ReturnType<typeof mcpRegistryQuery>>;
  hub: DataOf<ReturnType<typeof hubSearchQuery>>;
  plugins: DataOf<typeof pluginsQuery>;
  index: DataOf<ReturnType<typeof pluginIndexQuery>>;
  skillOwners: { owners: Map<string, string[]>; installed: InstalledSkill[] };
};

/**
 * Every catalog as sections (pure: useMarket only gathers the queries). `q` filters what is
 * already loaded; `remote` is the query the searches (registry, hub, plugin index) answered.
 */
function marketItems<A extends { hermesProfile: string; name: string }>(q: string, remote: string, agents: A[], d: MarketData) {
  const types = new Map((d.servers?.servers ?? []).map((s) => [s.name, s.type]));
  const mcp = (d.catalog?.entries ?? []).map((e) => fromMcp(e, types.get(e.name)));
  const { owners } = d.skillOwners;
  const skills = (d.official?.skills ?? []).map((s) => fromSkill(s, owners));
  const sh = (d.skillsSh?.skills ?? []).map((s) => fromSkill(s, owners));
  const installedMcp = new Set((d.servers?.servers ?? []).map((s) => s.name));
  const reg = remote
    ? (d.registry?.servers ?? []).filter((r) => !mcp.some((m) => m.name === r.hermesName)).map((r) => fromRegistry(r, installedMcp, types.get(r.hermesName)))
    : [];
  const hubSkills = (d.hub?.results ?? []).map((s) => fromSkill(s, owners)).filter((s) => !skills.some((o) => o.key === s.key) && !sh.some((o) => o.key === s.key));
  const plugin = (d.plugins ?? []).map(fromPlugin);
  const indexPlugins = (d.index?.results ?? []).map(fromPluginIndex).filter((p) => !plugin.some((x) => x.name === p.name));
  const filter = <T extends { name: string; description: string }>(xs: T[]) => (q ? xs.filter((x) => matches(x, q)) : xs);
  const items: Record<Section, Item[]> = {
    mcp: q ? filter(mcp) : firstUninstalled(mcp),
    registry: reg,
    skill: q ? [...filter(skills), ...hubSkills] : skills,
    // Until skills.sh answers this very query, what it shows (ranking, previous search) is filtered here.
    skillsSh: q && (d.skillsShStale || remote !== q || remote.length < 2) ? filter(sh) : sh,
    plugin: q ? [...filter(plugin), ...indexPlugins] : firstUninstalled(plugin),
  };
  return {
    items,
    bots: filter(agents.map((a) => ({ ...a, description: a.hermesProfile }))),
    installedCount: mcp.filter((m) => m.installed).length + plugin.filter((p) => p.installed).length + d.skillOwners.installed.length,
  };
}
