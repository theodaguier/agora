import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PackageIcon, PlugIcon, PuzzleIcon, SearchIcon, CloseIcon } from "@/components/icons";
import { BrandLogo } from "@/components/BrandLogo";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RestartProvider } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, type AdminAgent } from "@/lib/api";
import { adminAgentsQuery, adminUsersQuery, agentsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AddSheet } from "./AddSheet";
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
  installed: (n: number) => string;
  searchPlaceholder: string;
  searchLabel: string;
  bots: string;
  featuredBots: string;
  nothingFound: (q: string) => string;
  filter: string;
  showAll: string;
  enabled: string;
  added: string;
  opening: string;
  custom: string;
  open: string;
  filterKinds: string;
  filters: Record<Filter, string>;
}>({
  en: {
    titles: { bots: "Team bots", mcp: "Connectors", registry: "MCP registry", skill: "Skills", skillsSh: "skills.sh", plugin: "Hermes plugins" },
    title: "Marketplace",
    installed: (n) => `Installed: ${n}`,
    searchPlaceholder: "Search connectors, skills, plugins and bots",
    searchLabel: "Search the marketplace",
    bots: "Bots",
    featuredBots: "Featured bots",
    nothingFound: (q) => `Nothing found for “${q}”.`,
    filter: "Filter",
    showAll: "Show all",
    enabled: "Enabled",
    added: "Added",
    opening: "Opening…",
    custom: "Custom connector",
    open: "Open",
    filterKinds: "Show",
    filters: { all: "All", mcp: "Connectors", skill: "Skills", plugin: "Plugins", bots: "Bots" },
  },
  fr: {
    titles: { bots: "Bots de l'équipe", mcp: "Connecteurs", registry: "Registre MCP", skill: "Skills", skillsSh: "skills.sh", plugin: "Plugins Hermes" },
    title: "Marketplace",
    installed: (n) => `Installés : ${n}`,
    searchPlaceholder: "Rechercher des connecteurs, skills, plugins et bots",
    searchLabel: "Rechercher dans la marketplace",
    bots: "Bots",
    featuredBots: "Bots en vedette",
    nothingFound: (q) => `Rien trouvé pour « ${q} ».`,
    filter: "Filtrer",
    showAll: "Tout afficher",
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
      <DialogContent
        showCloseButton={false}
        className="flex h-full max-w-[760px] flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(88vh,680px)] sm:max-w-[min(760px,calc(100%-3rem))] sm:rounded-[18px] sm:border"
      >
        {/* Figma « En-tête »: the title (back first, deeper in), the installed apps, close. */}
        <div className="flex shrink-0 items-center gap-2.5 px-5 pt-6 pb-4 sm:px-8 sm:pt-7">
          {history.length > 1 && (
            <Button variant="ghost" size="icon-sm" aria-label={c.back} onClick={back} className="-ml-1.5">
              <ChevronLeftIcon />
            </Button>
          )}
          <DialogTitle className="text-[15px] leading-5 font-medium">{t.title}</DialogTitle>
          <span className="flex-1" />
          {view.kind !== "installed" && <InstalledButton onClick={() => push({ kind: "installed" })} />}
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label={c.close} className="-mr-1.5" />}>
            <CloseIcon />
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-8">
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
      pending: { mcp: catalog.isPending, skill: official.isPending, skillsSh: skillsSh.isPending, plugin: plugins.isPending } as Partial<Record<Section, boolean>>,
      searching: hub.isFetching || skillsSh.isFetching || registry.isFetching || index.isFetching,
      error: catalog.error ?? plugins.error ?? official.error ?? skillsSh.error,
    };
  }, [owners, installedSkills, agents.data, catalog.data, plugins.data, official.data, hub.data, skillsSh.data, servers.data, registry.data, index.data, q, catalog.isPending, plugins.isPending, official.isPending, skillsSh.isPending, hub.isFetching, skillsSh.isFetching, registry.isFetching, index.isFetching, catalog.error, plugins.error, official.error, skillsSh.error]);
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
    <>
      {/* Figma « Recherche »: a round field. */}
      <InputGroup className="mb-4 h-10 rounded-full bg-background px-1.5">
        <InputGroupAddon className="text-icon">
          <SearchIcon className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="text-sm placeholder:text-subtle md:text-sm"
        />
        {searching && market.searching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </InputGroup>

      {/* Figma « Filtres »: which kinds the page shows. */}
      <div role="radiogroup" aria-label={t.filterKinds} className="mb-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-[30px] rounded-full border border-border bg-background px-3 text-[13px] leading-[18px] outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30",
              filter === f && "border-transparent bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {t.filters[f]}
          </button>
        ))}
      </div>

      {market.error ? <p className="-mt-2 mb-6 text-sm text-destructive">{market.error.message}</p> : null}

      {show("bots") && market.bots.length > 0 && (
        <Block title={t.titles.bots} onAll={market.bots.length > 4 ? () => push({ kind: "all", section: "bots" }) : undefined}>
          <BotCards agents={market.bots.slice(0, 4)} onClose={onClose} />
        </Block>
      )}
      {show("mcp") && <ItemBlock
        section="mcp"
        loading={market.pending.mcp}
        items={searching ? market.mcp : firstUninstalled(market.mcp)}
        push={push}
        action={
          <button type="button" className={linkClass} onClick={() => push({ kind: "custom" })}>
            {t.custom}
          </button>
        }
      />}
      {show("mcp") && <ItemBlock section="registry" items={market.registry} push={push} query={query} />}
      {show("skill") && <ItemBlock section="skill" loading={market.pending.skill} items={market.skill} push={push} query={query} />}
      {show("skill") && <ItemBlock section="skillsSh" loading={market.pending.skillsSh} items={market.skillsSh} push={push} query={query} />}
      {show("plugin") && <ItemBlock section="plugin" loading={market.pending.plugin} items={searching ? market.plugin : firstUninstalled(market.plugin)} push={push} />}

      {searching && !market.searching && !market.bots.length && !market.mcp.length && !market.registry.length && !market.skill.length && !market.skillsSh.length && !market.plugin.length && (
        <Empty className="py-10">
          <EmptyDescription>{t.nothingFound(query)}</EmptyDescription>
        </Empty>
      )}
    </>
  );
}

