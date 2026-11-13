import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CheckIcon, ChevronLeftIcon, PackageIcon, PuzzleIcon, SearchIcon, CloseIcon } from "@/components/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RestartProvider } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item as ItemRow, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, type AdminAgent } from "@/lib/api";
import { adminAgentsQuery, adminUsersQuery, agentsQuery } from "@/lib/queries";
import { AddSheet } from "./AddSheet";
import { MarketSection, Tiles } from "./layout";
import { CustomConnectorSheet } from "./CustomConnectorSheet";
import { InitialTile, IntegrationTile } from "./IntegrationType";
import { guessIntegrationType } from "@agora/core";
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
  useSkillOwners,
  type Item,
} from "./data";
import { Installed } from "./Installed";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

type Section = "bots" | "mcp" | "registry" | "skill" | "skillsSh" | "plugin";
type Filter = "all" | "mcp" | "skill" | "plugin" | "bots";
const FILTERS: Filter[] = ["all", "mcp", "skill", "plugin", "bots"];
type View = { kind: "home" } | { kind: "all"; section: Section; query?: string } | { kind: "installed" } | { kind: "add"; item: Item } | { kind: "custom" };

const messages = defineMessages<{
  titles: Record<Section, string>;
  title: string;
  installed: string;
  searchPlaceholder: string;
  searchLabel: string;
  bots: string;
  featuredBots: string;
  nothingFound: (q: string) => string;
  noResults: string;
  noMatch: string;
  emptySection: Record<Section, string>;
  filter: string;
  showAll: string;
  unavailable: string;
  enabled: string;
  added: string;
  opening: string;
  custom: string;
  open: string;
  filterKinds: string;
  filters: Record<Filter, string>;
}>({
  en: {
    titles: { bots: "Team bots", mcp: "Connectors", registry: "MCP registry", skill: "Skills", skillsSh: "Community skills", plugin: "Hermes plugins" },
    title: "Marketplace",
    installed: "Installed",
    searchPlaceholder: "Search connectors, skills, plugins and bots",
    searchLabel: "Search the marketplace",
    bots: "Bots",
    featuredBots: "Featured bots",
    nothingFound: (q) => `Nothing found for “${q}”.`,
    noResults: "No results",
    noMatch: "Nothing matches this filter.",
    emptySection: {
      bots: "No bots in the team yet.",
      mcp: "No connectors in the catalog yet.",
      registry: "Nothing found in the MCP registry.",
      skill: "No skills in the catalog yet.",
      skillsSh: "Nothing on skills.sh right now.",
      plugin: "No Hermes plugins available yet.",
    },
    filter: "Filter",
    showAll: "Show all",
    unavailable: "Catalog unreachable for now.",
    enabled: "Enabled",
    added: "Added",
    opening: "Opening…",
    custom: "Custom connector",
    open: "Open",
    filterKinds: "Show",
    filters: { all: "All", mcp: "Connectors", skill: "Skills", plugin: "Plugins", bots: "Bots" },
  },
  fr: {
    titles: { bots: "Bots de l'équipe", mcp: "Connecteurs", registry: "Registre MCP", skill: "Skills", skillsSh: "Skills de la communauté", plugin: "Plugins Hermes" },
    title: "Marketplace",
    installed: "Installés",
    searchPlaceholder: "Rechercher des connecteurs, skills, plugins et bots",
    searchLabel: "Rechercher dans la marketplace",
    bots: "Bots",
    featuredBots: "Bots en vedette",
    nothingFound: (q) => `Rien trouvé pour « ${q} ».`,
    noResults: "Aucun résultat",
    noMatch: "Rien ne correspond à ce filtre.",
    emptySection: {
      bots: "Aucun bot dans l'équipe pour l'instant.",
      mcp: "Aucun connecteur dans le catalogue pour l'instant.",
      registry: "Rien trouvé dans le registre MCP.",
      skill: "Aucun skill dans le catalogue pour l'instant.",
      skillsSh: "Rien sur skills.sh pour l'instant.",
      plugin: "Aucun plugin Hermes disponible pour l'instant.",
    },
    filter: "Filtrer",
    showAll: "Tout afficher",
    unavailable: "Catalogue injoignable pour l'instant.",
    enabled: "Activé",
    added: "Ajouté",
    opening: "Ouverture…",
    custom: "Connecteur personnalisé",
    open: "Ouvrir",
    filterKinds: "Afficher",
    filters: { all: "Tout", mcp: "Connecteurs", skill: "Skills", plugin: "Plugins", bots: "Bots" },
  },
});

