import { useQuery } from "@tanstack/react-query";
import { SearchIcon, CloseIcon } from "@/components/icons";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/lib/theme";
import { MemoryGraph } from "./MemoryGraph";
import { nodeColor, type WikiEdge, type WikiNode, type WikiNodeType } from "@/lib/wiki-graph";
import { defineMessages, useT } from "@/i18n";
import { ErrorText, Loading, SectionHeader } from "./ui";

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
    updated: (date) => `· updated ${date}`,
    closePage: "Close page",
    ghost: "This page is referenced but doesn't exist yet. The curator will create it when the topic comes up again.",
    agent: "Pages and conversations linked to this agent.",
    linked: (n) => (n === 1 ? "Linked to 1 page" : `Linked to ${n} pages`),
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
    updated: (date) => `· mis à jour le ${date}`,
    closePage: "Fermer la page",
    ghost: "Cette page est citée mais n'existe pas encore. Le curateur la créera quand le sujet reviendra.",
    agent: "Les pages et conversations reliées à cet agent.",
    linked: (n) => `Liée à ${n} page${n > 1 ? "s" : ""}`,
  },
});

// Stable empties while the graph loads, so the memos below don't recompute every render.
const noNodes: WikiNode[] = [];
const noEdges: WikiEdge[] = [];

/** Second brain: the agents' shared wiki, as an interactive graph. */
export function WikiMemory() {
  const t = useT(messages);
  const graph = useQuery({
    queryKey: ["wiki", "graph"],
    queryFn: () => api<Graph>("/admin/wiki/graph"),
    // During a compilation, the graph fills in live.
    refetchInterval: (q) => (q.state.data?.status.running ? 4000 : 30_000),
  });

  const [hidden, setHidden] = useState<Set<WikiNodeType>>(() => new Set<WikiNodeType>(["raw"]));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const nodes = graph.data?.nodes ?? noNodes;
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
    <section>
      <SectionHeader title={t.title} text={t.intro} />

      {graph.isPending && <Loading />}
      <ErrorText error={graph.error} />

      {graph.data && (
        <>
          <div className="relative flex h-[min(760px,calc(100dvh-220px))] min-h-[420px] overflow-hidden rounded-lg border">
            {nodes.length ? (
              <MemoryGraph nodes={nodes} edges={edges} hidden={hidden} selected={selected} highlight={highlight} onSelect={select} />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t.empty}</EmptyTitle>
                  <EmptyDescription>{t.emptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            <div className="absolute left-3 top-3 w-[min(280px,calc(100%-24px))]">
              <InputGroup className="bg-background">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t.searchLabel}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                />
              </InputGroup>
              {matches && (
                <ItemGroup className="mt-1 max-h-64 gap-0 overflow-y-auto rounded-lg border bg-background p-1">
                  {matches.slice(0, 12).map((n) => (
                    <Item key={n.id} size="xs" role="listitem" className="text-left hover:bg-muted" render={<button type="button" onClick={() => select(n.id)} />}>
                      <ItemMedia>
                        <Dot type={n.type} />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="truncate font-normal">{n.label}</ItemTitle>
                      </ItemContent>
                    </Item>
                  ))}
                  {!matches.length && (
                    <Item size="xs" role="listitem">
                      <ItemContent className="text-muted-foreground">{t.noPage}</ItemContent>
                    </Item>
                  )}
                </ItemGroup>
              )}
            </div>

            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-1">
              {LEGEND.filter((type) => counts[type]).map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  size="xs"
                  aria-pressed={!hidden.has(type)}
                  onClick={() => toggle(type)}
                  className={cn("bg-background", hidden.has(type) && "opacity-50")}
                >
                  <Dot type={type} />
                  {t.legend[type]}
                  <span className="tabular-nums text-muted-foreground">{counts[type]}</span>
                </Button>
              ))}
            </div>

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
        </>
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
    <aside
      aria-label={title}
      className="absolute inset-y-0 right-0 flex w-full flex-col border-l bg-background sm:w-[360px]"
    >
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dot type={type} /> {t.type[type]}
            {typeof meta.updated === "string" && <span>{t.updated(meta.updated)}</span>}
          </p>
          <h3 className="mt-0.5 font-medium leading-snug">{title}</h3>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t.closePage} onClick={props.onClose}>
          <CloseIcon />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {typeof meta.summary === "string" && meta.summary && <p className="mb-3 text-sm text-muted-foreground">{meta.summary}</p>}
        {Array.isArray(meta.tags) && meta.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
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
        {page.data && (
          <div
            className={cn(
              "text-sm leading-normal [&_a]:underline [&_a]:underline-offset-4",
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
          <div className="mt-5">
            <Separator className="mb-3" />
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{t.linked(linked.length)}</h4>
            <ItemGroup className="gap-0">
              {linked.map((n) => (
                <Item key={n.id} size="xs" role="listitem" className="text-left hover:bg-muted" render={<button type="button" onClick={() => props.onSelect(n.id)} />}>
                  <ItemMedia>
                    <Dot type={n.type} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="truncate font-normal">{n.label}</ItemTitle>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </div>
        )}
      </div>
    </aside>
  );
}
