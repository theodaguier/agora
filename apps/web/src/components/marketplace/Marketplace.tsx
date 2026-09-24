import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { BookOpenIcon, CheckIcon, ChevronLeftIcon, PlugIcon, PuzzleIcon, SearchIcon, CloseIcon } from "@/components/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RestartProvider } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Badge } from "@/components/ui/badge";
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
import { IntegrationTile } from "./IntegrationType";
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
  type Item,
} from "./data";
import { Installed } from "./Installed";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

type Section = "bots" | "mcp" | "registry" | "skill" | "skillsSh" | "plugin";
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
  profile: (name: string) => string;
  custom: string;
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
    profile: (name) => `Profile ${name}`,
    custom: "Custom connector",
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
    profile: (name) => `Profil ${name}`,
    custom: "Connecteur personnalisé",
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
        className="flex h-full max-w-[880px] flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 dark:bg-[oklch(0.19_0_0)] sm:h-[min(88vh,900px)] sm:max-w-[min(880px,calc(100%-3rem))] sm:rounded-2xl sm:border"
      >
        <DialogTitle className="sr-only">{t.title}</DialogTitle>
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          {history.length > 1 ? (
            <Button variant="ghost" size="icon-lg" aria-label={c.back} onClick={back}>
              <ChevronLeftIcon />
            </Button>
          ) : (
            <span />
          )}
          <DialogClose render={<Button variant="ghost" size="icon-lg" aria-label={c.close} />}>
            <CloseIcon />
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-10">
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

  return useMemo(() => {
    const types = new Map((servers.data?.servers ?? []).map((s) => [s.name, s.type]));
    const mcp = (catalog.data?.entries ?? []).map((e) => fromMcp(e, types.get(e.name)));
    const skills = (official.data?.skills ?? []).map(fromSkill);
    const sh = (skillsSh.data?.skills ?? []).map(fromSkill);
    const installedMcp = new Set((servers.data?.servers ?? []).map((s) => s.name));
    const reg = q ? (registry.data?.servers ?? []).filter((r) => !mcp.some((m) => m.name === r.hermesName)).map((r) => fromRegistry(r, installedMcp, types.get(r.hermesName))) : [];
    const hubSkills = (hub.data?.results ?? []).map(fromSkill).filter((s) => !skills.some((o) => o.key === s.key) && !sh.some((o) => o.key === s.key));
    const plugin = (plugins.data ?? []).map(fromPlugin);
    const indexPlugins = (index.data?.results ?? []).map(fromPluginIndex).filter((p) => !plugin.some((x) => x.name === p.name));
    const filter = <T extends { name: string; description: string }>(xs: T[]) => (q ? xs.filter((x) => matches(x, q)) : xs);
    return {
      bots: filter((agents.data ?? []).map((a) => ({ ...a, description: a.hermesProfile }))),
      mcp: filter(mcp),
      registry: reg,
      skill: q ? [...filter(skills), ...hubSkills] : skills,
      skillsSh: sh,
      plugin: q ? [...filter(plugin), ...indexPlugins] : plugin,
      installedCount: mcp.filter((m) => m.installed).length + plugin.filter((p) => p.installed).length,
      // Sections still waiting for their first load: shown as skeletons.
      pending: { mcp: catalog.isPending, skill: official.isPending, skillsSh: skillsSh.isPending, plugin: plugins.isPending } as Partial<Record<Section, boolean>>,
      searching: hub.isFetching || skillsSh.isFetching || registry.isFetching || index.isFetching,
      error: catalog.error ?? plugins.error ?? official.error ?? skillsSh.error,
    };
  }, [agents.data, catalog.data, plugins.data, official.data, hub.data, skillsSh.data, servers.data, registry.data, index.data, q, catalog.isPending, plugins.isPending, official.isPending, skillsSh.isPending, hub.isFetching, skillsSh.isFetching, registry.isFetching, index.isFetching, catalog.error, plugins.error, official.error, skillsSh.error]);
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
  const firstUninstalled = (xs: Item[]) => [...xs.filter((x) => !x.installed), ...xs.filter((x) => x.installed)];

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
        <Button variant="link" className="h-auto px-0 font-normal text-muted-foreground hover:text-foreground hover:no-underline" onClick={() => push({ kind: "installed" })}>
          {t.installed(market.installedCount)}
        </Button>
      </div>

      <InputGroup className="mb-8 h-11 rounded-full bg-background/40 px-2">
        <InputGroupAddon>
          <SearchIcon className="size-[18px]" />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="text-[15px] placeholder:text-muted-foreground md:text-[15px]"
        />
        {searching && market.searching && (
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        )}
      </InputGroup>

      {market.error ? <p className="-mt-4 mb-6 text-sm text-destructive">{market.error.message}</p> : null}

      {market.bots.length > 0 && (
        <Block title={searching ? t.bots : t.featuredBots} onAll={market.bots.length > 4 ? () => push({ kind: "all", section: "bots" }) : undefined}>
          <BotCards agents={market.bots.slice(0, 4)} onClose={onClose} />
        </Block>
      )}
      <ItemBlock
        section="mcp"
        loading={market.pending.mcp}
        items={searching ? market.mcp : firstUninstalled(market.mcp)}
        push={push}
        action={
          <Button variant="link" className="h-auto px-0 font-normal text-muted-foreground hover:text-foreground hover:no-underline" onClick={() => push({ kind: "custom" })}>
            {t.custom}
          </Button>
        }
      />
      <ItemBlock section="registry" items={market.registry} push={push} query={query} />
      <ItemBlock section="skill" loading={market.pending.skill} items={market.skill} push={push} query={query} />
      <ItemBlock section="skillsSh" loading={market.pending.skillsSh} items={market.skillsSh} push={push} query={query} />
      <ItemBlock section="plugin" loading={market.pending.plugin} items={searching ? market.plugin : firstUninstalled(market.plugin)} push={push} />

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
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{t.titles[section]}</h1>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t.filter}
        aria-label={t.filter}
        className="mb-4 rounded-full bg-background/40 px-4 placeholder:text-muted-foreground"
      />
      {section === "bots" ? (
        <BotCards agents={market.bots.filter((a) => matches(a, filter))} onClose={onClose} />
      ) : (
        <div className="flex flex-col">
          {market[section]
            .filter((i) => matches(i, filter))
            .map((item) => (
              <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} wide />
            ))}
        </div>
      )}
    </>
  );
}

