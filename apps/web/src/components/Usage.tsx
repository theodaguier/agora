import { modelName } from "@agora/core";
import { confirmAction } from "@/lib/confirm";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AgentAvatar } from "@/components/AgentAvatar";
import { type AvatarShape } from "@/lib/agent-avatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { ErrorText, Loading } from "@/components/admin/ui";
import { cn } from "@/lib/utils";
import { OptionSelect } from "@/components/Pickers";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipPanel, ChartTooltipRow, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { common } from "@agora/core/i18n";
import { defineMessages, useT } from "@/i18n";
import { useFormat } from "@/lib/usage-format";
import { api } from "@/lib/api";

type Range = "24h" | "7d" | "30d" | "90d" | "12m";
type Source = "chat" | "cron" | "system" | "code";
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
    costLine: (tokens: string, calls: string) => `${tokens} tokens · ${calls} model calls`,
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
    sources: { chat: "Conversations", cron: "Tâches planifiées", system: "Système", code: "Sessions de code" },
    tokens: "Tokens",
    cost: "Coût estimé",
    calls: "Appels au modèle",
    ofWhichCache: (n: string) => `dont ${n} en cache`,
    costNote: "Estimation, aux tarifs des modèles.",
    costLine: (tokens: string, calls: string) => `${tokens} tokens · ${calls} appels aux modèles`,
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
    loadError: "Impossible de charger la consommation.",
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
 * Figma « Paramètres · Consommation »: the title and the period as a pill, the estimated cost in one
 * card, then each breakdown (bot, member, task, model) in a hairline card with a grey title above.
 */
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
      <div className="mb-5 flex min-h-[34px] items-center justify-between gap-4">
        <h2 className="text-xl leading-[26px] font-medium">{t.title}</h2>
        <OptionSelect
          aria-label={t.period}
          value={range}
          onValueChange={(v) => setRange(v as Range)}
          options={(Object.keys(t.ranges) as Range[]).map((r) => ({ value: r, label: t.rangeLabels[r] }))}
          className={pill}
        />
      </div>

      {isAdmin && data?.options && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <OptionSelect
            aria-label={t.member}
            value={userId}
            onValueChange={setUserId}
            options={[{ value: ALL, label: t.allUsers }, ...data.options.users.map((u) => ({ value: u.id, label: u.name }))]}
            className={pill}
          />
          <OptionSelect
            aria-label={t.bot}
            value={agentId}
            onValueChange={setAgentId}
            options={[{ value: ALL, label: t.allAgents }, ...data.options.agents.map((a) => ({ value: a.id, label: a.name }))]}
            className={pill}
          />
          <OptionSelect
            aria-label={t.source}
            value={source}
            onValueChange={setSource}
            options={[{ value: ALL, label: t.allSources }, ...(Object.keys(t.sources) as Source[]).map((s) => ({ value: s, label: t.sources[s] }))]}
            className={pill}
          />
        </div>
      )}

      {isPending ? <Loading /> : isError ? <ErrorText error={new Error(t.loadError)} /> : <Report report={data} />}

      {isAdmin && (
        <div className="mt-8">
          <Prices />
        </div>
      )}
    </>
  );
}

/** Figma « Période »: a select drawn as a white pill. */
const pill = "h-[34px] w-auto min-w-0 rounded-full bg-background px-3.5 data-[size=default]:h-[34px]";

/** A grey title above a hairline card (Figma « Section »). */
function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2 pl-0.5">
        <h3 className="text-[13px] leading-[18px] text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="overflow-hidden rounded-[14px] border border-border bg-background">{children}</div>
    </section>
  );
}

