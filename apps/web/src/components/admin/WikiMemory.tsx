import { useQuery } from "@tanstack/react-query";
import { BrainIcon, SearchIcon, CloseIcon, ExternalLinkIcon, MaximizeIcon, SlidersIcon } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/lib/theme";
import { MemoryGraph } from "./MemoryGraph";
import { nodeColor, type WikiEdge, type WikiNode, type WikiNodeType } from "@/lib/wiki-graph";
import { defineMessages, useT } from "@/i18n";
import { LoadError, LoadFailed, Loading } from "./ui";

/** Only what the graph needs: it refreshes faster while the curator runs. */
type CuratorStatus = { running: boolean };
type Graph = { nodes: WikiNode[]; edges: WikiEdge[]; status: CuratorStatus };
type Page = { id: string; meta: Record<string, string | string[]>; body: string };

/** Legend order. */
const LEGEND: WikiNodeType[] = ["agent", "entity", "concept", "comparison", "query", "session", "raw", "ghost"];

const messages = defineMessages<{
  legend: Record<WikiNodeType, string>;
  type: Record<WikiNodeType, string>;
  title: string;
  intro: string;
  empty: string;
  emptyHint: string;
  searchLabel: string;
  searchPlaceholder: string;
  noPage: string;
  updated: (date: string) => string;
  closePage: string;
  ghost: string;
  agent: string;
  linked: (n: number) => string;
  openWindow: string;
  shown: string;
  fullScreen: string;
  exitFullScreen: string;
}>({
  en: {
    legend: {
      agent: "Agents",
      entity: "Entities",
      concept: "Concepts",
      comparison: "Comparisons",
      query: "Questions",
      session: "Sessions",
      raw: "Raw sources",
      ghost: "Links without a page",
    },
    type: {
      agent: "Agent",
      entity: "Entity",
      concept: "Concept",
      comparison: "Comparison",
      query: "Question",
      session: "Daily log",
      raw: "Raw source",
      ghost: "Page to create",
    },
    title: "Second brain",
    intro: "The agents' shared wiki. Every conversation is added to it, then the curator compiles it into linked pages.",
    empty: "Memory is still empty.",
    emptyHint: "It fills up with every conversation with an agent. Pages will show up here after the first compilation.",
    searchLabel: "Search memory",
    searchPlaceholder: "Search for a page…",
    noPage: "No pages.",
    updated: (date) => `, updated ${date}`,
    closePage: "Close page",
    ghost: "This page is referenced but doesn't exist yet. The curator will create it when the topic comes up again.",
    agent: "Pages and conversations linked to this agent.",
    linked: (n) => (n === 1 ? "Linked to 1 page" : `Linked to ${n} pages`),
    openWindow: "Open in a new tab",
    shown: "Pages shown",
    fullScreen: "Full screen",
    exitFullScreen: "Exit full screen",
  },
  fr: {
    legend: {
      agent: "Agents",
      entity: "Entités",
      concept: "Concepts",
      comparison: "Comparaisons",
      query: "Questions",
      session: "Sessions",
      raw: "Sources brutes",
      ghost: "Liens sans page",
    },
    type: {
      agent: "Agent",
      entity: "Entité",
      concept: "Concept",
      comparison: "Comparaison",
      query: "Question",
      session: "Journal du jour",
      raw: "Source brute",
      ghost: "Page à créer",
    },
    title: "Second cerveau",
    intro: "Le wiki commun des agents. Chaque conversation y est versée, puis le curateur la compile en pages reliées entre elles.",
    empty: "La mémoire est encore vide.",
    emptyHint: "Elle se remplit à chaque conversation avec un agent. Les pages apparaîtront ici après la première compilation.",
    searchLabel: "Chercher dans la mémoire",
    searchPlaceholder: "Chercher une page…",
    noPage: "Aucune page.",
    updated: (date) => `, mis à jour le ${date}`,
    closePage: "Fermer la page",
    ghost: "Cette page est citée mais n'existe pas encore. Le curateur la créera quand le sujet reviendra.",
    agent: "Les pages et conversations reliées à cet agent.",
    linked: (n) => `Liée à ${n} page${n > 1 ? "s" : ""}`,
    openWindow: "Ouvrir dans un nouvel onglet",
    shown: "Pages affichées",
    fullScreen: "Plein écran",
    exitFullScreen: "Quitter le plein écran",
  },
});

// Stable empties while the graph loads, so the memos below don't recompute every render.
const noNodes: WikiNode[] = [];
const noEdges: WikiEdge[] = [];

/** Opens the graph alone, the whole page for it, in a new browser tab. */
function openBrainTab() {
  window.open("/memory", "_blank", "noopener");
}