export function Marketplace({ onClose }: { onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const [history, setHistory] = useState<View[]>([{ kind: "home" }]);
  const view = history[history.length - 1]!;
  const push = (v: View) => setHistory((h) => [...h, v]);
  const back = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        // Escape goes back one level in the navigation before closing.
        if (details.reason === "escape-key" && history.length > 1) back();
        else onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="flex h-4/5 flex-col gap-0 p-0 sm:max-w-4xl">
        {/* Figma « S1 · Marketplace »: the title (back first, deeper in), the installed apps, close. */}
        <DialogHeader className="flex-row items-center gap-1 px-6 pt-5 pb-4">
          {history.length > 1 && (
            <Button variant="ghost" size="icon-sm" aria-label={c.back} onClick={back}>
              <ChevronLeftIcon />
            </Button>
          )}
          <DialogTitle className="text-title font-medium">{t.title}</DialogTitle>
          <span className="flex-1" />
          {view.kind !== "installed" && <InstalledButton onClick={() => push({ kind: "installed" })} />}
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label={c.close} />}>
            <CloseIcon />
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <RestartProvider>
            {view.kind === "home" && <Home push={push} onClose={onClose} />}
            {view.kind === "all" && <AllOf section={view.section} query={view.query} push={push} onClose={onClose} />}
            {view.kind === "installed" && <Installed />}
            {view.kind === "add" && <AddSheet item={view.item} onDone={back} />}
            {view.kind === "custom" && <CustomConnectorSheet onDone={back} />}
          </RestartProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Aggregated data ---------- */

function useMarket(query: string) {
  const agents = useQuery(adminAgentsQuery);
  const catalog = useQuery(mcpCatalogQuery);
  const plugins = useQuery(pluginsQuery);
  const official = useQuery(officialSkillsQuery);
  const q = useDebounced(query.trim(), 400);
  const searchAgent = agents.data?.[0]?.id;
  const hub = useQuery({ ...hubSearchQuery(searchAgent ?? "", q), enabled: !!searchAgent && q.length > 1 });
  const servers = useQuery(mcpServersQuery);
  const registry = useQuery({ ...mcpRegistryQuery(q), enabled: q.length > 1 });
  const skillsSh = useQuery({ ...skillsShQuery(q.length > 1 ? q : ""), placeholderData: (prev) => prev });
  const index = useQuery({ ...pluginIndexQuery(q), enabled: q.length > 1 });
  const { owners, installed: installedSkills } = useSkillOwners();

  return useMemo(() => {
    const types = new Map((servers.data?.servers ?? []).map((s) => [s.name, s.type]));
    const mcp = (catalog.data?.entries ?? []).map((e) => fromMcp(e, types.get(e.name)));
    const skills = (official.data?.skills ?? []).map((s) => fromSkill(s, owners));
    const sh = (skillsSh.data?.skills ?? []).map((s) => fromSkill(s, owners));
    const installedMcp = new Set((servers.data?.servers ?? []).map((s) => s.name));
    const reg = q ? (registry.data?.servers ?? []).filter((r) => !mcp.some((m) => m.name === r.hermesName)).map((r) => fromRegistry(r, installedMcp, types.get(r.hermesName))) : [];
    const hubSkills = (hub.data?.results ?? []).map((s) => fromSkill(s, owners)).filter((s) => !skills.some((o) => o.key === s.key) && !sh.some((o) => o.key === s.key));
    const plugin = (plugins.data ?? []).map(fromPlugin);
    const indexPlugins = (index.data?.results ?? []).map(fromPluginIndex).filter((p) => !plugin.some((x) => x.name === p.name));
    const filter = <T extends { name: string; description: string }>(xs: T[]) => (q ? xs.filter((x) => matches(x, q)) : xs);
    return {
      bots: filter((agents.data ?? []).map((a) => ({ ...a, description: "" }))),
      mcp: filter(mcp),
      registry: reg,
      skill: q ? [...filter(skills), ...hubSkills] : skills,
      skillsSh: sh,
      plugin: q ? [...filter(plugin), ...indexPlugins] : plugin,
      installedCount: mcp.filter((m) => m.installed).length + plugin.filter((p) => p.installed).length + installedSkills.length,
      // Sections still waiting for their first load: shown as skeletons.
      pending: { bots: agents.isPending, mcp: catalog.isPending, skill: official.isPending, skillsSh: skillsSh.isPending, plugin: plugins.isPending } as Partial<Record<Section, boolean>>,
      // Sections whose catalog can't be reached (Hermes down): one line instead of endless skeletons.
      failed: { bots: agents.isError, mcp: catalog.isError, skill: official.isError, skillsSh: skillsSh.isError, plugin: plugins.isError } as Partial<Record<Section, boolean>>,
      searching: hub.isFetching || skillsSh.isFetching || registry.isFetching || index.isFetching,
    };
  }, [owners, installedSkills, agents.data, catalog.data, plugins.data, official.data, hub.data, skillsSh.data, servers.data, registry.data, index.data, q, catalog.isPending, plugins.isPending, official.isPending, skillsSh.isPending, hub.isFetching, skillsSh.isFetching, registry.isFetching, index.isFetching, catalog.isError, plugins.isError, official.isError, skillsSh.isError, agents.isPending, agents.isError]);
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ---------- Views ---------- */

function Home({ push, onClose }: { push: (v: View) => void; onClose: () => void }) {
  const t = useT(messages);
  const [query, setQuery] = useState("");
  const market = useMarket(query);
  const searching = query.trim().length > 0;
  const [filter, setFilter] = useState<Filter>("all");
  const firstUninstalled = (xs: Item[]) => [...xs.filter((x) => !x.installed), ...xs.filter((x) => x.installed)];

  const show = (f: Filter) => filter === "all" || filter === f;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
      <InputGroup className="h-8 bg-transparent text-ui dark:bg-transparent">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
        />
        {searching && market.searching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </InputGroup>

      {/* Which kinds the page shows, each with how many there are; a connector of one's own on the right. */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t.filterKinds}>
        {FILTERS.map((f) => {
          const count = f === "all" ? null : f === "skill" ? market.skill.length + market.skillsSh.length : market[f].length;
          return (
            <Button
              key={f}
              role="tab"
              aria-selected={filter === f}
              variant="outline"
              size="sm"
              onClick={() => setFilter(f)}
              className={cn("h-7 gap-1.5 rounded-full px-3 text-ui font-normal", filter === f ? "bg-accent text-foreground" : "bg-transparent text-muted-foreground")}
            >
              {t.filters[f]}
              {!!count && <span className="text-subtle-foreground tabular-nums">{count}</span>}
            </Button>
          );
        })}
        <span className="flex-1" />
        <Button size="sm" onClick={() => push({ kind: "custom" })}>
          {t.custom}
        </Button>
      </div>
      </div>

      {show("bots") && (market.bots.length > 0 || (filter === "bots" && !searching)) && (
        <Block title={t.titles.bots} onAll={market.bots.length > 4 ? () => push({ kind: "all", section: "bots" }) : undefined}>
          {market.bots.length > 0 ? (
            <BotCards agents={market.bots.slice(0, 4)} onClose={onClose} />
          ) : market.pending.bots ? (
            <SkeletonTiles />
          ) : (
            <p className="text-xs text-subtle-foreground">{market.failed.bots ? t.unavailable : t.emptySection.bots}</p>
          )}
        </Block>
      )}
      {show("mcp") && <ItemBlock
        section="mcp"
        loading={market.pending.mcp}
        failed={market.failed.mcp}
        items={searching ? market.mcp : firstUninstalled(market.mcp)}
        push={push}
        query={query}
      />}
      {show("mcp") && searching && <ItemBlock section="registry" items={market.registry} push={push} query={query} />}
      {show("skill") && <ItemBlock section="skill" loading={market.pending.skill}
        failed={market.failed.skill} items={market.skill} push={push} query={query} />}
      {show("skill") && <ItemBlock section="skillsSh" loading={market.pending.skillsSh}
        failed={market.failed.skillsSh} items={market.skillsSh} push={push} query={query} />}
      {show("plugin") && <ItemBlock section="plugin" loading={market.pending.plugin}
        failed={market.failed.plugin} items={searching ? market.plugin : firstUninstalled(market.plugin)} push={push} query={query} />}

      {searching &&
        !market.searching &&
        !(show("bots") && market.bots.length) &&
        !(show("mcp") && (market.mcp.length || market.registry.length)) &&
        !(show("skill") && (market.skill.length || market.skillsSh.length)) &&
        !(show("plugin") && market.plugin.length) && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t.noResults}</EmptyTitle>
              <EmptyDescription>{t.nothingFound(query)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
    </div>
  );
}

function AllOf({ section, query = "", push, onClose }: { section: Section; query?: string; push: (v: View) => void; onClose: () => void }) {
  const t = useT(messages);
  const market = useMarket(query);
  const [filter, setFilter] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium">{t.titles[section]}</h2>
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} aria-label={t.filter} />
      {!market[section].length && market.pending[section] ? (
        <SkeletonTiles />
      ) : !market[section].length ? (
        <p className="text-xs text-subtle-foreground">{market.failed[section] ? t.unavailable : t.emptySection[section]}</p>
      ) : section === "bots" ? (
        market.bots.some((a) => matches(a, filter)) ? (
          <BotCards agents={market.bots.filter((a) => matches(a, filter))} onClose={onClose} />
        ) : (
          <p className="text-xs text-subtle-foreground">{t.noMatch}</p>
        )
      ) : market[section].some((i) => matches(i, filter)) ? (
        <Tiles>
          {market[section]
            .filter((i) => matches(i, filter))
            .map((item) => (
              <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} />
            ))}
        </Tiles>
      ) : (
        <p className="text-xs text-subtle-foreground">{t.noMatch}</p>
      )}
    </div>
  );
}

