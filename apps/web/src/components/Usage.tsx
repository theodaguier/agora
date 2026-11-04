import { modelName } from "@agora/core";
import { confirmAction } from "@/lib/confirm";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AgentAvatar } from "@/components/AgentAvatar";
import { type AvatarShape } from "@/lib/agent-avatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Loading, SectionHeader } from "@/components/admin/ui";
import {
  BotIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarWeekIcon,
  ChartIcon,
  ChatIntegrationIcon,
  ClockIcon,
  LayersIcon,
  MoreIcon,
  PencilIcon,
  ServerIcon,
  TerminalIcon,
  UserIcon,
  UndoIcon,
  UsersIcon,
  WarningIcon,
} from "@/components/icons";
import { OptionSelect } from "@/components/Pickers";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { common } from "@agora/core/i18n";
import { defineMessages, useT } from "@/i18n";
import { useFormat } from "@/lib/usage-format";
import { api } from "@/lib/api";

type Range = "24h" | "7d" | "30d" | "90d" | "12m";
type Source = "chat" | "cron" | "system" | "code";

/** A day is hours, a week its row of days, longer periods the whole calendar. */
const rangeIcon: Record<Range, React.ReactNode> = {
  "24h": <ClockIcon />,
  "7d": <CalendarWeekIcon />,
  "30d": <CalendarIcon />,
  "90d": <CalendarIcon />,
  "12m": <CalendarIcon />,
};

const sourceIcon: Record<Source, React.ReactNode> = {
  chat: <ChatIntegrationIcon />,
  cron: <CalendarClockIcon />,
  system: <ServerIcon />,
  code: <TerminalIcon />,
};
type Summary = { tokens: number; inputTokens: number; outputTokens: number; cacheTokens: number; apiCalls: number; cost: number };

type UsageReport = {
  range: Range;
  bucket: "hour" | "day" | "week" | "month";
  scope: "all" | "self";
  totals: Summary;
  series: (Summary & { t: string })[];
  byUser: (Summary & { id: string | null; name: string | null; image: string | null })[];
  byAgent: (Summary & { id: string | null; name: string | null; avatarShape: AvatarShape | null; avatarColor: string | null })[];
  byTask: (Summary & { id: string; taskId: string | null; name: string | null; source: Source })[];
  byModel: (Summary & { provider: string; model: string; priced: PriceSource })[];
  options: { users: { id: string; name: string }[]; agents: { id: string; name: string }[] } | null;
};

type PriceSource = "admin" | "models.dev" | "engine";
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
type ModelPriceRow = { provider: string; model: string; price: Price | null; source: PriceSource; catalogue: Price | null };

const ALL = "all";

