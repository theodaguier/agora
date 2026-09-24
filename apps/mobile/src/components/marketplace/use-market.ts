import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";
import { adminAgentsQuery } from "@/lib/agents-admin";
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
};

/**
 * Every catalog as sections (pure: useMarket only gathers the queries). `q` filters what is
 * already loaded; `remote` is the query the searches (registry, hub, plugin index) answered.
 */
function marketItems<A extends { hermesProfile: string; name: string }>(q: string, remote: string, agents: A[], d: MarketData) {
  const types = new Map((d.servers?.servers ?? []).map((s) => [s.name, s.type]));
  const mcp = (d.catalog?.entries ?? []).map((e) => fromMcp(e, types.get(e.name)));
  const skills = (d.official?.skills ?? []).map(fromSkill);
  const sh = (d.skillsSh?.skills ?? []).map(fromSkill);
  const installedMcp = new Set((d.servers?.servers ?? []).map((s) => s.name));
  const reg = remote
    ? (d.registry?.servers ?? []).filter((r) => !mcp.some((m) => m.name === r.hermesName)).map((r) => fromRegistry(r, installedMcp, types.get(r.hermesName)))
    : [];
  const hubSkills = (d.hub?.results ?? []).map(fromSkill).filter((s) => !skills.some((o) => o.key === s.key) && !sh.some((o) => o.key === s.key));
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
    installedCount: mcp.filter((m) => m.installed).length + plugin.filter((p) => p.installed).length,
  };
}