/** Follows the browser's full screen mode, toggled from the standalone window. */
function useFullScreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return [on, toggle] as const;
}

/**
 * Second brain: the agents' shared wiki, as an interactive graph. It fills its parent's height
 * (the settings pane, or the whole `/memory` window when `standalone`).
 */
export function WikiMemory({ standalone = false, inTab = false }: { standalone?: boolean; inTab?: boolean }) {
  const t = useT(messages);
  const [fullScreen, toggleFullScreen] = useFullScreen();
  const graph = useQuery({
    queryKey: ["wiki", "graph"],
    queryFn: () => api<Graph>("/admin/wiki/graph"),
    // During a compilation, the graph fills in live.
    refetchInterval: (q) => (q.state.data?.status.running ? 4000 : 30_000),
  });

  const [hidden, setHidden] = useState<Set<WikiNodeType>>(() => new Set<WikiNodeType>(["raw"]));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // A profile's slug (bot-76a4ae2e) is shown as its bot's name.
  const { data: agents } = useQuery(adminAgentsQuery);
  const nodes = useMemo(() => {
    const raw = graph.data?.nodes ?? noNodes;
    const names = new Map((agents ?? []).map((a) => [a.hermesProfile, a.name]));
    if (!names.size) return raw;
    // A bot deleted since (its slug, no bot behind it) is no longer a page anyone can open.
    return raw.filter((n) => !(n.type === "agent" && !names.has(n.label) && /^bot-[0-9a-f]+$/.test(n.label))).map((n) => (names.has(n.label) ? { ...n, label: names.get(n.label)! } : n));
  }, [graph.data, agents]);
  const edges = graph.data?.edges ?? noEdges;
  const counts = useMemo(() => {
    const c = {} as Record<WikiNodeType, number>;
    for (const n of nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [nodes]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return nodes.filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.tags?.some((t) => t.toLowerCase().includes(q)));
  }, [nodes, query]);
  const highlight = useMemo(() => (matches ? new Set(matches.map((n) => n.id)) : null), [matches]);

  const toggle = (type: WikiNodeType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const select = (id: string | null) => {
    if (id) {
      const node = nodes.find((n) => n.id === id);
      if (node && hidden.has(node.type)) toggle(node.type);
    }
    setSelected(id);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* One line, as the other tabs' headers: the title, then find a page, which kinds are shown, and
          where to open it (an icon: not in its own tab, where the graph is the page). */}
      <div className="mb-4 flex items-center gap-2">
        {!inTab && <h2 className="text-title font-medium">{t.title}</h2>}
        <span className="flex-1" />
        {graph.data && (
          <>
            <div className="relative w-56">
              <InputGroup className="h-8 bg-transparent text-ui dark:bg-transparent">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput aria-label={t.searchLabel} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} />
              </InputGroup>
              <Popover open={!!matches} onOpenChange={(open) => !open && setQuery("")}>
                <PopoverTrigger nativeButton={false} tabIndex={-1} render={<div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0" />} />
                <PopoverContent align="start" sideOffset={6} initialFocus={false} finalFocus={false} className="w-(--anchor-width) p-1">
                  <ItemGroup className="max-h-64 gap-0 overflow-y-auto has-data-[size=xs]:gap-0">
                    {matches?.slice(0, 12).map((n) => (
                      <Item key={n.id} size="xs" role="listitem" className="text-left hover:bg-muted" render={<button type="button" onClick={() => select(n.id)} />}>
                        <ItemMedia>
                          <Dot type={n.type} />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle className="text-ui">{n.label}</ItemTitle>
                        </ItemContent>
                      </Item>
                    ))}
                    {matches && !matches.length && <p className="px-2.5 py-2 text-xs text-subtle-foreground">{t.noPage}</p>}
                  </ItemGroup>
                </PopoverContent>
              </Popover>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.shown} className="text-muted-foreground" />}>
                <SlidersIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {LEGEND.filter((type) => counts[type]).map((type) => (
                  <DropdownMenuCheckboxItem key={type} checked={!hidden.has(type)} onCheckedChange={() => toggle(type)} closeOnClick={false}>
                    <Dot type={type} />
                    {t.legend[type]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {!inTab && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={standalone ? (fullScreen ? t.exitFullScreen : t.fullScreen) : t.openWindow}
            title={standalone ? (fullScreen ? t.exitFullScreen : t.fullScreen) : t.openWindow}
            onClick={standalone ? toggleFullScreen : openBrainTab}
            className="text-muted-foreground"
          >
            {standalone ? <MaximizeIcon /> : <ExternalLinkIcon />}
          </Button>
        )}
      </div>

      {graph.isPending && <Loading />}
      {!graph.data && graph.isError && <LoadFailed error={graph.error} onRetry={() => void graph.refetch()} />}

      {graph.data && (
        <div className="flex min-h-0 flex-1 flex-col">

          <div className="relative min-h-96 flex-1">
            {nodes.length ? (
              <MemoryGraph nodes={nodes} edges={edges} hidden={hidden} selected={selected} highlight={highlight} onSelect={select} />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BrainIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t.empty}</EmptyTitle>
                  <EmptyDescription>{t.emptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {selected && (
              <PagePanel
                id={selected}
                node={nodes.find((n) => n.id === selected)}
                nodes={nodes}
                edges={edges}
                onSelect={select}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Dot({ type }: { type: WikiNodeType }) {
  const dark = useIsDark();
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: nodeColor(type, dark) }} />;
}

/** Obsidian [[links]] become clickable internal links. */
function withLinks(body: string, nodes: WikiNode[]) {
  const bySlug = new Map(nodes.map((n) => [n.id.split("/").at(-1)!, n.id]));
  const ids = new Set(nodes.map((n) => n.id));
  const labels = new Map(nodes.map((n) => [n.id, n.label]));
  return body.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
    const clean = target.trim().replace(/\.md$/, "");
    const id = ids.has(clean) ? clean : ids.has(`wiki/${clean}`) ? `wiki/${clean}` : bySlug.get(clean.split("/").at(-1)!);
    const label = alias?.trim() || (id && labels.get(id)) || clean.split("/").at(-1);
    return id ? `[${label}](#wiki=${encodeURIComponent(id)})` : `*${label}*`;
  });
}

function PagePanel(props: {
  id: string;
  node?: WikiNode;
  nodes: WikiNode[];
  edges: WikiEdge[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT(messages);
  const readable = /^(wiki|raw)\//.test(props.id);
  const page = useQuery({
    queryKey: ["wiki", "page", props.id],
    queryFn: () => api<Page>(`/admin/wiki/page?id=${encodeURIComponent(props.id)}`),
    enabled: readable,
  });
  const linked = useMemo(() => {
    const out = new Set<string>();
    for (const e of props.edges) {
      if (e.source === props.id) out.add(e.target);
      if (e.target === props.id) out.add(e.source);
    }
    return props.nodes.filter((n) => out.has(n.id));
  }, [props.id, props.edges, props.nodes]);

  const meta = page.data?.meta ?? {};
  const title = (typeof meta.title === "string" && meta.title) || props.node?.label || props.id;
  const type = props.node?.type ?? "concept";

  return (
    <Card role="complementary" aria-label={title} className="absolute inset-y-3 right-3 left-3 sm:left-auto sm:w-96">
      <CardHeader className="border-b">
        <CardDescription className="flex items-center gap-2">
          <Dot type={type} />
          <span>
            {t.type[type]}
            {typeof meta.updated === "string" && t.updated(meta.updated)}
          </span>
        </CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label={t.closePage} onClick={props.onClose}>
            <CloseIcon />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {typeof meta.summary === "string" && meta.summary && <p className="text-sm text-muted-foreground">{meta.summary}</p>}
        {Array.isArray(meta.tags) && meta.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meta.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {type === "ghost" && <p className="text-sm text-muted-foreground">{t.ghost}</p>}
        {type === "agent" && <p className="text-sm text-muted-foreground">{t.agent}</p>}
        {page.isPending && readable && <Loading />}
        {page.isError && <LoadError error={page.error} />}
        {page.data && (
          <div
            className={cn(
              "text-sm [&_a]:underline [&_a]:underline-offset-4",
              "[&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold",
              "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5",
            )}
          >
            <Streamdown
              shikiTheme={["github-dark", "github-dark"]}
              components={{
                a: ({ href, children }) =>
                  href?.startsWith("#wiki=") ? (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        try {
                          props.onSelect(decodeURIComponent(href.slice(6)));
                        } catch {
                          // A malformed %-escape in the link: nothing to open.
                        }
                      }}
                    >
                      {children}
                    </a>
                  ) : (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
              }}
            >
              {withLinks(page.data.body, props.nodes)}
            </Streamdown>
          </div>
        )}

        {linked.length > 0 && (
          <div className="flex flex-col gap-2">
            <Separator />
            <h4 className="text-xs font-medium text-muted-foreground">{t.linked(linked.length)}</h4>
            {/* Tight rows, as the sidebar's: the kind's dot, the page's name (a raw source without its bot id). */}
            <ul className="-mx-2 flex flex-col">
              {linked.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(n.id)}
                    className="flex h-7 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-ui outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <Dot type={n.type} />
                    <span className="truncate">{n.label.replace(/^bot-[0-9a-f]+ · /, "")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
