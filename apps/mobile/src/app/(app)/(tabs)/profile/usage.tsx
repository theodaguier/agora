import { agentAccentColor, modelName } from "@agora/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { Card, ListGroup, Surface, Typography } from "heroui-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { ErrorAlert, Intro, LoadingRows, PressableRow, Section, SettingsRow, SettingsScroll } from "@/components/admin/ui";
import { PersonAvatar } from "@/components/conversation-avatar";
import { OptionPicker } from "@/components/menus";
import { ModelLogo } from "@/components/model-logo";
import { Bars, type BarSegment } from "@/components/profile/bars";
import { Segmented } from "@/components/profile/native-pickers";
import { priceHref, pricesMessages, pricesQuery } from "@/components/profile/usage-prices";
import { format as f, providerName } from "@/components/profile/usage-format";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";
import type { AvatarShape } from "@/lib/types";

/*
 * apps/web/src/components/Usage.tsx (Settings › Usage, Figma « Consommation »): the estimated cost with the
 * period, its three figures; each breakdown in a group of its own; the cost over time stacked by bot; the
 * admin's model prices, each opening its sheet (usage-price.tsx).
 */

type Range = "24h" | "7d" | "30d" | "90d" | "12m";
type Source = "chat" | "cron" | "system" | "code";
type PriceSource = "admin" | "models.dev" | "engine";
type Summary = { tokens: number; inputTokens: number; outputTokens: number; cacheTokens: number; apiCalls: number; cost: number };

type UsageReport = {
  range: Range;
  bucket: "hour" | "day" | "week" | "month";
  scope: "all" | "self";
  totals: Summary;
  /** `costByAgent`: the bucket's cost per bot id ("" = no bot). */
  series: (Summary & { t: string; costByAgent?: Record<string, number> })[];
  byUser: (Summary & { id: string | null; name: string | null; image: string | null })[];
  byAgent: (Summary & { id: string | null; name: string | null; avatarShape: AvatarShape | null; avatarColor: string | null })[];
  byTask: (Summary & { id: string; taskId: string | null; name: string | null; source: Source })[];
  byModel: (Summary & { provider: string; model: string; priced: PriceSource })[];
  options: { users: { id: string; name: string }[]; agents: { id: string; name: string }[] } | null;
};

const ALL = "all";

