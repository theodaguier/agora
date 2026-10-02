import { byteUnit, durationParts, type ServerHistoryRange, type ServerReport } from "@agora/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Card, Chip, ListGroup, SkeletonGroup, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, Intro, Section, SettingsScroll } from "@/components/admin/ui";
import { Bars, ShareBar } from "@/components/profile/bars";
import { Segmented } from "@/components/profile/native-pickers";
import { headerIcon } from "@/components/header-button";
import { serverQuery } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { defineMessages, intlLocale } from "@/lib/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";

/* apps/web/src/components/admin/Server.tsx */

const messages = defineMessages({
  en: {
    title: "Server",
    intro: "The machine the instance runs on, and what it holds. Refreshed every 15 seconds.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    updatedAt: (time: string) => `Updated at ${time}`,
    cpu: "Processor",
    cores: (n: number) => (n === 1 ? "1 core" : `${n} cores`),
    load: (l: string) => `Load ${l}`,
    memory: "Memory",
    swap: (used: string, total: string) => `Swap ${used} / ${total}`,
    disk: "Disk",
    free: (n: string) => `${n} free`,
    uptime: "Uptime",
    appUptime: (d: string) => `App restarted ${d} ago`,
    of: (used: string, total: string) => `${used} of ${total}`,
    history: "Load",
    since: (d: string) => `Kept in memory since ${d}.`,
    noHistory: "The first point arrives within a minute of the server starting.",
    ranges: { "1h": "1 hour", "24h": "24 hours" } as Record<ServerHistoryRange, string>,
    period: "Period",
    live: "Right now",
    online: "Members online",
    working: "Bots working",
    queued: "Replies queued",
    activity: "Activity",
    activityIntro: "Messages per day, over the last 30 days.",
    kinds: { user: "Members", bot: "Bots" },
    activeUsers: "Active members",
    activeIntro: "Members who wrote at least one message.",
    periods: { day: "24 hours", week: "7 days", month: "30 days" },
    content: "Content",
    totals: { users: "Members", agents: "Bots", conversations: "Conversations", messages: "Messages", tasks: "Tasks", files: "Files" },
    database: "Database",
    connections: (active: number, total: number) => `${active} active connection${active === 1 ? "" : "s"} out of ${total}`,
    machine: "Machine",
    host: "Host",
    system: "System",
    runtime: "Runtime",
    version: "Version",
    appMemory: "App memory",
    duration: { d: (n: number) => `${n} d`, h: (n: number) => `${n} h`, m: (n: number) => `${n} min` },
    units: { byte: "B", kilobyte: "KB", megabyte: "MB", gigabyte: "GB", terabyte: "TB" },
  },
  fr: {
    title: "Serveur",
    intro: "La machine sur laquelle tourne l'instance, et ce qu'elle contient. Actualisé toutes les 15 secondes.",
    refresh: "Actualiser",
    refreshing: "Actualisation…",
    updatedAt: (time: string) => `Actualisé à ${time}`,
    cpu: "Processeur",
    cores: (n: number) => (n === 1 ? "1 cœur" : `${n} cœurs`),
    load: (l: string) => `Charge ${l}`,
    memory: "Mémoire",
    swap: (used: string, total: string) => `Swap ${used} / ${total}`,
    disk: "Disque",
    free: (n: string) => `${n} libres`,
    uptime: "En ligne depuis",
    appUptime: (d: string) => `App relancée il y a ${d}`,
    of: (used: string, total: string) => `${used} sur ${total}`,
    history: "Charge",
    since: (d: string) => `Gardée en mémoire depuis le ${d}.`,
    noHistory: "Le premier point arrive dans la minute qui suit le démarrage du serveur.",
    ranges: { "1h": "1 heure", "24h": "24 heures" },
    period: "Période",
    live: "En ce moment",
    online: "Membres en ligne",
    working: "Bots au travail",
    queued: "Réponses en attente",
    activity: "Activité",
    activityIntro: "Messages par jour, sur les 30 derniers jours.",
    kinds: { user: "Membres", bot: "Bots" },
    activeUsers: "Membres actifs",
    activeIntro: "Membres ayant écrit au moins un message.",
    periods: { day: "24 heures", week: "7 jours", month: "30 jours" },
    content: "Contenu",
    totals: { users: "Membres", agents: "Bots", conversations: "Conversations", messages: "Messages", tasks: "Tâches", files: "Fichiers" },
    database: "Base de données",
    connections: (active: number, total: number) => `${active} connexion${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""} sur ${total}`,
    machine: "Machine",
    host: "Hôte",
    system: "Système",
    runtime: "Environnement",
    version: "Version",
    appMemory: "Mémoire de l'app",
    duration: { d: (n: number) => `${n} j`, h: (n: number) => `${n} h`, m: (n: number) => `${n} min` },
    units: { byte: "o", kilobyte: "Ko", megabyte: "Mo", gigabyte: "Go", terabyte: "To" },
  },
});

