import { byteUnit, CHART_COLORS, durationParts, type ServerHistoryRange, type ServerReport } from "@agora/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Label, PolarAngleAxis, PolarRadiusAxis, RadialBar, RadialBarChart, XAxis, YAxis } from "recharts";
import { LoadFailed, Loading, SectionHeader } from "@/components/admin/ui";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";
import { api } from "@/lib/api";

const messages = defineMessages({
  en: {
    title: "Server",
    intro: "The machine the instance runs on, and what it holds.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    updatedAt: (time: string) => `Updated at ${time}, every 15 seconds.`,
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
    working: "Active bots",
    queued: "Queued replies",
    activity: "Activity",
    activityIntro: "Messages per day, over the last 30 days.",
    kinds: { user: "Members", bot: "Bots" },
    activeUsers: "Members active this week",
    activeIntro: "Members who wrote at least one message.",
    periods: { day: "24 hours", week: "7 days", month: "30 days" },
    content: "Content",
    totals: { users: "Members", agents: "Bots", conversations: "Conversations", messages: "Messages", tasks: "Tasks", files: "Files" },
    database: "Database",
    connections: (active: number, total: number) => `${active} active connection${active === 1 ? "" : "s"} out of ${total}`,
    table: "Table",
    size: "Size",
    rows: "Rows",
    rowCount: (n: string) => `${n} rows`,
    noRows: "Empty",
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
    intro: "La machine sur laquelle tourne l'instance, et ce qu'elle contient.",
    refresh: "Actualiser",
    refreshing: "Actualisation…",
    updatedAt: (time: string) => `Actualisé à ${time}, toutes les 15 secondes.`,
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
    working: "Bots actifs",
    queued: "En attente",
    activity: "Activité",
    activityIntro: "Messages par jour, sur les 30 derniers jours.",
    kinds: { user: "Membres", bot: "Bots" },
    activeUsers: "Membres actifs cette semaine",
    activeIntro: "Membres ayant écrit au moins un message.",
    periods: { day: "24 heures", week: "7 jours", month: "30 jours" },
    content: "Contenu",
    totals: { users: "Membres", agents: "Bots", conversations: "Conversations", messages: "Messages", tasks: "Tâches", files: "Fichiers" },
    database: "Base de données",
    connections: (active: number, total: number) => `${active} connexion${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""} sur ${total}`,
    table: "Table",
    size: "Taille",
    rows: "Lignes",
    rowCount: (n: string) => `${n} lignes`,
    noRows: "Vide",
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
  const { data, isPending, error, isFetching, refetch } = useQuery({
    queryKey: ["admin", "server", range],
    queryFn: () => api<ServerReport>(`/admin/server?range=${range}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  return (
    <>
      <SectionHeader title={t.title} />
      {data ? <Report report={data} range={range} onRange={setRange} /> : isPending ? <Loading /> : <LoadFailed error={error} onRetry={() => void refetch()} />}
    </>
  );
}

function Report({ report, range, onRange }: { report: ServerReport; range: ServerHistoryRange; onRange: (r: ServerHistoryRange) => void }) {
  const t = useT(messages);
  const f = useFormat();
  const { host, now, process, activity } = report;
  const disk = report.disks[0];

  return (
    <>
      {/* What the machine and the team are doing right now, in one card: capacities, then live activity. */}
      <Card>
        <CardContent className="flex flex-col gap-6">
          {/* Capacities as rings, how full each one is at a glance. */}
          <div className="grid gap-6 sm:grid-cols-3">
            <Ring label={t.cpu} share={now.cpu} value={now.cpu === null ? "—" : f.percent(now.cpu)} color={CHART_COLORS[0]!} />
            <Ring
              label={t.memory}
              share={now.memory.used / now.memory.total}
              value={f.percent(now.memory.used / now.memory.total)}
              note={t.of(f.bytes(now.memory.used), f.bytes(now.memory.total))}
              color={CHART_COLORS[1]!}
            />
            {disk && (
              <Ring
                label={t.disk}
                share={(disk.total - disk.free) / disk.total}
                value={f.percent((disk.total - disk.free) / disk.total)}
                note={t.free(f.bytes(disk.free))}
                color={CHART_COLORS[2]!}
              />
            )}
          </div>
          <Separator />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t.uptime} value={f.duration(host.uptime)} />
            <Stat label={t.online} value={f.whole(now.online)} />
            <Stat label={t.working} value={f.whole(now.working)} />
            <Stat label={t.queued} value={f.whole(activity.queuedTurns)} />
          </div>
        </CardContent>
      </Card>

      <LoadChart report={report} range={range} onRange={onRange} />

      <ActivityChart report={report} />

      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.content}</CardTitle>
        </ListCardHeader>
        <Facts
          rows={[
            [t.activeUsers, `${f.whole(activity.activeUsers.week)} / ${f.whole(activity.totals.users)}`],
            [t.totals.agents, f.whole(activity.totals.agents)],
            [t.totals.conversations, f.whole(activity.totals.conversations)],
            [t.totals.messages, f.whole(activity.totals.messages)],
            [t.totals.tasks, f.whole(activity.totals.tasks)],
            [t.totals.files, `${f.whole(activity.totals.files)}, ${f.bytes(activity.totals.filesBytes)}`],
          ]}
        />
      </ListCard>

      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.machine}</CardTitle>
        </ListCardHeader>
        <Facts
          rows={[
            [t.host, host.hostname],
            [t.system, `${host.platform} ${host.release} (${host.arch})`],
            [t.cpu, `${host.cpuModel ?? "—"}, ${t.cores(host.cpuCount)}`],
            [t.database, [report.database.version && `PostgreSQL ${report.database.version}`, f.bytes(report.database.bytes)].filter(Boolean).join(", ")],
            [t.version, [`Agora ${process.app}`, `Hermes ${process.hermes}`, process.commit?.slice(0, 7)].filter(Boolean).join(", ")],
            [t.appMemory, f.bytes(process.rss)],
          ]}
        />
      </ListCard>
    </>
  );
}

/** A figure. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold whitespace-nowrap tabular-nums">{value}</p>
    </div>
  );
}

/** A capacity as a ring (shadcn's radial chart): filled to its share, the figure in the middle. */
function Ring({ label, share, value, note, color }: { label: string; share: number | null; value: string; note?: string; color: (typeof CHART_COLORS)[number] }) {
  const config = { v: { label, theme: color } } satisfies ChartConfig;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <ChartContainer config={config} className="aspect-square h-32">
        <RadialBarChart data={[{ v: Math.round((share ?? 0) * 100) }]} startAngle={90} endAngle={-270} innerRadius="78%" outerRadius="100%">
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="v" background={{ fill: "var(--muted)" }} cornerRadius={8} fill="var(--color-v)" isAnimationActive={false} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-xl font-semibold tabular-nums">
                    {value}
                  </text>
                ) : null
              }
            />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
      <p className="text-sm font-medium">{label}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** A label and its value per row, as the rows of a ListCard. */
function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <ListCardRows>
      {rows.map(([k, v]) => (
        <Item size="xs" key={k} role="listitem">
          <ItemContent>
            <ItemTitle>{k}</ItemTitle>
          </ItemContent>
          <ItemActions className="min-w-0">
            <span className="truncate text-muted-foreground tabular-nums" title={v}>
              {v}
            </span>
          </ItemActions>
        </Item>
      ))}
    </ListCardRows>
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
          <p className="text-sm text-muted-foreground">{t.noHistory}</p>
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