function AllOf({ section, query = "", push, onClose }: { section: Section; query?: string; push: (v: View) => void; onClose: () => void }) {
  const t = useT(messages);
  const market = useMarket(query);
  const [filter, setFilter] = useState("");
  return (
    <>
      <h2 className="mb-3 text-[15px] leading-5 font-medium">{t.titles[section]}</h2>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t.filter}
        aria-label={t.filter}
        className="mb-4 h-10 rounded-full px-4 text-sm md:text-sm"
      />
      {section === "bots" ? (
        <BotCards agents={market.bots.filter((a) => matches(a, filter))} onClose={onClose} />
      ) : (
        <div className="grid gap-x-7 gap-y-1 sm:grid-cols-2">
          {market[section]
            .filter((i) => matches(i, filter))
            .map((item) => (
              <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} />
            ))}
        </div>
      )}
    </>
  );
}

function Block({ title, onAll, action, children }: { title: string; onAll?: () => void; action?: ReactNode; children: ReactNode }) {
  const t = useT(messages);
  return (
    <section className="mb-7">
      {/* Figma « Section »: its title, then « Tout afficher » in grey. */}
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] leading-5">{title}</h2>
        <div className="flex items-center gap-5">
          {action}
          {onAll && (
            <button type="button" className={linkClass} onClick={onAll}>
              {t.showAll}
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function ItemBlock(props: { section: Exclude<Section, "bots">; items: Item[]; loading?: boolean; push: (v: View) => void; query?: string; action?: ReactNode }) {
  const { section, items, push, query, action } = props;
  const t = useT(messages);
  if (!items.length && props.loading) {
    return (
      <Block title={t.titles[section]} action={action}>
        <div aria-busy className="grid gap-x-7 gap-y-1 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </Block>
    );
  }
  if (!items.length) return action ? <Block title={t.titles[section]} action={action}>{null}</Block> : null;
  return (
    <Block title={t.titles[section]} action={action} onAll={items.length > 6 ? () => push({ kind: "all", section, query }) : undefined}>
      <div className="grid gap-x-7 gap-y-1 sm:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} />
        ))}
      </div>
    </Block>
  );
}