/** A section: its title and actions (« Tout afficher »), then its tiles. */
function Block({ title, onAll, action, children }: { title: string; onAll?: () => void; action?: ReactNode; children?: ReactNode }) {
  const t = useT(messages);
  return (
    <MarketSection
      title={title}
      action={
        (action || onAll) && (
          <>
            {action}
            {onAll && (
              <Button variant="ghost" size="sm" onClick={onAll}>
                {t.showAll}
              </Button>
            )}
          </>
        )
      }
    >
      {children}
    </MarketSection>
  );
}

function ItemBlock(props: { section: Exclude<Section, "bots">; items: Item[]; loading?: boolean; failed?: boolean; push: (v: View) => void; query?: string; action?: ReactNode }) {
  const { section, items, push, query, action } = props;
  const t = useT(messages);
  if (!items.length && props.failed) {
    return (
      <Block title={t.titles[section]} action={action}>
        <p className="text-xs text-subtle-foreground">{t.unavailable}</p>
      </Block>
    );
  }
  if (!items.length && props.loading) {
    return (
      <Block title={t.titles[section]} action={action}>
        <SkeletonTiles />
      </Block>
    );
  }
  // Searching: a section without results steps aside (the page says when nothing matched at all).
  if (!items.length && query?.trim()) return null;
  if (!items.length) {
    return (
      <Block title={t.titles[section]} action={action}>
        <p className="text-xs text-subtle-foreground">{t.emptySection[section]}</p>
      </Block>
    );
  }
  return (
    <Block title={t.titles[section]} action={action} onAll={items.length > 6 ? () => push({ kind: "all", section, query }) : undefined}>
      <Tiles>
        {items.slice(0, 6).map((item) => (
          <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} />
        ))}
      </Tiles>
    </Block>
  );
}