const messages = defineMessages({
  en: {
    title: "Usage",
    intro: { all: "Tokens used by the organization's bots, and their estimated cost.", self: "Tokens you used with the bots, and their estimated cost." },
    ranges: { "24h": "24 h", "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" } as Record<Range, string>,
    period: "Period",
    allUsers: "All members",
    allAgents: "All bots",
    allSources: "All sources",
    member: "Member",
    bot: "Bot",
    source: "Source",
    sources: { chat: "Conversations", cron: "Scheduled tasks", system: "System", code: "Code sessions" } as Record<Source, string>,
    tokens: "Tokens",
    cost: "Estimated cost",
    calls: "Model calls",
    ofWhichCache: (n: string) => `incl. ${n} from cache`,
    costNote: "Estimate, at the models' prices.",
    costLine: (tokens: string, calls: string) => `${tokens} tokens, ${calls} model calls`,
    rangeLabels: { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months" } as Record<Range, string>,
    overTime: "Over time",
    metric: "Chart",
    kinds: { input: "Input", output: "Output", cache: "Cache" },
    empty: "No usage over this period",
    emptyHint: "Tokens show up here once the bots are used.",
    by: { user: "By member", agent: "By bot", task: "By task", model: "By model" },
    share: "Share",
    noUser: "No member",
    deletedUser: "Deleted account",
    noAgent: "No bot",
    deletedAgent: "Deleted bot",
    tasks: { chat: "Conversations", curator: "Memory curation", contract: "Update checks", otherHermes: "Other Hermes sessions" },
    cronTask: "Scheduled task",
    prices: "Model prices",
    pricesIntro: "In USD per million tokens. By default, the public models.dev price; enter your own (e.g. a subscription billed at a flat rate) to correct estimates, past ones included.",
    model: "Model",
    input: "Input",
    output: "Output",
    cacheRead: "Cache read",
    cacheWrite: "Cache write",
    priceSource: { admin: "Custom", "models.dev": "models.dev", engine: "No price" } as Record<PriceSource, string>,
    engineNote: "Without a price, the engine's own estimate is used, if any.",
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    resetTitle: (model: string) => `Reset the price of ${modelName(model)}?`,
    resetBody: "Your price will be deleted; costs will use the models.dev price again.",
    priceReset: "Price reset.",
    noModels: "No model used yet.",
    actions: "Actions",
    edit: "Edit price",
    editTitle: (model: string) => `Price of ${modelName(model)}`,
    priceLine: (input: string, output: string) => `${input} in, ${output} out`,
    loadError: "Usage unreachable for now",
    loadErrorHint: "The figures couldn't be fetched. Try again in a moment.",
    pricesError: "Prices unreachable for now.",
  },
  fr: {
    title: "Consommation",
    intro: { all: "Tokens consommés par les bots de l'organisation, et leur coût estimé.", self: "Tes tokens consommés avec les bots, et leur coût estimé." },
    ranges: { "24h": "24 h", "7d": "7 jours", "30d": "30 jours", "90d": "90 jours", "12m": "12 mois" },
    period: "Période",
    allUsers: "Tous les membres",
    allAgents: "Tous les bots",
    allSources: "Toutes les sources",
    member: "Membre",
    bot: "Bot",
    source: "Source",
    sources: { chat: "Conversations", cron: "Tâches planifiées", system: "Système", code: "Sessions de code" },
    tokens: "Tokens",
    cost: "Coût estimé",
    calls: "Appels au modèle",
    ofWhichCache: (n: string) => `dont ${n} en cache`,
    costNote: "Estimation, aux tarifs des modèles.",
    costLine: (tokens: string, calls: string) => `${tokens} tokens, ${calls} appels aux modèles`,
    rangeLabels: { "24h": "Dernières 24 heures", "7d": "7 derniers jours", "30d": "30 derniers jours", "90d": "90 derniers jours", "12m": "12 derniers mois" },
    overTime: "Dans le temps",
    metric: "Graphique",
    kinds: { input: "Entrée", output: "Sortie", cache: "Cache" },
    empty: "Aucune consommation sur cette période",
    emptyHint: "Les tokens apparaissent ici dès que les bots sont utilisés.",
    by: { user: "Par membre", agent: "Par bot", task: "Par tâche", model: "Par modèle" },
    share: "Part",
    noUser: "Sans membre",
    deletedUser: "Compte supprimé",
    noAgent: "Sans bot",
    deletedAgent: "Bot supprimé",
    tasks: { chat: "Conversations", curator: "Curation de la mémoire", contract: "Vérification des mises à jour", otherHermes: "Autres sessions Hermes" },
    cronTask: "Tâche planifiée",
    prices: "Prix des modèles",
    pricesIntro:
      "En dollars par million de tokens. Par défaut, le prix public de models.dev ; saisis le tien (un abonnement au forfait, par exemple) pour corriger les estimations, passées comprises.",
    model: "Modèle",
    input: "Entrée",
    output: "Sortie",
    cacheRead: "Lecture cache",
    cacheWrite: "Écriture cache",
    priceSource: { admin: "Saisi", "models.dev": "models.dev", engine: "Sans prix" },
    engineNote: "Sans prix, c'est l'estimation du moteur qui compte, s'il en donne une.",
    save: "Enregistrer",
    saving: "Enregistrement…",
    reset: "Rétablir",
    resetTitle: (model: string) => `Rétablir le prix de ${modelName(model)} ?`,
    resetBody: "Ton prix sera supprimé ; les coûts reprendront le prix de models.dev.",
    priceReset: "Prix rétabli.",
    noModels: "Aucun modèle utilisé pour l'instant.",
    actions: "Actions",
    edit: "Modifier le prix",
    editTitle: (model: string) => `Prix de ${modelName(model)}`,
    priceLine: (input: string, output: string) => `${input} en entrée, ${output} en sortie`,
    loadError: "Consommation injoignable pour l'instant",
    loadErrorHint: "Les chiffres n'ont pas pu être récupérés. Réessaie dans un instant.",
    pricesError: "Prix injoignables pour l'instant.",
  },
});

/** Monochrome: data is ink, each kind a step lighter (--chart-1…5). */
const chartConfig = {
  inputTokens: { color: "var(--chart-1)" },
  outputTokens: { color: "var(--chart-3)" },
  cacheTokens: { color: "var(--chart-5)" },
  cost: { color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * Usage: the estimated cost in one card with the period as its action,
 * then each breakdown (bot, member, task, model) and the timeline in a card of its own.
 */
export function Usage() {
  const t = useT(messages);
  const c = useT(common);
  const f = useFormat();
  const { user } = useRouteContext({ from: "/app" });
  const isAdmin = user.role === "admin";
  const [range, setRange] = useState<Range>("30d");
  const [userId, setUserId] = useState(ALL);
  const [agentId, setAgentId] = useState(ALL);
  const [source, setSource] = useState(ALL);

  const params = new URLSearchParams({ range });
  if (isAdmin) {
    if (userId !== ALL) params.set("userId", userId);
    if (agentId !== ALL) params.set("agentId", agentId);
    if (source !== ALL) params.set("source", source);
  }
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["usage", params.toString()],
    queryFn: () => api<UsageReport>(`/usage?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const totals = data?.totals;

  return (
    <>
      <SectionHeader title={t.title} text={t.intro[isAdmin ? "all" : "self"]} />

      <Card>
        <CardHeader>
          <CardTitle>{t.cost}</CardTitle>
          <CardDescription>{t.costNote}</CardDescription>
          <CardAction>
            <OptionSelect
              aria-label={t.period}
              value={range}
              onValueChange={(v) => setRange(v as Range)}
              options={(Object.keys(t.ranges) as Range[]).map((r) => ({ value: r, label: t.rangeLabels[r], icon: rangeIcon[r] }))}
              className="w-auto"
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Admins narrow the whole report down to one member, bot or source. */}
          {isAdmin && data?.options && (
            <div className="flex flex-wrap gap-2">
              <OptionSelect
                aria-label={t.member}
                value={userId}
                onValueChange={setUserId}
                options={[{ value: ALL, label: t.allUsers, icon: <UsersIcon /> }, ...data.options.users.map((u) => ({ value: u.id, label: u.name, icon: <UserIcon /> }))]}
                className="w-auto"
              />
              <OptionSelect
                aria-label={t.bot}
                value={agentId}
                onValueChange={setAgentId}
                options={[{ value: ALL, label: t.allAgents, icon: <BotIcon /> }, ...data.options.agents.map((a) => ({ value: a.id, label: a.name, icon: <BotIcon /> }))]}
                className="w-auto"
              />
              <OptionSelect
                aria-label={t.source}
                value={source}
                onValueChange={setSource}
                options={[{ value: ALL, label: t.allSources, icon: <LayersIcon /> }, ...(Object.keys(t.sources) as Source[]).map((s) => ({ value: s, label: t.sources[s], icon: sourceIcon[s] }))]}
                className="w-auto"
              />
            </div>
          )}
          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : isError || !totals ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WarningIcon />
                </EmptyMedia>
                <EmptyTitle>{t.loadError}</EmptyTitle>
                <EmptyDescription title={error instanceof Error ? error.message : undefined}>{t.loadErrorHint}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
                  {c.retry}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-semibold tabular-nums">{f.cost(totals.cost)}</p>
              <p className="text-sm text-muted-foreground" title={`${f.whole(totals.tokens)} tokens, ${f.whole(totals.apiCalls)}`}>
                {t.costLine(f.compact(totals.tokens), f.compact(totals.apiCalls))}, {t.ofWhichCache(f.compact(totals.cacheTokens))}
              </p>
              {totals.tokens === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ChartIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t.empty}</EmptyTitle>
                    <EmptyDescription>{t.emptyHint}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {data && totals && totals.tokens > 0 && (
        <>
          <Breakdown report={data} />
          <Timeline report={data} />
        </>
      )}

      {isAdmin && <Prices />}
    </>
  );
}

function Timeline({ report }: { report: UsageReport }) {
  const t = useT(messages);
  const f = useFormat();
  const [metric, setMetric] = useState<"cost" | "tokens">("cost");
  const kinds = ["inputTokens", "outputTokens", "cacheTokens"] as const;
  const kindLabel = { inputTokens: t.kinds.input, outputTokens: t.kinds.output, cacheTokens: t.kinds.cache };
  const config = Object.fromEntries(
    Object.entries(chartConfig).map(([k, v]) => [k, { ...v, label: k === "cost" ? t.cost : kindLabel[k as keyof typeof kindLabel] }]),
  ) as ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.overTime}</CardTitle>
        <CardAction>
          <ToggleGroup aria-label={t.metric} value={[metric]} onValueChange={(v) => v[0] && setMetric(v[0] as "cost" | "tokens")} variant="outline" size="sm">
            <ToggleGroupItem value="cost">{t.cost}</ToggleGroupItem>
            <ToggleGroupItem value="tokens">{t.tokens}</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <BarChart data={report.series} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(v: string) => f.bucket(v, report.bucket)} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => (metric === "cost" ? f.cost(v) : f.compact(v))} />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => f.bucket(String(label), report.bucket)}
                  formatter={
                    metric === "cost"
                      ? (value, name) => (
                          <>
                            <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? t.cost}</span>
                            <span className="ml-auto font-mono font-medium text-foreground tabular-nums">{f.cost(Number(value))}</span>
                          </>
                        )
                      : undefined
                  }
                />
              }
            />
            {metric === "tokens" ? (
              <>
                {kinds.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={kindLabel[k]}
                    stackId="tokens"
                    fill={`var(--color-${k})`}
                    stroke="var(--background)"
                    strokeWidth={1}
                    maxBarSize={24}
                    radius={i === kinds.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
                <ChartLegend content={<ChartLegendContent />} itemSorter={(item) => kinds.indexOf(item.dataKey as (typeof kinds)[number])} />
              </>
            ) : (
              <Bar dataKey="cost" fill="var(--color-cost)" maxBarSize={24} radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

type Line = Summary & { key: string; label: string; icon?: React.ReactNode; hint?: string };

function Breakdown({ report }: { report: UsageReport }) {
  const t = useT(messages);
  const admin = report.scope === "all";

  // No avatar (no member, a deleted bot): the row has no media at all rather than an empty circle.
  const users: Line[] = report.byUser.map((u) => ({
    ...u,
    key: u.id ?? "none",
    label: u.name ?? (u.id ? t.deletedUser : t.noUser),
    icon: u.id && u.name ? <PersonAvatar person={{ id: u.id, name: u.name, image: u.image }} className="size-6" /> : undefined,
  }));
  const agents: Line[] = report.byAgent.map((a) => ({
    ...a,
    key: a.id ?? "none",
    label: a.name ?? (a.id ? t.deletedAgent : t.noAgent),
    icon: a.avatarShape && a.avatarColor ? <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-6" /> : undefined,
  }));
  const taskLabel = (task: UsageReport["byTask"][number]) => {
    if (task.source === "chat") return t.tasks.chat;
    if (task.taskId === "curator") return t.tasks.curator;
    if (task.taskId === "contract") return t.tasks.contract;
    if (task.taskId?.startsWith("hermes:")) return `${t.tasks.otherHermes} (${task.taskId.slice(7)})`;
    return task.name ?? task.taskId ?? t.cronTask;
  };
  const tasks: Line[] = report.byTask.map((task) => ({
    ...task,
    key: task.id,
    label: taskLabel(task),
    hint: task.source === "cron" ? t.cronTask : t.sources[task.source],
  }));
  const models: Line[] = report.byModel.map((m) => ({
    ...m,
    key: `${m.provider}::${m.model}`,
    label: modelName(m.model),
    hint: `${providerName(m.provider)}, ${t.priceSource[m.priced]}`,
    icon: <ModelLogo provider={m.provider} model={m.model} className="size-6" />,
  }));

  const sections = [
    { id: "agent", label: t.by.agent, lines: agents },
    ...(admin ? [{ id: "user", label: t.by.user, lines: users }] : []),
    ...(admin ? [{ id: "task", label: t.by.task, lines: tasks }] : []),
    { id: "model", label: t.by.model, lines: models },
  ].filter((section) => section.lines.length > 0);

  return (
    <>
      {sections.map((section) => (
        <ListCard key={section.id}>
          <ListCardHeader>
            <CardTitle>{section.label}</CardTitle>
          </ListCardHeader>
          <BreakdownRows lines={section.lines} total={report.totals.tokens} />
        </ListCard>
      ))}
    </>
  );
}

/** One breakdown line: avatar, the name (its hint under it), its share of the tokens, its cost. */
function BreakdownRows({ lines, total }: { lines: Line[]; total: number }) {
  const f = useFormat();
  return (
    <ListCardRows>
      {lines.map((l) => (
        <Item size="xs" key={l.key} role="listitem">
          {l.icon && <ItemMedia>{l.icon}</ItemMedia>}
          <ItemContent className="min-w-0">
            <ItemTitle>{l.label}</ItemTitle>
            {l.hint && <ItemDescription>{l.hint}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            <span className="text-sm text-muted-foreground tabular-nums" title={`${f.whole(l.tokens)} tokens`}>
              {f.percent(total ? l.tokens / total : 0)}
            </span>
            <span className="w-16 text-right tabular-nums">{f.cost(l.cost)}</span>
          </ItemActions>
        </Item>
      ))}
    </ListCardRows>
  );
}

/* ---------- prices (admin) ---------- */

function Prices() {
  const t = useT(messages);
  const { data, isPending, isError } = useQuery({ queryKey: ["usage", "prices"], queryFn: () => api<ModelPriceRow[]>("/usage/prices") });
  const [editing, setEditing] = useState<ModelPriceRow | null>(null);

  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>{t.prices}</CardTitle>
        <CardDescription>
          {t.pricesIntro}
          {data?.some((r) => r.source === "engine") && <span className="block">{t.engineNote}</span>}
        </CardDescription>
      </ListCardHeader>
      {isPending ? (
        <CardContent className="py-(--card-spacing)">
          <Loading />
        </CardContent>
      ) : !data?.length ? (
        <CardContent className="py-(--card-spacing)">
          <p className="text-sm text-muted-foreground">{isError ? t.pricesError : t.noModels}</p>
        </CardContent>
      ) : (
        <ListCardRows>
          {data.map((row) => (
            <PriceRow key={`${row.provider}::${row.model}::${row.source}`} row={row} onEdit={() => setEditing(row)} />
          ))}
        </ListCardRows>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && <PriceDialog key={`${editing.provider}::${editing.model}`} row={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </ListCard>
  );
}

const FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;

/** A model and its price per million tokens; edited in a dialog, never inline. */
function PriceRow({ row, onEdit }: { row: ModelPriceRow; onEdit: () => void }) {
  const t = useT(messages);
  const f = useFormat();
  const qc = useQueryClient();
  const price = row.price ?? row.catalogue;
  const reset = useMutation({
    mutationFn: () => api(`/usage/prices?${new URLSearchParams({ provider: row.provider, model: row.model })}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usage"] }),
    meta: { success: t.priceReset },
  });

  return (
    <Item size="xs" role="listitem">
      <ItemMedia>
        <ModelLogo provider={row.provider} model={row.model} className="size-6" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{modelName(row.model)}</ItemTitle>
        <ItemDescription>
          {providerName(row.provider)}, {t.priceSource[row.source]}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {price && <span className="text-sm text-muted-foreground tabular-nums">{t.priceLine(f.cost(price.input), f.cost(price.output))}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} />}>
            <MoreIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              {t.edit}
            </DropdownMenuItem>
            {row.source === "admin" && (
              <DropdownMenuItem
                disabled={reset.isPending}
                onClick={async () => (await confirmAction({ title: t.resetTitle(row.model), description: t.resetBody, action: t.reset })) && reset.mutate()}
              >
                <UndoIcon />
                {t.reset}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

function PriceDialog({ row, onDone }: { row: ModelPriceRow; onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const qc = useQueryClient();
  const initial = Object.fromEntries(FIELDS.map((k) => [k, row.price ? String(row.price[k]) : ""])) as Record<(typeof FIELDS)[number], string>;
  const [draft, setDraft] = useState(initial);
  const dirty = FIELDS.some((k) => draft[k] !== initial[k]);
  const parsed = Object.fromEntries(FIELDS.map((k) => [k, Number(draft[k].replace(",", ".") || "0")])) as Price;
  const valid = FIELDS.every((k) => Number.isFinite(parsed[k]) && parsed[k] >= 0);

  const save = useMutation({
    mutationFn: () => api("/usage/prices", { method: "PUT", body: JSON.stringify({ provider: row.provider, model: row.model, ...parsed }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usage"] });
      onDone();
    },
    meta: { success: c.saved },
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.editTitle(row.model)}</DialogTitle>
        <DialogDescription>{t.pricesIntro}</DialogDescription>
      </DialogHeader>
      <form
        id={`${id}-price`}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && valid) save.mutate();
        }}
      >
        <FieldGroup className="grid grid-cols-2 gap-4">
          {FIELDS.map((k) => (
            <Field key={k}>
              <FieldLabel htmlFor={`${id}-${k}`}>{t[k]}</FieldLabel>
              <Input
                id={`${id}-${k}`}
                inputMode="decimal"
                value={draft[k]}
                placeholder={row.catalogue ? String(row.catalogue[k]) : "0"}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                aria-invalid={!Number.isFinite(parsed[k]) || parsed[k] < 0}
              />
            </Field>
          ))}
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form={`${id}-price`} disabled={!dirty || !valid || save.isPending}>
          {save.isPending ? t.saving : t.save}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
