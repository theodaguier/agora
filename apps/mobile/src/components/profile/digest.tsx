import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Chip, ListGroup, ScrollShadow, SkeletonGroup, Typography } from "heroui-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { PersonAvatar } from "@/components/conversation-avatar";
import { MentionText } from "@/components/mention";
import { Bars, ShareBar } from "@/components/profile/bars";
import { Segmented } from "@/components/profile/native-pickers";
import { Section } from "@/components/profile/settings";
import { format as f } from "@/components/profile/usage-format";
import { fromDay } from "@/lib/availability";
import { digestQuery, markDigestSeen, type Digest, type DigestStats } from "@/lib/digest";
import { defineMessages, locale } from "@/lib/i18n";
import { useMentionables } from "@/lib/people";
import type { AgentSummary } from "@/lib/types";

/* apps/web/src/components/MorningDigest.tsx: the latest recap, read in full (the web's "Learn more" state). */

const messages = defineMessages({
  en: {
    title: "Morning recap",
    daily: (date: string) => `Recap — ${date}`,
    weekly: (range: string) => `Weekly recap — ${range}`,
    dailyLabel: "Daily recap",
    weeklyLabel: "Weekly recap",
    part: "Recap",
    team: "Team",
    you: "For you",
    done: "Done",
    inProgress: "In progress",
    next: "Coming up",
    todo: "On your plate",
    attention: "Needs your attention",
    tasksDone: (n: number) => `${n} task${n > 1 ? "s" : ""} done`,
    overdue: (n: number) => `${n} overdue`,
    open: (n: number) => `${n} open`,
    messages: (n: number) => `${n} message${n > 1 ? "s" : ""}`,
    conversations: (n: number) => `${n} conversation${n > 1 ? "s" : ""}`,
    agents: (n: number) => `${n} bot${n > 1 ? "s" : ""}`,
    tokens: (n: string) => `${n} tokens`,
    activity: "Activity",
    metricMessages: "Messages",
    metricTokens: "Tokens",
    tasksDoneShort: (n: number) => `${n} task${n > 1 ? "s" : ""}`,
    usage: "Token usage",
    usageTeam: "Across the team, estimated cost",
    usageYou: "Your conversations, estimated cost",
    byAgent: "By bot",
    byModel: "By model",
    people: "Most active",
    writtenAt: (time: string) => `Written by AI at ${time}`,
    none: "No recap yet.",
  },
  fr: {
    title: "Récap du matin",
    daily: (date: string) => `Récap — ${date}`,
    weekly: (range: string) => `Récap de la semaine — ${range}`,
    dailyLabel: "Récap du jour",
    weeklyLabel: "Récap de la semaine",
    part: "Récap",
    team: "Équipe",
    you: "Pour vous",
    done: "Fait",
    inProgress: "En cours",
    next: "À venir",
    todo: "À faire",
    attention: "À surveiller",
    tasksDone: (n: number) => `${n} tâche${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""}`,
    overdue: (n: number) => `${n} en retard`,
    open: (n: number) => `${n} ouverte${n > 1 ? "s" : ""}`,
    messages: (n: number) => `${n} message${n > 1 ? "s" : ""}`,
    conversations: (n: number) => `${n} conversation${n > 1 ? "s" : ""}`,
    agents: (n: number) => `${n} bot${n > 1 ? "s" : ""}`,
    tokens: (n: string) => `${n} tokens`,
    activity: "Activité",
    metricMessages: "Messages",
    metricTokens: "Tokens",
    tasksDoneShort: (n: number) => `${n} tâche${n > 1 ? "s" : ""}`,
    usage: "Consommation",
    usageTeam: "Toute l'équipe, coût estimé",
    usageYou: "Vos conversations, coût estimé",
    byAgent: "Par bot",
    byModel: "Par modèle",
    people: "Les plus actifs",
    writtenAt: (time: string) => `Rédigé par l'IA à ${time}`,
    none: "Pas encore de récap.",
  },
});

type Tab = "team" | "you";
const NO_AGENTS: AgentSummary[] = [];

export function DigestView() {
  const { data: digest, isPending } = useQuery(digestQuery);
  const qc = useQueryClient();

  // Read here: the web won't open it again.
  useEffect(() => {
    if (!digest || digest.seen) return;
    markDigestSeen(digest.id).then(() => qc.setQueryData<Digest | null>(digestQuery.queryKey, (d) => d && { ...d, seen: true }));
  }, [digest, qc]);

  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 px-4 pb-12 pt-4">
        {isPending ? (
          <SkeletonGroup isLoading className="gap-4">
            <SkeletonGroup.Item className="h-40" />
            <SkeletonGroup.Item className="h-64" />
          </SkeletonGroup>
        ) : digest ? (
          <Recap digest={digest} />
        ) : (
          <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-4 py-12">
            {messages.none}
          </Typography.Paragraph>
        )}
      </ScrollView>
    </>
  );
}