/** One entry (Figma « S1 »): its logo in a tile, its name over one line of what it does, « Ajouter » or « Ajouté » on the right. */
function Row({ item, onAdd }: { item: Item; onAdd: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <ItemRow variant="outline" role="listitem" className="flex-nowrap gap-3 bg-card px-3 py-2.5">
      {item.kind === "mcp" || item.kind === "registry" ? (
        <IntegrationTile type={item.type ?? guessIntegrationType(item.name, item.description)} server={item.name} className="size-8 rounded-md bg-accent" />
      ) : (
        <InitialTile icon={item.kind === "plugin" ? <PuzzleIcon /> : <PackageIcon />} className="size-8 rounded-md bg-accent text-muted-foreground" />
      )}
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="w-full truncate text-ui">
          {(item.kind === "skill" || item.kind === "registry") && item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
              {item.name}
            </a>
          ) : (
            item.name
          )}
        </ItemTitle>
        {item.description && <ItemDescription className="line-clamp-1 text-xs">{item.description}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        {item.installed && item.kind === "skill" ? (
          // Skills are per bot: the sheet shows which ones have it and adds it to others.
          <Button variant="ghost" size="xs" onClick={onAdd} className="text-state-finished">
            <CheckIcon data-icon="inline-start" />
            {t.added}
          </Button>
        ) : item.installed ? (
          <span className="flex items-center gap-1 text-xs text-state-finished">
            <CheckIcon className="size-3.5" />
            {item.kind === "plugin" ? t.enabled : t.added}
          </span>
        ) : (
          <Button variant="secondary" size="xs" onClick={onAdd}>
            {c.add}
          </Button>
        )}
      </ItemActions>
    </ItemRow>
  );
}

