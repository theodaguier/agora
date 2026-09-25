import { confirmAction } from "@/lib/confirm";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AgentAvatar } from "@/components/AgentAvatar";
import { type AvatarShape } from "@/lib/agent-avatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { ErrorText, Loading, SectionHeader } from "@/components/admin/ui";
import { OptionSelect } from "@/components/Pickers";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { common } from "@agora/core/i18n";
import { defineMessages, useT } from "@/i18n";
import { useFormat } from "@/lib/usage-format";
import { api } from "@/lib/api";

type Range = "24h" | "7d" | "30d" | "90d" | "12m";
type Source = "chat" | "cron" | "system";
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
    sources: { chat: "Conversations", cron: "Scheduled tasks", system: "System" } as Record<Source, string>,
    tokens: "Tokens",
    cost: "Estimated cost",
    calls: "Model calls",
    ofWhichCache: (n: string) => `incl. ${n} from cache`,
    costNote: "Estimate, at the prices below",
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
    resetTitle: (model: string) => `Reset the price of ${model}?`,
    resetBody: "Your price will be deleted; costs will use the models.dev price again.",
    priceReset: "Price reset.",
    noModels: "No model used yet.",
    loadError: "Usage could not be loaded.",
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
    sources: { chat: "Conversations", cron: "Tâches planifiées", system: "Système" },
    tokens: "Tokens",
    cost: "Coût estimé",
    calls: "Appels au modèle",
    ofWhichCache: (n: string) => `dont ${n} en cache`,
    costNote: "Estimation, aux prix ci-dessous",
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
    resetTitle: (model: string) => `Rétablir le prix de ${model} ?`,
    resetBody: "Ton prix sera supprimé ; les coûts reprendront le prix de models.dev.",
    priceReset: "Prix rétabli.",
    noModels: "Aucun modèle utilisé pour l'instant.",
    loadError: "Impossible de charger la consommation.",
  },
});

/** Categorical slots 1–3 of the data-viz palette, stepped for each theme. */
const chartConfig = {
  inputTokens: { theme: { light: "#2a78d6", dark: "#3987e5" } },
  outputTokens: { theme: { light: "#eb6834", dark: "#d95926" } },
  cacheTokens: { theme: { light: "#1baf7a", dark: "#199e70" } },
  cost: { theme: { light: "#2a78d6", dark: "#3987e5" } },
} satisfies ChartConfig;