function Recap({ digest }: { digest: Digest }) {
  const t = messages;
  const mentionables = useMentionables(digest.agents ?? NO_AGENTS);
  const [tab, setTab] = useState<Tab>("team");
  const day = (d: string, opts: Intl.DateTimeFormatOptions) => fromDay(d).toLocaleDateString(locale, opts);
  const weekly = digest.kind === "weekly";
  // A daily recap covers several days after days without one (the weekend, when only weekdays are scheduled).
  const multiDay = digest.periodStart !== digest.periodEnd;
  const range = `${day(digest.periodStart, { day: "numeric", month: "short" })} – ${day(digest.periodEnd, { day: "numeric", month: "short" })}`;
  const title = weekly ? t.weekly(range) : t.daily(multiDay ? range : day(digest.periodStart, { weekday: "long", day: "numeric", month: "long" }));
  const writtenAt = new Date(digest.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const personal = digest.personal;
  const current: Tab = tab === "you" && personal ? "you" : "team";
  const headline = current === "you" ? personal!.headline : digest.team.headline;
  const sections =
    current === "you"
      ? [
          { label: t.attention, items: personal!.attention },
          { label: t.todo, items: personal!.next },
          { label: t.done, items: personal!.done },
        ]
      : [
          { label: t.done, items: digest.team.done },
          { label: t.inProgress, items: digest.team.inProgress },
          { label: t.next, items: digest.team.next },
        ];
  // Recaps written before per-part figures have none.
  const raw = current === "you" ? personal!.stats : digest.stats;
  const stats = raw && "tasks" in raw ? raw : null;

  return (
    <>
      <Typography.Heading type="h3">{title}</Typography.Heading>
      {personal && (
        <Segmented
          label={t.part}
          value={current}
          onChange={setTab}
          options={[
            { value: "team", label: t.team },
            { value: "you", label: t.you },
          ]}
        />
      )}
      <Typography.Paragraph>
        <MentionText text={headline} mentionables={mentionables} flat />
      </Typography.Paragraph>
      {stats && <StatChips stats={stats} you={current === "you"} />}

      {sections
        .filter((s) => s.items.length)
        .map((s) => (
          <View key={s.label} className="gap-2">
            <Typography.Heading type="h6">{s.label}</Typography.Heading>
            {s.items.map((line) => (
              <View key={line} className="flex-row gap-2.5">
                <Typography.Paragraph color="muted">•</Typography.Paragraph>
                <Typography.Paragraph color="muted" className="flex-1">
                  <MentionText text={line} mentionables={mentionables} flat />
                </Typography.Paragraph>
              </View>
            ))}
          </View>
        ))}

      {stats && <Activity stats={stats} byDay={multiDay} />}
      {stats?.usage && stats.usage.tokens > 0 && <UsageBlock usage={stats.usage} you={current === "you"} />}
      {current === "team" && !!stats?.people?.length && <People people={stats.people} />}
      <Typography.Paragraph type="body-sm" color="muted">
        {t.writtenAt(writtenAt)}
      </Typography.Paragraph>
    </>
  );
}

/** The part's figures at a glance: a row of HeroUI Chips that scrolls sideways (ScrollShadow). */
function StatChips({ stats, you }: { stats: DigestStats; you: boolean }) {
  const t = messages;
  const chips = [
    { key: "done", label: t.tasksDone(stats.tasks.done), color: "default" as const, show: true },
    { key: "overdue", label: t.overdue(stats.tasks.overdue), color: "danger" as const, show: stats.tasks.overdue > 0 },
    { key: "open", label: t.open(stats.tasks.open), color: "default" as const, show: stats.tasks.open > 0 },
    { key: "messages", label: t.messages(stats.messages), color: "default" as const, show: stats.messages > 0 },
    { key: "conversations", label: t.conversations(stats.conversations), color: "default" as const, show: you && stats.conversations > 0 },
    { key: "agents", label: t.agents(stats.agents), color: "default" as const, show: stats.agents > 0 },
    {
      key: "usage",
      label: stats.usage?.tokens ? `${t.tokens(f.compact(stats.usage.tokens))} · ${f.cost(stats.usage.cost)}` : "",
      color: "default" as const,
      show: !!stats.usage?.tokens,
    },
  ];
  return (
    <ScrollShadow LinearGradientComponent={LinearGradient} className="-mx-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4">
        {chips
          .filter((c) => c.show)
          .map((c) => (
            <Chip key={c.key} variant="soft" color={c.color}>
              {c.label}
            </Chip>
          ))}
      </ScrollView>
    </ScrollShadow>
  );
}

/** Messages or tokens per hour (one day) or per day. */
function Activity({ stats, byDay }: { stats: DigestStats; byDay: boolean }) {
  const t = messages;
  const [metric, setMetric] = useState<"messages" | "tokens">("messages");
  if (!stats.series.some((p) => p.messages || p.tokens)) return null;
  // Tokens hidden from the reader: messages only.
  const shown = stats.usage ? metric : "messages";
  const label = (v: string) => (byDay ? fromDay(v).toLocaleDateString(locale, { weekday: "short" }) : `${Number(v)}h`);
  return (
    <Card className="gap-3">
      <Card.Title>{t.activity}</Card.Title>
      {stats.usage && (
        <Segmented
          label={t.activity}
          value={shown}
          onChange={setMetric}
          options={[
            { value: "messages", label: t.metricMessages },
            { value: "tokens", label: t.metricTokens },
          ]}
        />
      )}
      <Bars
        data={stats.series}
        height={120}
        label={(p) => label(p.t)}
        segments={(p) => [{ value: p[shown], className: shown === "messages" ? "bg-accent" : "bg-warning" }]}
        detail={(p) =>
          [
            `${t.metricMessages} ${f.whole(p.messages)}`,
            stats.usage ? `${t.metricTokens} ${f.compact(p.tokens)}` : null,
            p.tasksDone > 0 ? `${t.done} ${t.tasksDoneShort(p.tasksDone)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      />
    </Card>
  );
}

/** Tokens and estimated cost, split by bot and by model. */
function UsageBlock({ usage, you }: { usage: NonNullable<DigestStats["usage"]>; you: boolean }) {
  const t = messages;
  const top = usage.byAgent[0]?.tokens || 1;
  return (
    <Card className="gap-3">
      <Card.Title>{t.usage}</Card.Title>
      <Card.Description>{you ? t.usageYou : t.usageTeam}</Card.Description>
      <View className="flex-row items-baseline gap-4">
        <Typography.Heading type="h2" weight="medium" className="tabular-nums">
          {f.compact(usage.tokens)}
        </Typography.Heading>
        <Typography.Paragraph color="muted" className="tabular-nums">
          {f.cost(usage.cost)}
        </Typography.Paragraph>
      </View>
      {usage.byAgent.length > 0 && (
        <View className="gap-3" accessibilityLabel={t.byAgent}>
          <Typography.Paragraph type="body-sm" color="muted">
            {t.byAgent}
          </Typography.Paragraph>
          {usage.byAgent.map((a) => (
            <View key={a.id} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <AgentAvatar agent={a} size={22} />
                <Typography.Paragraph className="flex-1" numberOfLines={1}>
                  {a.name}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-sm" color="muted" className="tabular-nums">
                  {f.compact(a.tokens)} · {f.cost(a.cost)}
                </Typography.Paragraph>
              </View>
              <ShareBar share={a.tokens / top} />
            </View>
          ))}
        </View>
      )}
      {usage.byModel.length > 0 && (
        <View className="gap-2" accessibilityLabel={t.byModel}>
          <Typography.Paragraph type="body-sm" color="muted">
            {t.byModel}
          </Typography.Paragraph>
          <View className="flex-row flex-wrap gap-1.5">
            {usage.byModel.map((m) => (
              <Chip key={`${m.provider}:${m.model}`} variant="secondary" color="default">
                {`${m.model} · ${f.compact(m.tokens)}`}
              </Chip>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

/** Members with the most done tasks and messages over the period. */
function People({ people }: { people: NonNullable<DigestStats["people"]> }) {
  const t = messages;
  return (
    <Section header={t.people} inset="none">
      {people.map((p) => (
        <ListGroup.Item key={p.id} disabled>
          <ListGroup.ItemPrefix>
            <PersonAvatar person={p} size={32} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>{p.name}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Typography.Paragraph type="body-sm" color="muted" className="tabular-nums">
              {[p.tasksDone > 0 ? t.tasksDoneShort(p.tasksDone) : null, p.messages > 0 ? t.messages(p.messages) : null].filter(Boolean).join(" · ")}
            </Typography.Paragraph>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      ))}
    </Section>
  );
}
