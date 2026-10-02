import { byteUnit, CHART_COLORS, durationParts, type ServerHistoryRange, type ServerReport } from "@agora/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ErrorText, Loading, SectionHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";
import { api } from "@/lib/api";

const messages = defineMessages({
  en: {
    title: "Server",
    intro: "The machine the instance runs on, and what it holds. Refreshed every 15 seconds.",
    loadError: "Server metrics could not be loaded.",
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
    historyIntro: "Kept in memory since the server started.",
    since: (d: string) => `Since ${d}`,
    noHistory: "The first point arrives within a minute of the server starting.",
    ranges: { "1h": "1 hour", "24h": "24 hours" } as Record<ServerHistoryRange, string>,
    period: "Period",
    series: { cpu: "Processor", mem: "Memory" },
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
    table: "Table",
    size: "Size",
    rows: "Rows",
    machine: "Machine",
    host: "Host",
    system: "System",
    runtime: "Runtime",
    version: "Version",
    appMemory: "App memory",
    duration: { d: (n: number) => `${n} d`, h: (n: number) => `${n} h`, m: (n: number) => `${n} min` },
  },
  fr: {
    title: "Serveur",
    intro: "La machine sur laquelle tourne l'instance, et ce qu'elle contient. Actualisé toutes les 15 secondes.",
    loadError: "Impossible de charger les métriques du serveur.",
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
    historyIntro: "Gardée en mémoire depuis le démarrage du serveur.",
    since: (d: string) => `Depuis ${d}`,
    noHistory: "Le premier point arrive dans la minute qui suit le démarrage du serveur.",
    ranges: { "1h": "1 heure", "24h": "24 heures" },
    period: "Période",
    series: { cpu: "Processeur", mem: "Mémoire" },
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
    table: "Table",
    size: "Taille",
    rows: "Lignes",
    machine: "Machine",
    host: "Hôte",
    system: "Système",
    runtime: "Environnement",
    version: "Version",
    appMemory: "Mémoire de l'app",
    duration: { d: (n: number) => `${n} j`, h: (n: number) => `${n} h`, m: (n: number) => `${n} min` },
  },
});

/** Categorical slots 1–2 of the data-viz palette, as in Usage. */
const colors = {
  cpu: { theme: CHART_COLORS[0] },
  mem: { theme: CHART_COLORS[1] },
  user: { theme: CHART_COLORS[0] },
  bot: { theme: CHART_COLORS[1] },
} satisfies ChartConfig;

function useFormat() {
  const t = useT(messages);
  const locale = intlLocale(useLocale());
  const whole = numberFormat(undefined, locale);
  const percent = numberFormat({ style: "percent", maximumFractionDigits: 0 }, locale);
  const decimal = numberFormat({ maximumFractionDigits: 2 }, locale);
  return {
    whole: (n: number) => whole.format(n),
    percent: (n: number) => percent.format(n),
    decimal: (n: number) => decimal.format(n),
    bytes: (n: number) => {
      const { value, unit } = byteUnit(n);
      return numberFormat({ style: "unit", unit, unitDisplay: "short", maximumFractionDigits: value < 10 ? 1 : 0 }, locale).format(value);
    },
    duration: (seconds: number) => {
      const { d, h, m } = durationParts(seconds);
      if (d) return [t.duration.d(d), h && t.duration.h(h)].filter(Boolean).join(" ");
      if (h) return [t.duration.h(h), m && t.duration.m(m)].filter(Boolean).join(" ");
      return t.duration.m(m);
    },
    time: (iso: string) => dateFormat({ hour: "2-digit", minute: "2-digit" }, locale).format(new Date(iso)),
    clock: (iso: string) => dateFormat({ timeStyle: "medium" }, locale).format(new Date(iso)),
    dateTime: (iso: string) => dateFormat({ dateStyle: "medium", timeStyle: "short" }, locale).format(new Date(iso)),
    day: (t: string) => {
      const [y, m, d] = t.split("-").map(Number);
      return dateFormat({ day: "numeric", month: "short" }, locale).format(new Date(y!, m! - 1, d));
    },
  };
}