const messages = defineMessages({
  en: {
    title: "Usage",
    intro: { all: "Tokens used by the organization's bots, and their estimated cost.", self: "Tokens you used with the bots, and their estimated cost." },
    ranges: { "24h": "24 h", "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" } as Record<Range, string>,
    period: "Period",
    filters: "Filters",
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
    rangeLabels: { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months" } as Record<Range, string>,
    overTime: "Over time",
    metric: "Chart",
    kinds: { input: "Input", output: "Output", cache: "Cache" },
    empty: "No usage over this period",
    emptyHint: "Tokens show up here once the bots are used.",
    by: { user: "By member", agent: "By bot", task: "By task", model: "By model" },
    noUser: "No member",
    deletedUser: "Deleted account",
    noAgent: "No bot",
    deletedAgent: "Deleted bot",
    tasks: { chat: "Conversations", curator: "Memory curation", contract: "Update checks", otherHermes: "Other Hermes sessions" },
    cronTask: "Scheduled task",
    priceSource: { admin: "Custom", "models.dev": "models.dev", engine: "No price" } as Record<PriceSource, string>,
    loadError: "Usage could not be loaded.",
  },
  fr: {
    title: "Consommation",
    intro: { all: "Tokens consommés par les bots de l'organisation, et leur coût estimé.", self: "Tes tokens consommés avec les bots, et leur coût estimé." },
    ranges: { "24h": "24 h", "7d": "7 jours", "30d": "30 jours", "90d": "90 jours", "12m": "12 mois" },
    period: "Période",
    filters: "Filtres",
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
    rangeLabels: { "24h": "Dernières 24 heures", "7d": "7 derniers jours", "30d": "30 derniers jours", "90d": "90 derniers jours", "12m": "12 derniers mois" },
    overTime: "Dans le temps",
    metric: "Graphique",
    kinds: { input: "Entrée", output: "Sortie", cache: "Cache" },
    empty: "Aucune consommation sur cette période",
    emptyHint: "Les tokens apparaissent ici dès que les bots sont utilisés.",
    by: { user: "Par membre", agent: "Par bot", task: "Par tâche", model: "Par modèle" },
    noUser: "Sans membre",
    deletedUser: "Compte supprimé",
    noAgent: "Sans bot",
    deletedAgent: "Bot supprimé",
    tasks: { chat: "Conversations", curator: "Curation de la mémoire", contract: "Vérification des mises à jour", otherHermes: "Autres sessions Hermes" },
    cronTask: "Tâche planifiée",
    priceSource: { admin: "Saisi", "models.dev": "models.dev", engine: "Sans prix" },
    loadError: "Impossible de charger la consommation.",
  },
});

export default function Usage() {
  const t = messages;
  const me = useMe();
  const isAdmin = me.role === "admin";
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
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["usage", params.toString()],
    queryFn: () => api<UsageReport>(`/usage?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const totals = data?.totals;

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <SettingsScroll onRefresh={refetch}>
        <Intro>{isAdmin ? t.intro.all : t.intro.self}</Intro>

        {/* The web's cost card: its title and note, the period as its action, then the figures. */}
        <Section
          title={t.cost}
          footer={t.costNote}
          action={
            <OptionPicker label={t.period} value={range} onChange={setRange} options={(Object.keys(t.ranges) as Range[]).map((r) => ({ value: r, label: t.rangeLabels[r] }))} />
          }
          bare
        >
          {isPending ? (
            <LoadingRows rows={1} avatar={false} />
          ) : isError || !totals ? (
            <ErrorAlert title={t.loadError} error={error} />
          ) : (
            <Card className="gap-1">
              {/* Each figure, then what it counts in grey (Figma « Consommation »). */}
              <View className="flex-row flex-wrap items-baseline gap-x-6 gap-y-2">
                <Figure value={f.cost(totals.cost)} unit={t.cost.toLowerCase()} />
                <Figure value={f.compact(totals.tokens)} unit={t.tokens.toLowerCase()} />
                <Figure value={f.compact(totals.apiCalls)} unit={t.calls.toLowerCase()} />
              </View>
              <Typography.Paragraph type="body-sm" color="muted">
                {t.ofWhichCache(f.compact(totals.cacheTokens))}
              </Typography.Paragraph>
              {totals.tokens === 0 && (
                <View className="items-center gap-1 pt-4">
                  <Card.Title>{t.empty}</Card.Title>
                  <Card.Description className="text-center">{t.emptyHint}</Card.Description>
                </View>
              )}
            </Card>
          )}
        </Section>

        {/* Admins narrow the whole report down to one member, bot or source. */}
        {isAdmin && data?.options && (
          <Section title={t.filters}>
            <SettingsRow label={t.member}>
              <OptionPicker label={t.member} value={userId} onChange={setUserId} options={[{ value: ALL, label: t.allUsers }, ...data.options.users.map((u) => ({ value: u.id, label: u.name }))]} />
            </SettingsRow>
            <SettingsRow label={t.bot}>
              <OptionPicker label={t.bot} value={agentId} onChange={setAgentId} options={[{ value: ALL, label: t.allAgents }, ...data.options.agents.map((a) => ({ value: a.id, label: a.name }))]} />
            </SettingsRow>
            <SettingsRow label={t.source}>
              <OptionPicker
                label={t.source}
                value={source}
                onChange={setSource}
                options={[{ value: ALL, label: t.allSources }, ...(Object.keys(t.sources) as Source[]).map((s) => ({ value: s, label: t.sources[s] }))]}
              />
            </SettingsRow>
          </Section>
        )}

        {data && totals && totals.tokens > 0 && (
          <>
            <Breakdown report={data} />
            <Timeline report={data} />
          </>
        )}

        {isAdmin && <Prices />}
      </SettingsScroll>
    </>
  );
}

/** A headline figure, its unit in grey beside it. */
function Figure({ value, unit }: { value: string; unit: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Typography.Heading type="h3" className="tabular-nums" numberOfLines={1}>
        {value}
      </Typography.Heading>
      <Typography.Paragraph type="body-sm" color="muted">
        {unit}
      </Typography.Paragraph>
    </View>
  );
}

/** Monochrome, as the web's chart: data is ink, each kind a step lighter. */
const KINDS = [
  { key: "inputTokens", className: "bg-foreground" },
  { key: "outputTokens", className: "bg-foreground/60" },
  { key: "cacheTokens", className: "bg-foreground/30" },
] as const;

/** "Sans bot" (and a bot without its colour) in grey. */
const NO_BOT = "bg-muted";

type Legend = { key: string; label: string; segment: Omit<BarSegment, "value"> };

function Timeline({ report }: { report: UsageReport }) {
  const t = messages;
  const [metric, setMetric] = useState<"cost" | "tokens">("cost");
  const kindLabel = { inputTokens: t.kinds.input, outputTokens: t.kinds.output, cacheTokens: t.kinds.cache };
  // Cost stacked by bot (Figma « Consommation »): each bot in its own colour, « No bot » in grey; biggest at the bottom.
  const bots = report.byAgent.filter((a) => report.series.some((p) => (p.costByAgent?.[a.id ?? ""] ?? 0) > 0));
  const stacked = bots.length > 0 && report.series.some((p) => p.costByAgent);
  const botSegment = (a: UsageReport["byAgent"][number]) => (a.id && a.avatarColor ? { color: agentAccentColor(a.avatarColor) } : { className: NO_BOT });
  const botLabel = (a: UsageReport["byAgent"][number]) => (a.id ? (a.name ?? t.deletedAgent) : t.noAgent);
  const legend: Legend[] =
    metric === "tokens"
      ? KINDS.map((k) => ({ key: k.key, label: kindLabel[k.key], segment: { className: k.className } }))
      : stacked
        ? bots.map((a) => ({ key: a.id ?? "none", label: botLabel(a), segment: botSegment(a) }))
        : [];

  return (
    <Section title={t.overTime} bare>
      <Card className="gap-4">
        <Segmented
          label={t.metric}
          value={metric}
          onChange={setMetric}
          options={[
            { value: "cost", label: t.cost },
            { value: "tokens", label: t.tokens },
          ]}
        />
        <Bars
          data={report.series}
          label={(p) => f.bucket(p.t, report.bucket)}
          segments={(p) =>
            metric === "tokens"
              ? KINDS.map((k) => ({ value: p[k.key], className: k.className }))
              : stacked
                ? bots.map((a) => ({ value: p.costByAgent?.[a.id ?? ""] ?? 0, ...botSegment(a) }))
                : [{ value: p.cost, className: "bg-foreground" }]
          }
          detail={(p) =>
            metric === "tokens"
              ? KINDS.map((k) => `${kindLabel[k.key]} ${f.compact(p[k.key])}`).join(" · ")
              : stacked
                ? bots
                    .filter((a) => (p.costByAgent?.[a.id ?? ""] ?? 0) > 0)
                    .map((a) => `${botLabel(a)} ${f.cost(p.costByAgent?.[a.id ?? ""] ?? 0)}`)
                    .join(" · ") || f.cost(p.cost)
                : `${f.cost(p.cost)} · ${f.compact(p.tokens)} ${t.tokens.toLowerCase()}`
          }
        />
        {legend.length > 0 && (
          <View className="flex-row flex-wrap gap-x-4 gap-y-2">
            {legend.map((l) => (
              <View key={l.key} className="flex-row items-center gap-1.5">
                <Surface className={`size-2.5 rounded-sm p-0 shadow-none ${l.segment.className ?? ""}`} style={l.segment.color ? { backgroundColor: l.segment.color } : undefined} />
                <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
                  {l.label}
                </Typography.Paragraph>
              </View>
            ))}
          </View>
        )}
      </Card>
    </Section>
  );
}

type Line = Summary & { key: string; label: string; icon?: ReactNode; hint?: string };

function Breakdown({ report }: { report: UsageReport }) {
  const t = messages;
  const admin = report.scope === "all";
  const taskLabel = (task: UsageReport["byTask"][number]) => {
    if (task.source === "chat") return t.tasks.chat;
    if (task.taskId === "curator") return t.tasks.curator;
    if (task.taskId === "contract") return t.tasks.contract;
    if (task.taskId?.startsWith("hermes:")) return `${t.tasks.otherHermes} (${task.taskId.slice(7)})`;
    return task.name ?? task.taskId ?? t.cronTask;
  };
  // No avatar (no member, a deleted bot): the row has no media at all rather than an empty circle.
  const agents: Line[] = report.byAgent.map((a) => ({
    ...a,
    key: a.id ?? "none",
    label: a.name ?? (a.id ? t.deletedAgent : t.noAgent),
    icon: a.avatarShape && a.avatarColor ? <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={24} /> : undefined,
  }));
  const users: Line[] = report.byUser.map((u) => ({
    ...u,
    key: u.id ?? "none",
    label: u.name ?? (u.id ? t.deletedUser : t.noUser),
    icon: u.id && u.name ? <PersonAvatar person={{ id: u.id, name: u.name, image: u.image }} size={24} /> : undefined,
  }));
  const tasks: Line[] = report.byTask.map((task) => ({ ...task, key: task.id, label: taskLabel(task), hint: task.source === "cron" ? t.cronTask : t.sources[task.source] }));
  const models: Line[] = report.byModel.map((m) => ({
    ...m,
    key: `${m.provider}::${m.model}`,
    label: modelName(m.model),
    hint: `${providerName(m.provider)}, ${t.priceSource[m.priced]}`,
    icon: <ModelLogo provider={m.provider} model={m.model} size={24} />,
  }));
  const sections = [
    { id: "agent", label: t.by.agent, lines: agents },
    ...(admin ? [{ id: "user", label: t.by.user, lines: users }] : []),
    ...(admin ? [{ id: "task", label: t.by.task, lines: tasks }] : []),
    { id: "model", label: t.by.model, lines: models },
  ].filter((section) => section.lines.length > 0);
  const total = report.totals.tokens;

  return (
    <>
      {sections.map((section) => (
        <Section key={section.id} title={section.label}>
          {section.lines.map((l) => (
            <ListGroup.Item key={l.key} disabled accessibilityLabel={`${l.label}, ${f.percent(total ? l.tokens / total : 0)}, ${f.cost(l.cost)}`}>
              {!!l.icon && <ListGroup.ItemPrefix>{l.icon}</ListGroup.ItemPrefix>}
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{l.label}</ListGroup.ItemTitle>
                {!!l.hint && <ListGroup.ItemDescription numberOfLines={1}>{l.hint}</ListGroup.ItemDescription>}
              </ListGroup.ItemContent>
              <Typography.Paragraph type="body-sm" color="muted" className="font-mono tabular-nums">
                {f.percent(total ? l.tokens / total : 0)}
              </Typography.Paragraph>
              <Typography.Paragraph type="body-sm" align="end" className="w-20 font-mono tabular-nums" numberOfLines={1}>
                {f.cost(l.cost)}
              </Typography.Paragraph>
            </ListGroup.Item>
          ))}
        </Section>
      ))}
    </>
  );
}

/* ---------- prices (admin) ---------- */

function Prices() {
  const t = pricesMessages;
  const { data, isPending, error } = useQuery(pricesQuery);
  const footer = [t.pricesIntro, data?.some((r) => r.source === "engine") ? t.engineNote : null].filter(Boolean).join("\n");
  if (isPending || error)
    return (
      <Section title={t.prices} footer={footer} bare>
        {error ? <ErrorAlert error={error} /> : <LoadingRows rows={3} />}
      </Section>
    );
  return (
    <Section title={t.prices} footer={footer}>
      {data?.length ? (
        data.map((row) => {
          const price = row.price ?? row.catalogue;
          return (
            <PressableRow
              key={`${row.provider}::${row.model}::${row.source}`}
              onPress={() => router.push(priceHref(row))}
              accessibilityLabel={[modelName(row.model), providerName(row.provider), t.priceSource[row.source], price ? `${f.cost(price.input)} / ${f.cost(price.output)}` : null].filter(Boolean).join(", ")}
            >
              <ListGroup.ItemPrefix>
                <ModelLogo provider={row.provider} model={row.model} size={24} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{modelName(row.model)}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>{`${providerName(row.provider)}, ${t.priceSource[row.source]}`}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
              {price && (
                <Typography.Paragraph type="body-sm" color="muted" className="font-mono tabular-nums" numberOfLines={1}>
                  {`${f.cost(price.input)} / ${f.cost(price.output)}`}
                </Typography.Paragraph>
              )}
              <ListGroup.ItemSuffix />
            </PressableRow>
          );
        })
      ) : (
        <SettingsRow label={t.noModels} />
      )}
    </Section>
  );
}