const t = messages;
const whole = numberFormat(intlLocale);
const percent = numberFormat(intlLocale, { style: "percent", maximumFractionDigits: 0 });
const decimal = numberFormat(intlLocale, { maximumFractionDigits: 2 });
const oneDecimal = numberFormat(intlLocale, { maximumFractionDigits: 1 });
const noDecimal = numberFormat(intlLocale, { maximumFractionDigits: 0 });

const f = {
  whole: (n: number) => whole.format(n),
  percent: (n: number) => percent.format(n),
  decimal: (n: number) => decimal.format(n),
  // Hermes' Intl has no reliable `unit` style: the unit is appended here.
  bytes: (n: number) => {
    const { value, unit } = byteUnit(n);
    return `${(value < 10 ? oneDecimal : noDecimal).format(value)} ${t.units[unit]}`;
  },
  duration: (seconds: number) => {
    const { d, h, m } = durationParts(seconds);
    if (d) return [t.duration.d(d), h && t.duration.h(h)].filter(Boolean).join(" ");
    if (h) return [t.duration.h(h), m && t.duration.m(m)].filter(Boolean).join(" ");
    return t.duration.m(m);
  },
  clock: (iso: string) => dateFormat(intlLocale, { timeStyle: "medium" }).format(new Date(iso)),
  time: (iso: string) => dateFormat(intlLocale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
  dateTime: (iso: string) => dateFormat(intlLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
  day: (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return dateFormat(intlLocale, { day: "numeric", month: "short" }).format(new Date(y!, m! - 1, day));
  },
};

export default function Server() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <ServerReportScreen />
      </AdminGate>
    </>
  );
}

function ServerReportScreen() {
  const [range, setRange] = useState<ServerHistoryRange>("1h");
  const { data, error, isFetching, refetch } = useQuery({ ...serverQuery(range), placeholderData: keepPreviousData, refetchInterval: 15_000 });

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.refresh} iconRenderingMode="template" accessibilityLabel={isFetching ? t.refreshing : t.refresh} disabled={isFetching} onPress={withTap(() => refetch())} />
      </Stack.Toolbar>
      <SettingsScroll onRefresh={refetch}>
        <View className="gap-1">
          <Intro>{t.intro}</Intro>
          {!!data && (
            <Typography.Paragraph type="body-xs" color="muted" className="px-4 tabular-nums">
              {isFetching ? t.refreshing : t.updatedAt(f.clock(data.at))}
            </Typography.Paragraph>
          )}
        </View>
        {!data ? (
          error ? (
            <ErrorAlert error={error} />
          ) : (
            <SkeletonGroup isLoading className="gap-4">
              <SkeletonGroup.Item className="h-28" />
              <SkeletonGroup.Item className="h-28" />
              <SkeletonGroup.Item className="h-56" />
            </SkeletonGroup>
          )
        ) : (
          <Report report={data} range={range} onRange={setRange} />
        )}
      </SettingsScroll>
    </>
  );
}