function Report({ report }: { report: UsageReport }) {
  const t = useT(messages);
  const f = useFormat();
  const { totals } = report;

  return (
    <div className="flex flex-col gap-5">
      {/* Figma « Section · Coût ». */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 rounded-[14px] border border-border bg-background px-4 py-3.5">
          <p className="text-sm leading-5">{t.cost}</p>
          <p className="text-[22px] leading-7 font-semibold tabular-nums">{f.cost(totals.cost)}</p>
          <p className="text-[13px] leading-[18px] text-muted-foreground" title={`${f.whole(totals.tokens)} · ${f.whole(totals.apiCalls)}`}>
            {t.costLine(f.compact(totals.tokens), f.compact(totals.apiCalls))} · {t.ofWhichCache(f.compact(totals.cacheTokens))}
          </p>
        </div>
        <p className="pl-0.5 text-xs leading-4 text-subtle">{t.costNote}</p>
      </section>

      {totals.tokens === 0 ? (
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyTitle>{t.empty}</EmptyTitle>
            <EmptyDescription>{t.emptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Breakdown report={report} />
          <Timeline report={report} />
        </>
      )}
    </div>
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
    <Section
      title={t.overTime}
      action={
        <ToggleGroup aria-label={t.metric} value={[metric]} onValueChange={(v) => v[0] && setMetric(v[0] as "cost" | "tokens")} variant="outline" size="sm">
          <ToggleGroupItem value="cost">{t.cost}</ToggleGroupItem>
          <ToggleGroupItem value="tokens">{t.tokens}</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <div className="px-3 pt-4 pb-2">
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
                <ChartTooltipPanel title={f.bucket(String(label), report.bucket)}>
                  {metric === "tokens" ? (
                    [...kinds].reverse().map((k) => <ChartTooltipRow key={k} color={`var(--color-${k})`} name={kindLabel[k]} value={f.whole(point[k])} />)
                  ) : (
                    <>
                      <ChartTooltipRow name={t.cost} value={f.cost(point.cost)} />
                      <ChartTooltipRow name={t.tokens} value={f.compact(point.tokens)} />
                    </>
                  )}
                </ChartTooltipPanel>
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
      </div>
    </Section>
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
    label: modelName(m.model),
    hint: `${providerName(m.provider)} · ${t.priceSource[m.priced]}`,
    icon: <ModelLogo provider={m.provider} model={m.model} className="size-5" />,
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
        <Section key={section.id} title={section.label}>
          <BreakdownRows lines={section.lines} total={report.totals.tokens} />
        </Section>
      ))}
    </>
  );
}

/** Figma « Ligne · … »: avatar 24, the name (its hint under it), its share of the tokens, its cost. */
function BreakdownRows({ lines, total }: { lines: Line[]; total: number }) {
  const f = useFormat();
  return (
    <div className="flex flex-col px-4 py-1">
      {lines.map((l) => {
        const share = total ? l.tokens / total : 0;
        return (
          <div key={l.key} className="flex min-h-[42px] items-center gap-2.5 py-1.5">
            {l.icon ?? <span className="size-6 shrink-0 rounded-full bg-secondary" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-5">{l.label}</span>
              {l.hint && <span className="block truncate text-xs leading-4 text-muted-foreground">{l.hint}</span>}
            </span>
            <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums" title={`${f.whole(l.tokens)} tokens`}>
              {f.percent(share)}
            </span>
            <span className="w-[68px] shrink-0 text-right text-sm leading-5 tabular-nums">{f.cost(l.cost)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- prices (admin) ---------- */

function Prices() {
  const t = useT(messages);
  const { data, isPending } = useQuery({ queryKey: ["usage", "prices"], queryFn: () => api<ModelPriceRow[]>("/usage/prices") });

  return (
    <FieldSet className="gap-2">
      <FieldLegend className="pl-0.5 text-[13px] leading-[18px] font-normal text-muted-foreground">{t.prices}</FieldLegend>
      <FieldDescription className="pl-0.5 text-xs">{t.pricesIntro}</FieldDescription>
      {isPending ? (
        <Loading />
      ) : !data?.length ? (
        <FieldDescription>{t.noModels}</FieldDescription>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[14px] border border-border bg-background">
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
            <span className="block max-w-48 truncate">{modelName(row.model)}</span>
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