/** Figma « Élément »: the logo tile, the name and one grey line, then « Ajouter » or « ✓ Ajouté ». */
function Row({ item, onAdd }: { item: Item; onAdd: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <div className="flex min-h-[53px] items-center gap-3 py-1.5">
      {item.kind === "mcp" || item.kind === "registry" ? (
        <IntegrationTile type={item.type ?? guessIntegrationType(item.name, item.description)} server={item.name} />
      ) : (
        <InitialTile icon={item.kind === "plugin" ? <PuzzleIcon /> : <PackageIcon />} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {(item.kind === "skill" || item.kind === "registry") && item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="truncate text-[15px] leading-[21px] underline-offset-4 hover:underline">
            {item.name}
          </a>
        ) : (
          <span className="truncate text-[15px] leading-[21px]">{item.name}</span>
        )}
        {item.description && <p className="truncate text-[13px] leading-[18px] text-muted-foreground">{item.description}</p>}
      </div>
      {item.installed && item.kind === "skill" ? (
        // Skills are per bot: the sheet shows which ones have it and adds it to others.
        <button type="button" onClick={onAdd} className={cn(linkClass, "inline-flex shrink-0 items-center gap-1")}>
          <CheckIcon className="size-3.5" /> {t.added}
        </button>
      ) : item.installed ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
          <CheckIcon className="size-3.5" /> {item.kind === "plugin" ? t.enabled : t.added}
        </span>
      ) : (
        <Button variant="secondary" onClick={onAdd}>
          {c.add}
        </Button>
      )}
    </div>
  );
}

/** Grey text button (« Tout afficher », « Connecteur personnalisé »). */
const linkClass = "rounded-sm text-[13px] leading-[18px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30";

/** Figma « Installés »: the first installed apps' logos, the count, a chevron. */
function InstalledButton({ onClick }: { onClick: () => void }) {
  const t = useT(messages);
  const market = useMarket("");
  const { data } = useQuery(mcpServersQuery);
  const logos = (data?.servers ?? []).slice(0, 4);
  return (
    <button type="button" onClick={onClick} className={cn(linkClass, "mr-2 inline-flex items-center gap-1.5")}>
      {logos.length > 0 && (
        <span className="flex -space-x-1">
          {logos.map((s) => (
            <span key={s.name} className="grid size-5 place-items-center overflow-hidden rounded-full border border-border bg-background">
              <BrandLogo server={s.name} fallback={<PlugIcon className="size-3 text-icon" />} className="size-3.5" />
            </span>
          ))}
        </span>
      )}
      {t.installed(market.installedCount)}
      <ChevronRightIcon className="size-3.5" />
    </button>
  );
}

function RowSkeleton() {
  return (
    <div className="flex min-h-[53px] items-center gap-3 py-1.5">
      <Skeleton className="size-10 shrink-0 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton className="h-8 w-[76px] shrink-0 rounded-full" />
    </div>
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
    <div className="grid gap-x-7 gap-y-1 sm:grid-cols-2">
      {agents.map((a) => (
        <div key={a.id} className="flex min-h-[53px] items-center gap-3 py-1.5">
          <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] leading-[21px]">{a.name}</span>
            {a.description && <p className="truncate text-[13px] leading-[18px] text-muted-foreground">{a.description}</p>}
          </div>
          <Button variant="secondary" onClick={() => open(a)} disabled={opening === a.id}>
            {opening === a.id ? t.opening : t.open}
          </Button>
        </div>
      ))}
    </div>
  );
}