function Report({ report, range, onRange }: { report: ServerReport; range: ServerHistoryRange; onRange: (r: ServerHistoryRange) => void }) {
  const { host, now, process, activity } = report;
  const disk = report.disks[0];
  const memShare = now.memory.used / now.memory.total;

  return (
    <>
      <View className="gap-3">
        <View className="flex-row gap-3">
          <Gauge label={t.cpu} value={now.cpu === null ? "—" : f.percent(now.cpu)} share={now.cpu} note={t.load(host.loadavg.map(f.decimal).join(" "))} />
          <Gauge label={t.memory} value={f.percent(memShare)} share={memShare} note={t.of(f.bytes(now.memory.used), f.bytes(now.memory.total))} />
        </View>
        <View className="flex-row gap-3">
          {disk && (
            <Gauge label={t.disk} value={f.percent((disk.total - disk.free) / disk.total)} share={(disk.total - disk.free) / disk.total} note={t.free(f.bytes(disk.free))} />
          )}
          <Gauge label={t.uptime} value={f.duration(host.uptime)} note={t.appUptime(f.duration(process.uptime))} />
        </View>
      </View>

      <LoadHistory report={report} range={range} onRange={onRange} />

      <Section title={t.live}>
        <Fact label={t.online} value={f.whole(now.online)} />
        <Fact label={t.working} value={f.whole(now.working)} />
        <Fact label={t.queued} value={f.whole(activity.queuedTurns)} />
      </Section>

      <Section title={t.activity} bare footer={t.activityIntro}>
        <Card className="gap-3">
          <Bars
            data={activity.messagesPerDay}
            label={(p) => f.day(p.t)}
            segments={(p) => [
              { value: p.user, className: "bg-accent" },
              { value: p.bot, className: "bg-warning" },
            ]}
            detail={(p) => `${t.kinds.user} ${f.whole(p.user)} · ${t.kinds.bot} ${f.whole(p.bot)}`}
            height={140}
          />
          <View className="flex-row flex-wrap gap-2">
            <Chip size="sm" variant="soft" color="accent">
              {t.kinds.user}
            </Chip>
            <Chip size="sm" variant="soft" color="warning">
              {t.kinds.bot}
            </Chip>
          </View>
        </Card>
      </Section>

      <Section title={t.activeUsers} footer={t.activeIntro}>
        {(["day", "week", "month"] as const).map((p) => (
          <Fact key={p} label={t.periods[p]} value={`${f.whole(activity.activeUsers[p])} / ${f.whole(activity.totals.users)}`} />
        ))}
      </Section>

      <Section title={t.content}>
        <Fact label={t.totals.users} value={f.whole(activity.totals.users)} />
        <Fact label={t.totals.agents} value={f.whole(activity.totals.agents)} />
        <Fact label={t.totals.conversations} value={f.whole(activity.totals.conversations)} />
        <Fact label={t.totals.messages} value={f.whole(activity.totals.messages)} />
        <Fact label={t.totals.tasks} value={f.whole(activity.totals.tasks)} />
        <Fact label={t.totals.files} value={`${f.whole(activity.totals.files)} · ${f.bytes(activity.totals.filesBytes)}`} />
      </Section>

      <Database report={report} />

      <Section title={t.machine}>
        <Fact label={t.host} value={host.hostname} />
        <Fact label={t.system} value={`${host.platform} ${host.release}`} />
        <Fact label={t.cpu} value={`${host.cpuModel ?? "—"} · ${t.cores(host.cpuCount)}`} />
        <Fact label={t.runtime} value={process.runtime} />
        <Fact label={t.version} value={[`Agora ${process.app}`, `Hermes ${process.hermes}`].join(" · ")} />
        <Fact label={t.appMemory} value={f.bytes(process.rss)} />
      </Section>
    </>
  );
}