export function Server() {
  const t = useT(messages);
  const [range, setRange] = useState<ServerHistoryRange>("1h");
  const f = useFormat();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin", "server", range],
    queryFn: () => api<ServerReport>(`/admin/server?range=${range}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />
      <div className="-mt-2 mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {isFetching ? t.refreshing : data ? t.updatedAt(f.clock(data.at)) : null}
        </p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          {t.refresh}
        </Button>
      </div>
      {isPending ? <Loading /> : isError ? <ErrorText error={new Error(t.loadError)} /> : <Report report={data} range={range} onRange={setRange} />}
    </>
  );
}

function Report({ report, range, onRange }: { report: ServerReport; range: ServerHistoryRange; onRange: (r: ServerHistoryRange) => void }) {
  const t = useT(messages);
  const f = useFormat();
  const { host, now, process, activity } = report;
  const disk = report.disks[0];

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Gauge
          label={t.cpu}
          value={now.cpu === null ? "—" : f.percent(now.cpu)}
          share={now.cpu}
          note={`${t.cores(host.cpuCount)} · ${t.load(host.loadavg.map(f.decimal).join(" "))}`}
        />
        <Gauge
          label={t.memory}
          value={f.percent(now.memory.used / now.memory.total)}
          share={now.memory.used / now.memory.total}
          note={now.memory.swap ? `${t.of(f.bytes(now.memory.used), f.bytes(now.memory.total))} · ${t.swap(f.bytes(now.memory.swap.used), f.bytes(now.memory.swap.total))}` : t.of(f.bytes(now.memory.used), f.bytes(now.memory.total))}
        />
        {disk && (
          <Gauge
            label={t.disk}
            value={f.percent((disk.total - disk.free) / disk.total)}
            share={(disk.total - disk.free) / disk.total}
            note={`${t.of(f.bytes(disk.total - disk.free), f.bytes(disk.total))} · ${t.free(f.bytes(disk.free))}`}
          />
        )}
        <Gauge label={t.uptime} value={f.duration(host.uptime)} note={t.appUptime(f.duration(process.uptime))} />
      </div>

      <LoadChart report={report} range={range} onRange={onRange} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Gauge label={t.online} value={f.whole(now.online)} />
        <Gauge label={t.working} value={f.whole(now.working)} />
        <Gauge label={t.queued} value={f.whole(activity.queuedTurns)} />
      </div>

      <ActivityChart report={report} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.activeUsers}</CardTitle>
            <CardDescription>{t.activeIntro}</CardDescription>
          </CardHeader>
          <CardContent>
            <Facts
              rows={(["day", "week", "month"] as const).map((p) => [t.periods[p], `${f.whole(activity.activeUsers[p])} / ${f.whole(activity.totals.users)}`])}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.content}</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts
              rows={[
                [t.totals.users, f.whole(activity.totals.users)],
                [t.totals.agents, f.whole(activity.totals.agents)],
                [t.totals.conversations, f.whole(activity.totals.conversations)],
                [t.totals.messages, f.whole(activity.totals.messages)],
                [t.totals.tasks, f.whole(activity.totals.tasks)],
                [t.totals.files, `${f.whole(activity.totals.files)} · ${f.bytes(activity.totals.filesBytes)}`],
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Database report={report} />

      <Card>
        <CardHeader>
          <CardTitle>{t.machine}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [t.host, host.hostname],
              [t.system, `${host.platform} ${host.release} (${host.arch})`],
              [t.cpu, `${host.cpuModel ?? "—"} · ${t.cores(host.cpuCount)}`],
              [t.runtime, process.runtime],
              [t.version, [`Agora ${process.app}`, `Hermes ${process.hermes}`, process.commit?.slice(0, 7)].filter(Boolean).join(" · ")],
              [t.appMemory, f.bytes(process.rss)],
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** A figure, and how full it is when it measures a capacity. */
function Gauge({ label, value, note, share }: { label: string; value: string; note?: string; share?: number | null }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {share != null && <Progress value={Math.round(share * 100)} aria-label={label} className="mt-1" />}
        {note && <CardDescription className="text-xs">{note}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 truncate text-right tabular-nums" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LoadChart({ report, range, onRange }: { report: ServerReport; range: ServerHistoryRange; onRange: (r: ServerHistoryRange) => void }) {
  const t = useT(messages);
  const f = useFormat();
  const total = report.now.memory.total;
  // Buckets before the server started have no sample: left out rather than drawn at 0.
  const data = report.history.points.filter((p) => p.n > 0).map((p) => ({ t: p.t, cpu: p.cpu, mem: p.memUsed / total }));
  const config = { cpu: { ...colors.cpu, label: t.series.cpu }, mem: { ...colors.mem, label: t.series.mem } } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.history}</CardTitle>
        <CardDescription>{report.history.since ? t.since(f.dateTime(report.history.since)) : t.historyIntro}</CardDescription>
        <CardAction>
          <ToggleGroup aria-label={t.period} value={[range]} onValueChange={(v) => v[0] && onRange(v[0] as ServerHistoryRange)} variant="outline" size="sm">
            {(Object.keys(t.ranges) as ServerHistoryRange[]).map((r) => (
              <ToggleGroupItem key={r} value={r}>
                {t.ranges[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t.noHistory}</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-56 w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={f.time} />
              <YAxis tickLine={false} axisLine={false} width={44} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={f.percent} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => f.time(String(payload[0]?.payload.t))}
                    formatter={(value, name) => (
                      <span className="flex w-full items-center gap-2">
                        <span className="text-muted-foreground">{config[name as keyof typeof config].label}</span>
                        <span className="ml-auto tabular-nums">{f.percent(Number(value))}</span>
                      </span>
                    )}
                  />
                }
              />
              {(["mem", "cpu"] as const).map((k) => (
                <Area key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} fill={`var(--color-${k})`} fillOpacity={0.12} isAnimationActive={false} />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityChart({ report }: { report: ServerReport }) {
  const t = useT(messages);
  const f = useFormat();
  const config = { user: { ...colors.user, label: t.kinds.user }, bot: { ...colors.bot, label: t.kinds.bot } } satisfies ChartConfig;
  const kinds = ["user", "bot"] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.activity}</CardTitle>
        <CardDescription>{t.activityIntro}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart data={report.activity.messagesPerDay} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={f.day} />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={f.whole} />
            <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent labelFormatter={(v) => f.day(String(v))} />} />
            {kinds.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="messages"
                fill={`var(--color-${k})`}
                stroke="var(--background)"
                strokeWidth={1}
                maxBarSize={24}
                radius={i === kinds.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function Database({ report }: { report: ServerReport }) {
  const t = useT(messages);
  const f = useFormat();
  const { database } = report;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.database}</CardTitle>
        <CardDescription>
          {[database.version && `PostgreSQL ${database.version}`, f.bytes(database.bytes), t.connections(database.connections.active, database.connections.total)]
            .filter(Boolean)
            .join(" · ")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.table}</TableHead>
                <TableHead className="text-right">{t.rows}</TableHead>
                <TableHead className="w-40">{t.size}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {database.tables.map((table) => {
                const share = database.bytes ? table.bytes / database.bytes : 0;
                return (
                  <TableRow key={table.name}>
                    <TableCell className="font-mono text-xs">{table.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{table.rows > 0 ? f.whole(table.rows) : "—"}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
                        </span>
                        <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{f.bytes(table.bytes)}</span>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