export function Usage() {
  const t = useT(messages);
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
  const { data, isPending, isError } = useQuery({
    queryKey: ["usage", params.toString()],
    queryFn: () => api<UsageReport>(`/usage?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  return (
    <>
      <SectionHeader title={t.title} text={isAdmin ? t.intro.all : t.intro.self} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ToggleGroup
          aria-label={t.period}
          value={[range]}
          onValueChange={(v) => v[0] && setRange(v[0] as Range)}
          variant="outline"
          size="sm"
          className="flex-wrap"
        >
          {(Object.keys(t.ranges) as Range[]).map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {t.ranges[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {isAdmin && data?.options && (
          <>
            <OptionSelect
              aria-label={t.member}
              value={userId}
              onValueChange={setUserId}
              options={[{ value: ALL, label: t.allUsers }, ...data.options.users.map((u) => ({ value: u.id, label: u.name }))]}
              className="data-[size=default]:h-8 w-auto min-w-40"
            />
            <OptionSelect
              aria-label={t.bot}
              value={agentId}
              onValueChange={setAgentId}
              options={[{ value: ALL, label: t.allAgents }, ...data.options.agents.map((a) => ({ value: a.id, label: a.name }))]}
              className="data-[size=default]:h-8 w-auto min-w-36"
            />
            <OptionSelect
              aria-label={t.source}
              value={source}
              onValueChange={setSource}
              options={[{ value: ALL, label: t.allSources }, ...(Object.keys(t.sources) as Source[]).map((s) => ({ value: s, label: t.sources[s] }))]}
              className="data-[size=default]:h-8 w-auto min-w-40"
            />
          </>
        )}
      </div>

      {isPending ? <Loading /> : isError ? <ErrorText error={new Error(t.loadError)} /> : <Report report={data} />}

      {isAdmin && (
        <>
          <Separator className="my-8" />
          <Prices />
        </>
      )}
    </>
  );
}

function Report({ report }: { report: UsageReport }) {
  const t = useT(messages);
  const f = useFormat();
  const { totals } = report;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t.tokens} value={f.compact(totals.tokens)} title={f.whole(totals.tokens)} note={t.ofWhichCache(f.compact(totals.cacheTokens))} />
        <Stat label={t.cost} value={f.cost(totals.cost)} note={t.costNote} />
        <Stat label={t.calls} value={f.compact(totals.apiCalls)} title={f.whole(totals.apiCalls)} />
      </div>

      {totals.tokens === 0 ? (
        <Empty className="mt-5 border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t.empty}</EmptyTitle>
            <EmptyDescription>{t.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Timeline report={report} />
          <Breakdown report={report} />
        </>
      )}
    </>
  );
}

function Stat(props: { label: string; value: string; note?: string; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums" title={props.title}>
          {props.value}
        </CardTitle>
        {props.note && <CardDescription>{props.note}</CardDescription>}
      </CardHeader>
    </Card>
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
    <Card className="mt-5">
      <CardHeader>
        <CardTitle>{metric === "cost" ? t.cost : t.tokens}</CardTitle>
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
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => (metric === "cost" ? f.cost(v) : f.compact(v))}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]!.payload as UsageReport["series"][number];
              return (
                <div className="grid min-w-40 gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <p className="font-medium">{f.bucket(String(label), report.bucket)}</p>
                  {metric === "tokens" ? (
                    [...kinds].reverse().map((k) => (
                      <p key={k} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-[2px]" style={{ background: `var(--color-${k})` }} />
                        <span className="text-muted-foreground">{kindLabel[k]}</span>
                        <span className="ml-auto tabular-nums">{f.whole(point[k])}</span>
                      </p>
                    ))
                  ) : (
                    <p className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t.cost}</span>
                      <span className="ml-auto tabular-nums">{f.cost(point.cost)}</span>
                    </p>
                  )}
                  {metric === "cost" && <p className="text-muted-foreground">{f.compact(point.tokens)} {t.tokens.toLowerCase()}</p>}
                </div>
              );
            }}
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
    label: m.model,
    hint: `${providerName(m.provider)} · ${t.priceSource[m.priced]}`,
    icon: <ModelLogo provider={m.provider} model={m.model} className="size-5" />,
  }));

  const tabs = [
    ...(admin ? [{ id: "user", label: t.by.user, lines: users }] : []),
    { id: "agent", label: t.by.agent, lines: agents },
    ...(admin ? [{ id: "task", label: t.by.task, lines: tasks }] : []),
    { id: "model", label: t.by.model, lines: models },
  ];

  return (
    <Tabs defaultValue={tabs[0]!.id} className="mt-6">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          <BreakdownTable lines={tab.lines} total={report.totals.tokens} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function BreakdownTable({ lines, total }: { lines: Line[]; total: number }) {
  const t = useT(messages);
  const f = useFormat();
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2" />
            <TableHead className="text-right">{t.tokens}</TableHead>
            <TableHead className="w-32">{t.share}</TableHead>
            <TableHead className="text-right">{t.cost}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const share = total ? l.tokens / total : 0;
            return (
              <TableRow key={l.key}>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-2.5">
                    {l.icon}
                    <span className="min-w-0">
                      <span className="block truncate">{l.label}</span>
                      {l.hint && <span className="block truncate text-xs text-muted-foreground">{l.hint}</span>}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums" title={f.whole(l.tokens)}>
                  {f.compact(l.tokens)}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{f.percent(share)}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{f.cost(l.cost)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- prices (admin) ---------- */

function Prices() {
  const t = useT(messages);
  const { data, isPending } = useQuery({ queryKey: ["usage", "prices"], queryFn: () => api<ModelPriceRow[]>("/usage/prices") });

  return (
    <FieldSet>
      <FieldLegend>{t.prices}</FieldLegend>
      <FieldDescription>{t.pricesIntro}</FieldDescription>
      {isPending ? (
        <Loading />
      ) : !data?.length ? (
        <FieldDescription>{t.noModels}</FieldDescription>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.model}</TableHead>
                  <TableHead>{t.input}</TableHead>
                  <TableHead>{t.output}</TableHead>
                  <TableHead>{t.cacheRead}</TableHead>
                  <TableHead>{t.cacheWrite}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <PriceRow key={`${row.provider}::${row.model}::${row.source}`} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
          {data.some((r) => r.source === "engine") && <FieldDescription>{t.engineNote}</FieldDescription>}
        </>
      )}
    </FieldSet>
  );
}

const FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;

function PriceRow({ row }: { row: ModelPriceRow }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const initial = Object.fromEntries(FIELDS.map((k) => [k, row.price ? String(row.price[k]) : ""])) as Record<(typeof FIELDS)[number], string>;
  const [draft, setDraft] = useState(initial);
  const dirty = FIELDS.some((k) => draft[k] !== initial[k]);
  const parsed = Object.fromEntries(FIELDS.map((k) => [k, Number(draft[k].replace(",", ".") || "0")])) as Price;
  const valid = FIELDS.every((k) => Number.isFinite(parsed[k]) && parsed[k] >= 0);

  const done = () => qc.invalidateQueries({ queryKey: ["usage"] });
  const save = useMutation({
    mutationFn: () => api("/usage/prices", { method: "PUT", body: JSON.stringify({ provider: row.provider, model: row.model, ...parsed }) }),
    onSuccess: done,
    meta: { success: c.saved },
  });
  const reset = useMutation({
    mutationFn: () => api(`/usage/prices?${new URLSearchParams({ provider: row.provider, model: row.model })}`, { method: "DELETE" }),
    onSuccess: done,
    meta: { success: t.priceReset },
  });

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2.5">
          <ModelLogo provider={row.provider} model={row.model} className="size-5" />
          <span className="min-w-0">
            <span className="block max-w-48 truncate">{row.model}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {providerName(row.provider)}
              <Badge variant={row.source === "admin" ? "secondary" : "outline"}>
                {t.priceSource[row.source]}
              </Badge>
            </span>
          </span>
        </span>
      </TableCell>
      {FIELDS.map((k) => (
        <TableCell key={k}>
          <Input
            aria-label={`${row.model} — ${t[k]}`}
            inputMode="decimal"
            value={draft[k]}
            placeholder={row.catalogue ? String(row.catalogue[k]) : "0"}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            className="h-8 w-20 tabular-nums"
          />
        </TableCell>
      ))}
      <TableCell className="text-right">
        <span className="flex justify-end gap-1.5">
          {row.source === "admin" && !dirty && (
            <Button variant="ghost" size="sm" onClick={async () => (await confirmAction({ title: t.resetTitle(row.model), description: t.resetBody, action: t.reset })) && reset.mutate()} disabled={reset.isPending}>
              {t.reset}
            </Button>
          )}
          {dirty && (
            <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
              {save.isPending ? t.saving : t.save}
            </Button>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}