/** A figure in a Card, and how full it is when it measures a capacity. */
function Gauge({ label, value, note, share }: { label: string; value: string; note?: string; share?: number | null }) {
  return (
    <Card className="flex-1 gap-1.5">
      <Card.Description>{label}</Card.Description>
      <Typography.Heading type="h3" className="tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Typography.Heading>
      {share != null && (
        <View className="flex-row">
          <ShareBar share={share} className={share > 0.9 ? "bg-danger" : share > 0.75 ? "bg-warning" : undefined} />
        </View>
      )}
      {!!note && (
        <Typography.Paragraph type="body-xs" color="muted" numberOfLines={2}>
          {note}
        </Typography.Paragraph>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>{label}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Typography.Paragraph color="muted" className="max-w-56 tabular-nums" numberOfLines={1} selectable>
          {value}
        </Typography.Paragraph>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

function LoadHistory({ report, range, onRange }: { report: ServerReport; range: ServerHistoryRange; onRange: (r: ServerHistoryRange) => void }) {
  const total = report.now.memory.total;
  // Buckets before the server started have no sample: left out rather than drawn at 0.
  // Each column is topped up to 100% with a transparent segment: the scale is the capacity, not the busiest minute.
  const points = report.history.points.filter((p) => p.n > 0);

  return (
    <Section title={t.history} bare footer={report.history.since ? t.since(f.dateTime(report.history.since)) : undefined}>
      <Card className="gap-4">
        <Segmented label={t.period} value={range} onChange={onRange} options={(Object.keys(t.ranges) as ServerHistoryRange[]).map((r) => ({ value: r, label: t.ranges[r] }))} />
        {points.length < 2 ? (
          <Typography.Paragraph type="body-sm" color="muted" align="center" className="py-8">
            {t.noHistory}
          </Typography.Paragraph>
        ) : (
          <>
            <View className="gap-1">
              <Typography.Paragraph type="body-sm">{t.cpu}</Typography.Paragraph>
              <Bars data={points} label={(p) => f.time(p.t)} segments={(p) => [{ value: p.cpu, className: "bg-accent" }, { value: 1 - p.cpu, className: "bg-transparent" }]} detail={(p) => f.percent(p.cpu)} height={80} />
            </View>
            <View className="gap-1">
              <Typography.Paragraph type="body-sm">{t.memory}</Typography.Paragraph>
              <Bars
                data={points}
                label={(p) => f.time(p.t)}
                segments={(p) => [
                  { value: p.memUsed / total, className: "bg-warning" },
                  { value: 1 - p.memUsed / total, className: "bg-transparent" },
                ]}
                detail={(p) => `${f.percent(p.memUsed / total)} · ${f.bytes(p.memUsed)}`}
                height={80}
              />
            </View>
          </>
        )}
      </Card>
    </Section>
  );
}

function Database({ report }: { report: ServerReport }) {
  const { database } = report;
  return (
    <Section
      title={t.database}
      footer={[database.version && `PostgreSQL ${database.version}`, f.bytes(database.bytes), t.connections(database.connections.active, database.connections.total)]
        .filter(Boolean)
        .join(" · ")}
    >
      {database.tables.map((table) => {
        const share = database.bytes ? table.bytes / database.bytes : 0;
        return (
          <ListGroup.Item key={table.name} disabled>
            <ListGroup.ItemContent className="gap-1.5">
              <View className="flex-row items-baseline gap-2">
                <ListGroup.ItemTitle className="flex-1" numberOfLines={1}>
                  {table.name}
                </ListGroup.ItemTitle>
                <Typography.Paragraph type="body-sm" className="tabular-nums">
                  {f.bytes(table.bytes)}
                </Typography.Paragraph>
              </View>
              <View className="flex-row items-center gap-2">
                <ShareBar share={share} />
                <Typography.Paragraph type="body-xs" color="muted" align="end" className="w-20 tabular-nums">
                  {table.rows > 0 ? f.whole(table.rows) : "—"}
                </Typography.Paragraph>
              </View>
            </ListGroup.ItemContent>
          </ListGroup.Item>
        );
      })}
    </Section>
  );
}