/** What is installed, with its count: the way to the page that manages it. */
function InstalledButton({ onClick }: { onClick: () => void }) {
  const t = useT(messages);
  const market = useMarket("");
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      {t.installed}
      <span className="text-muted-foreground tabular-nums">{market.installedCount}</span>
    </Button>
  );
}

function SkeletonTiles() {
  return (
    <Tiles busy>
      {[0, 1].map((i) => (
        <RowSkeleton key={i} />
      ))}
    </Tiles>
  );
}

function RowSkeleton() {
  return (
    <ItemRow variant="outline" role="listitem">
      <ItemMedia>
        <Skeleton className="size-10" />
      </ItemMedia>
      <ItemContent>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </ItemContent>
      <ItemActions>
        <Skeleton className="h-7 w-16" />
      </ItemActions>
    </ItemRow>
  );
}

function BotCards({ agents, onClose }: { agents: (AdminAgent & { description: string })[]; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: mine = [] } = useQuery(agentsQuery);
  const [opening, setOpening] = useState<string | null>(null);
  const t = useT(messages);

  const open = async (agent: AdminAgent) => {
    if (!mine.some((m) => m.id === agent.id)) {
      // The admin doesn't have this bot yet: add it to themselves before opening the thread.
      setOpening(agent.id);
      const users = await qc.fetchQuery(adminUsersQuery);
      const current = users.find((u) => u.id === user.id)?.agents ?? [];
      await api(`/admin/users/${user.id}/agents`, { method: "PUT", body: JSON.stringify({ agentIds: [...current, agent.id] }) });
      await qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      setOpening(null);
    }
    onClose();
    navigate({ to: "/a/$agentId", params: { agentId: agent.id } });
  };

  return (
    <Tiles>
      {agents.map((a) => (
        <ItemRow key={a.id} variant="outline" role="listitem" className="flex-nowrap gap-3 bg-card px-3 py-2.5">
          <ItemMedia>
            <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-8" />
          </ItemMedia>
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="w-full truncate text-ui">{a.name}</ItemTitle>
            {a.description && <ItemDescription className="line-clamp-1 text-xs">{a.description}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            <Button variant="ghost" size="xs" onClick={() => open(a)} disabled={opening === a.id}>
              {opening === a.id ? t.opening : t.open}
            </Button>
          </ItemActions>
        </ItemRow>
      ))}
    </Tiles>
  );
}
