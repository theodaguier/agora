import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { Alert, Card, Chip, ListGroup, Popover, PressableFeedback, Skeleton, SkeletonGroup, Typography } from "heroui-native";
import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { PersonAvatar } from "@/components/conversation-avatar";
import { Bars, ShareBar } from "@/components/profile/bars";
import { MenuPicker, Segmented } from "@/components/profile/native-pickers";
import { ControlRow, ErrorNote, LinkRow, Section } from "@/components/profile/settings";
import { priceHref, pricesMessages, pricesQuery } from "@/components/profile/usage-prices";
import { format as f, providerName } from "@/components/profile/usage-format";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { usePullToRefresh } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import type { AvatarShape } from "@/lib/types";

/* apps/web/src/components/Usage.tsx (Settings › Usage); the admin's price of each model opens in a sheet (usage-price.tsx). */

type Range = "24h" | "7d" | "30d" | "90d" | "12m";
type Source = "chat" | "cron" | "system";
type PriceSource = "admin" | "models.dev" | "engine";
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
    sources: { chat: "Conversations", cron: "Scheduled tasks", system: "System" } as Record<Source, string>,
    tokens: "Tokens",
    cost: "Estimated cost",
    calls: "Model calls",
    ofWhichCache: (n: string) => `incl. ${n} from cache`,
    costNote: "Estimate, at the configured prices",
    tokensHelp: "Everything the models read and wrote for the bots: input, output and cache.",
    callsHelp: "Requests sent to the models.",
    statHint: "Shows what this figure counts",
    metric: "Chart",
    kinds: { input: "Input", output: "Output", cache: "Cache" },
    empty: "No usage over this period",
    emptyHint: "Tokens show up here once the bots are used.",
    by: { user: "By member", agent: "By bot", task: "By task", model: "By model" },
    breakdown: "Breakdown",
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
    sources: { chat: "Conversations", cron: "Tâches planifiées", system: "Système" },
    tokens: "Tokens",
    cost: "Coût estimé",
    calls: "Appels au modèle",
    ofWhichCache: (n: string) => `dont ${n} en cache`,
    costNote: "Estimation, aux prix configurés",
    tokensHelp: "Tout ce que les modèles ont lu et écrit pour les bots : entrée, sortie et cache.",
    callsHelp: "Requêtes envoyées aux modèles.",
    statHint: "Montre ce que compte ce chiffre",
    metric: "Graphique",
    kinds: { input: "Entrée", output: "Sortie", cache: "Cache" },
    empty: "Aucune consommation sur cette période",
    emptyHint: "Les tokens apparaissent ici dès que les bots sont utilisés.",
    by: { user: "Par membre", agent: "Par bot", task: "Par tâche", model: "Par modèle" },
    breakdown: "Répartition",
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
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["usage", params.toString()],
    queryFn: () => api<UsageReport>(`/usage?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const pull = usePullToRefresh(refetch);

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="bg-background"
        contentContainerClassName="gap-6 px-4 pb-12 pt-4"
        refreshControl={
          <RefreshControl
            {...pull}
          />
        }
      >
        <Typography.Paragraph type="body-sm" color="muted" className="px-4">
          {isAdmin ? t.intro.all : t.intro.self}
        </Typography.Paragraph>
        <Segmented label={t.period} value={range} onChange={setRange} options={(Object.keys(t.ranges) as Range[]).map((r) => ({ value: r, label: t.ranges[r] }))} />

        {isAdmin && data?.options && (
          <Section header={t.filters}>
            <ControlRow title={t.member}>
              <MenuPicker label={t.member} value={userId} onChange={setUserId} options={[{ value: ALL, label: t.allUsers }, ...data.options.users.map((u) => ({ value: u.id, label: u.name }))]} />
            </ControlRow>
            <ControlRow title={t.bot}>
              <MenuPicker label={t.bot} value={agentId} onChange={setAgentId} options={[{ value: ALL, label: t.allAgents }, ...data.options.agents.map((a) => ({ value: a.id, label: a.name }))]} />
            </ControlRow>
            <ControlRow title={t.source}>
              <MenuPicker
                label={t.source}
                value={source}
                onChange={setSource}
                options={[{ value: ALL, label: t.allSources }, ...(Object.keys(t.sources) as Source[]).map((s) => ({ value: s, label: t.sources[s] }))]}
              />
            </ControlRow>
          </Section>
        )}

        {isPending ? (
          <SkeletonGroup isLoading className="gap-4">
            <SkeletonGroup.Item className="h-24" />
            <SkeletonGroup.Item className="h-64" />
          </SkeletonGroup>
        ) : isError || !data ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{t.loadError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : (
          <Report report={data} />
        )}

        {isAdmin && <Prices />}
      </ScrollView>
    </>
  );
}

function Report({ report }: { report: UsageReport }) {
  const t = messages;
  const { totals } = report;
  return (
    <>
      <View className="flex-row gap-3">
        <Stat label={t.tokens} value={f.compact(totals.tokens)} note={t.ofWhichCache(f.compact(totals.cacheTokens))} help={t.tokensHelp} />
        <Stat label={t.cost} value={f.cost(totals.cost)} help={t.costNote} />
      </View>
      <View className="flex-row">
        <Stat label={t.calls} value={f.compact(totals.apiCalls)} help={t.callsHelp} />
      </View>

      {totals.tokens === 0 ? (
        <Card className="items-center gap-1">
          <Card.Title>{t.empty}</Card.Title>
          <Card.Description className="text-center">{t.emptyHint}</Card.Description>
        </Card>
      ) : (
        <>
          <Timeline report={report} />
          <Breakdown report={report} />
        </>
      )}
    </>
  );
}

/** A figure in a Card; a tap on it explains what it counts, in a HeroUI Popover. */
function Stat({ label, value, note, help }: { label: string; value: string; note?: string; help: string }) {
  return (
    // The Popover's root is the flex item of the row: it takes the share of the width, the card fills it.
    <Popover className="flex-1">
      <Popover.Trigger asChild>
        <PressableFeedback className="flex-1" accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} accessibilityHint={messages.statHint}>
          <Card className="flex-1 gap-1">
            <Card.Description>{label}</Card.Description>
            <Typography.Heading type="h3" className="tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
              {value}
            </Typography.Heading>
            {!!note && (
              <Typography.Paragraph type="body-xs" color="muted">
                {note}
              </Typography.Paragraph>
            )}
          </Card>
        </PressableFeedback>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" placement="bottom" width={280} className="gap-1">
          <Popover.Title>{label}</Popover.Title>
          <Popover.Description>{help}</Popover.Description>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

/** Each kind of token: its bar color and the matching HeroUI Chip color of the legend. */
const KINDS = [
  { key: "inputTokens", className: "bg-accent", color: "accent" },
  { key: "outputTokens", className: "bg-warning", color: "warning" },
  { key: "cacheTokens", className: "bg-success", color: "success" },
] as const;

function Timeline({ report }: { report: UsageReport }) {
  const t = messages;
  const [metric, setMetric] = useState<"cost" | "tokens">("cost");
  const kindLabel = { inputTokens: t.kinds.input, outputTokens: t.kinds.output, cacheTokens: t.kinds.cache };
  return (
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
        segments={(p) => (metric === "cost" ? [{ value: p.cost, className: "bg-accent" }] : KINDS.map((k) => ({ value: p[k.key], className: k.className })))}
        detail={(p) =>
          metric === "cost" ? `${f.cost(p.cost)} · ${f.compact(p.tokens)} ${t.tokens.toLowerCase()}` : KINDS.map((k) => `${kindLabel[k.key]} ${f.compact(p[k.key])}`).join(" · ")
        }
      />
      {metric === "tokens" && (
        <View className="flex-row flex-wrap gap-2">
          {KINDS.map((k) => (
            <Chip key={k.key} size="sm" variant="soft" color={k.color}>
              {kindLabel[k.key]}
            </Chip>
          ))}
        </View>
      )}
    </Card>
  );
}

type Line = Summary & { key: string; label: string; icon?: ReactNode; hint?: string };
type By = "user" | "agent" | "task" | "model";

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
  const lines: Record<By, Line[]> = {
    user: report.byUser.map((u) => ({
      ...u,
      key: u.id ?? "none",
      label: u.name ?? (u.id ? t.deletedUser : t.noUser),
      icon: u.id && u.name ? <PersonAvatar person={{ id: u.id, name: u.name, image: u.image }} size={28} /> : undefined,
    })),
    agent: report.byAgent.map((a) => ({
      ...a,
      key: a.id ?? "none",
      label: a.name ?? (a.id ? t.deletedAgent : t.noAgent),
      icon: a.avatarShape && a.avatarColor ? <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={28} /> : undefined,
    })),
    task: report.byTask.map((task) => ({ ...task, key: task.id, label: taskLabel(task), hint: task.source === "cron" ? t.cronTask : t.sources[task.source] })),
    model: report.byModel.map((m) => ({ ...m, key: `${m.provider}::${m.model}`, label: m.model, hint: `${providerName(m.provider)} · ${t.priceSource[m.priced]}` })),
  };
  const tabs: By[] = admin ? ["user", "agent", "task", "model"] : ["agent", "model"];
  const [by, setBy] = useState<By>(tabs[0]!);
  const total = report.totals.tokens;

  return (
    <View className="gap-3">
      <Segmented label={t.breakdown} value={by} onChange={setBy} options={tabs.map((id) => ({ value: id, label: t.by[id] }))} />
      <Section inset="none">
        {lines[by].map((l) => {
          const share = total ? l.tokens / total : 0;
          return (
            <ListGroup.Item key={l.key} disabled>
              {!!l.icon && <ListGroup.ItemPrefix>{l.icon}</ListGroup.ItemPrefix>}
              <ListGroup.ItemContent className="gap-1.5">
                <View className="flex-row items-baseline gap-2">
                  <ListGroup.ItemTitle className="flex-1" numberOfLines={1}>
                    {l.label}
                  </ListGroup.ItemTitle>
                  <Typography.Paragraph type="body-sm" className="tabular-nums">
                    {f.cost(l.cost)}
                  </Typography.Paragraph>
                </View>
                {!!l.hint && <ListGroup.ItemDescription numberOfLines={1}>{l.hint}</ListGroup.ItemDescription>}
                <View className="flex-row items-center gap-2">
                  <ShareBar share={share} />
                  <Typography.Paragraph type="body-xs" color="muted" align="end" className="w-24 tabular-nums">
                    {f.compact(l.tokens)} · {f.percent(share)}
                  </Typography.Paragraph>
                </View>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          );
        })}
      </Section>
    </View>
  );
}

/* ---------- prices (admin) ---------- */

function Prices() {
  const t = pricesMessages;
  const { data, isPending, error } = useQuery(pricesQuery);
  const amount = (n: number) => `$${n}`;
  if (isPending) return <Skeleton className="h-28" />;
  return (
    <View className="gap-2">
      <Section
        header={t.prices}
        footer={
          <View className="gap-2 px-4">
            <Typography.Paragraph type="body-sm" color="muted">
              {t.pricesIntro}
            </Typography.Paragraph>
            {data?.some((r) => r.source === "engine") && (
              <Typography.Paragraph type="body-sm" color="muted">
                {t.engineNote}
              </Typography.Paragraph>
            )}
          </View>
        }
      >
        {data?.length ? (
          data.map((row) => {
            const price = row.price ?? row.catalogue;
            return (
              <LinkRow
                key={`${row.provider}::${row.model}::${row.source}`}
                title={row.model}
                description={`${providerName(row.provider)} · ${t.priceSource[row.source]}`}
                value={price ? `${amount(price.input)} / ${amount(price.output)}` : null}
                onPress={() => router.push(priceHref(row))}
              />
            );
          })
        ) : (
          <LinkRow title={t.noModels} chevron={false} disabled />
        )}
      </Section>
      <ErrorNote error={error} />
    </View>
  );
}