function Block({ title, onAll, action, children }: { title: string; onAll?: () => void; action?: ReactNode; children: ReactNode }) {
  const t = useT(messages);
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-medium">{title}</h2>
        <div className="flex items-center gap-5">
          {action}
          {onAll && (
            <Button variant="link" className="h-auto px-0 font-normal text-muted-foreground hover:text-foreground hover:no-underline" onClick={onAll}>
              {t.showAll}
            </Button>
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
        <div aria-busy className="grid gap-x-8 sm:grid-cols-2">
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
      <div className="grid gap-x-8 sm:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <Row key={item.key} item={item} onAdd={() => push({ kind: "add", item })} />
        ))}
      </div>
    </Block>
  );
}

const badge = {
  mcp: { icon: PlugIcon, label: "MCP" },
  registry: { icon: PlugIcon, label: "MCP" },
  skill: { icon: BookOpenIcon, label: "Skill" },
  plugin: { icon: PuzzleIcon, label: "Plugin" },
};

function Row({ item, onAdd, wide }: { item: Item; onAdd: () => void; wide?: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const B = badge[item.kind];
  return (
    <div className={cn("flex items-center gap-3.5 py-3", wide && "border-b border-border/50 last:border-0")}>
      {item.kind === "mcp" || item.kind === "registry" ? (
        <IntegrationTile type={item.type ?? guessIntegrationType(item.name, item.description)} server={item.name} />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-[15px] font-semibold text-foreground/85">
          {item.name.replace(/^[^a-z0-9]+/i, "").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {(item.kind === "skill" || item.kind === "registry") && item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="truncate text-[15px] underline-offset-4 hover:underline">
              {item.name}
            </a>
          ) : (
            <span className="truncate text-[15px]">{item.name}</span>
          )}
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            <B.icon data-icon="inline-start" /> {B.label}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{item.description}</p>
      </div>
      {item.installed ? (
        <span className="inline-flex h-8 shrink-0 items-center gap-1 px-3 text-sm text-muted-foreground">
          <CheckIcon className="size-4" /> {item.kind === "plugin" ? t.enabled : t.added}
        </span>
      ) : (
        <Button variant="secondary" size="sm" className="px-3.5 text-sm" onClick={onAdd}>
          {c.add}
        </Button>
      )}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 py-3">
      <Skeleton className="size-11 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <Skeleton className="h-8 w-[72px] shrink-0 rounded-md" />
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {agents.map((a) => (
        <Button
          key={a.id}
          variant="outline"
          onClick={() => open(a)}
          className="h-auto flex-col gap-0 whitespace-normal rounded-2xl px-3 pb-5 pt-6 text-center font-normal"
        >
          <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-20" />
          <span className="mt-3 text-sm text-muted-foreground">{opening === a.id ? t.opening : t.profile(a.hermesProfile)}</span>
          <span className="text-[15px] font-medium">{a.name}</span>
        </Button>
      ))}
    </div>
  );
}
