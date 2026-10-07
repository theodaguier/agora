import type { CSSProperties } from "react";
import { barRows, CHART_COLORS, chartLabel, funnelSteps, pieSlices, unitOnTicks, withUnit, type ChartView, type StatsView } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipPanel, ChartTooltipRow, type ChartConfig } from "@/components/ui/chart";
import { intlLocale, useLocale, useT } from "@/i18n";
import { numberFormat } from "@/lib/intl";
import { cn } from "@/lib/utils";

/**
 * A value with its unit: "1,2 k", "82 %", "14 visiteurs". On the scale, a long unit is left out
 * of the ticks ("20", not "20 personnes") and written once above it (`caption`).
 */
function useValue(unit?: string) {
  const locale = intlLocale(useLocale());
  const compact = numberFormat({ notation: "compact", maximumFractionDigits: 1 }, locale);
  const whole = numberFormat({ maximumFractionDigits: 2 }, locale);
  const ticks = unitOnTicks(unit);
  return {
    axis: (n: number) => (ticks ? withUnit(compact.format(n), unit, locale, n) : compact.format(n)),
    exact: (n: number) => withUnit(whole.format(n), unit, locale, n),
    short: (n: number) => compact.format(n),
    caption: unit && !ticks ? unit : undefined,
    locale,
  };
}

/** The unit written once above the scale, when it's too long for each tick. */
const Caption = ({ unit }: { unit?: string }) => (unit ? <p className="px-2 pt-2 text-xs text-muted-foreground">{unit}</p> : null);

/** A series' color square; outside the chart, its light and dark colors are given (the chart's variables stop at it). */
function Swatch({ color }: { color: string | { light: string; dark: string } }) {
  if (typeof color === "string") return <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />;
  const vars = { "--light": color.light, "--dark": color.dark } as CSSProperties;
  return <span className="size-2.5 shrink-0 rounded-[2px] bg-(--light) dark:bg-(--dark)" style={vars} />;
}

/**
 * A chart shown by a bot (```view``` block, `"kind": "chart"`): bars, lines, areas or a pie, in the
 * data-viz palette's series colors, a tooltip on hover, a legend from two series on.
 */
export function ViewChart({ view }: { view: ChartView }) {
  const t = useT(integrations);
  const f = useValue(view.unit);
  if (view.chart === "pie") return <PieView view={view} rest={t.chartRest} />;
  if (barRows(view)) return <BarRows view={view} />;

  const keys = view.series.map((_, i) => `s${i}`);
  const config = Object.fromEntries(view.series.map((s, i) => [keys[i], { label: s.name, theme: CHART_COLORS[i]! }])) satisfies ChartConfig;
  const data = view.labels.map((label, j) => ({ j, label, ...Object.fromEntries(view.series.map((s, i) => [keys[i], s.values[j]])) }));
  const several = view.series.length > 1;
  const stack = view.stacked ? "stack" : undefined;
  const tick = (l: string) => chartLabel(l, f.locale);
  // The scale takes the room of its longest tick, no more: a fixed width cut "20 personnes" to "ersonnes".
  const top = Math.max(0, ...data.flatMap((d) => keys.map((k) => Number(d[k as keyof typeof d]) || 0)));
  const scale = Math.max(24, f.axis(top).length * 7 + 8);
  // With a few bars of a single series, each one's value is written on it, a 0 included.
  const values = view.chart === "bar" && !several && view.labels.length <= 12;
  // A single series of bars: gray, the highest one in the primary color.
  const single = view.chart === "bar" && !several;
  const highest = single ? Math.max(...view.series[0]!.values.map((v) => v ?? -Infinity)) : null;
  const isHighest = (j: number) => single && view.series[0]!.values[j] === highest;

  const children = (
    <>
      {/* Each bar's value written on it: the scale and its lines would only repeat it. */}
      {!values && <CartesianGrid vertical={false} />}
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={tick} />
      {!values && <YAxis tickLine={false} axisLine={false} width={scale} tickFormatter={f.axis} />}
      <ChartTooltip
        cursor={view.chart === "bar" ? { fill: "var(--muted)", opacity: 0.5 } : true}
        content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const { j } = payload[0]!.payload as { j: number };
          return (
            <ChartTooltipPanel title={tick(String(label))}>
              {view.series.map((s, i) => {
                const v = s.values[j];
                return v == null ? null : <ChartTooltipRow key={keys[i]} color={`var(--color-${keys[i]})`} name={s.name} value={f.exact(v)} />;
              })}
            </ChartTooltipPanel>
          );
        }}
      />
      {several && <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />}
    </>
  );

  return (
    <>
      <Caption unit={f.caption} />
      <ChartContainer config={config} className="aspect-auto h-64 w-full px-1 pt-2">
        {view.chart === "bar" ? (
          <BarChart data={data} margin={{ left: 4, right: 4, top: values ? 24 : 8 }} barCategoryGap="20%" barGap={2}>
            {children}
            {keys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                name={view.series[i]!.name}
                stackId={stack}
                fill={`var(--color-${k})`}
                stroke={stack ? "var(--background)" : undefined}
                strokeWidth={stack ? 1 : 0}
                maxBarSize={single ? 40 : 32}
                radius={!stack || i === keys.length - 1 ? [6, 6, 0, 0] : 0}
              >
                {single && data.map((d) => <Cell key={d.j} fill={isHighest(d.j) ? "var(--primary)" : "var(--chart-5)"} />)}
                {values && (
                  <LabelList
                    dataKey={k}
                    position="top"
                    offset={6}
                    content={({ x, y, width, value, index }) =>
                      typeof value === "number" ? (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) - 6}
                          textAnchor="middle"
                          className={cn("text-xs tabular-nums", isHighest(Number(index)) ? "fill-foreground font-medium" : "fill-muted-foreground")}
                        >
                          {f.short(value)}
                        </text>
                      ) : null
                    }
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        ) : view.chart === "area" ? (
          <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
            {children}
            {keys.map((k, i) => (
              <Area
                key={k}
                dataKey={k}
                name={view.series[i]!.name}
                type="monotone"
                stackId={stack}
                stroke={`var(--color-${k})`}
                strokeWidth={2}
                fill={`var(--color-${k})`}
                fillOpacity={stack ? 0.5 : 0.15}
                connectNulls
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
            {children}
            {keys.map((k, i) => (
              <Line
                key={k}
                dataKey={k}
                name={view.series[i]!.name}
                type="monotone"
                stroke={`var(--color-${k})`}
                strokeWidth={2}
                dot={view.labels.length <= 12 ? { r: 4 } : false}
                activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
    </>
  );
}

/**
 * Bars lying down, one row per label with its name and values written out (barRows): a funnel, where
 * each step also says its share of the first one and how many went on from the one before (the
 * biggest loss in red), or bars with long names. Several series: a bar each, in its color, under the name.
 */
function BarRows({ view }: { view: ChartView }) {
  const t = useT(integrations);
  const f = useValue(view.unit);
  const percent = numberFormat({ style: "percent", maximumFractionDigits: 0 }, f.locale);
  const funnel = view.chart === "funnel";
  const several = view.series.length > 1;
  const series = view.series.map((s, i) => ({
    name: s.name,
    color: CHART_COLORS[i]!,
    steps: funnel ? funnelSteps(view, i) : view.labels.map((label, j) => ({ label, value: s.values[j] ?? 0, ofFirst: 0, kept: null as number | null, worst: false })),
  }));
  const max = Math.max(0, ...series.flatMap((s) => s.steps.map((st) => st.value))) || 1;
  const figure = (st: (typeof series)[number]["steps"][number], j: number) => (
    <span className="shrink-0 tabular-nums">
      {f.exact(st.value)}
      {funnel && j > 0 && <span className="text-muted-foreground"> · {t.ofStart(percent.format(st.ofFirst))}</span>}
    </span>
  );
  const bar = (s: (typeof series)[number], j: number) => {
    const fill = { "--light": s.color.light, "--dark": s.color.dark, width: `${(s.steps[j]!.value / max) * 100}%` } as CSSProperties;
    return (
      <div className="h-2 w-full min-w-0 shrink-0 overflow-hidden rounded-full bg-muted sm:w-auto sm:flex-1">
        <div className="h-full rounded-full bg-(--light) dark:bg-(--dark)" style={fill} />
      </div>
    );
  };
  return (
    <div className="grid gap-3 px-2 pb-1 pt-2">
      {several && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Swatch color={s.color} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <ol className="grid gap-3">
        {view.labels.map((label, j) => (
          <li key={j} className="grid gap-1">
            {funnel && j > 0 && (
              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {series.map((s, i) => {
                  const st = s.steps[j]!;
                  const before = s.steps[j - 1]!.value;
                  const lost = Math.max(0, before - st.value);
                  return st.kept === null ? null : (
                    <span key={i} className={cn("flex items-center gap-1.5", st.worst && "font-medium text-destructive")}>
                      {several && <Swatch color={s.color} />}
                      {lost ? t.funnelLost(f.exact(lost), percent.format(lost / before)) : t.funnelNone}
                    </span>
                  );
                })}
              </p>
            )}
            <div className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={label}>
                {chartLabel(label, f.locale)}
              </span>
              {!several && figure(series[0]!.steps[j]!, j)}
            </div>
            {several ? (
              series.map((s, i) => (
                // Narrow, the figures go above the bar, which keeps the full width so the bars still compare.
                <div key={i} className="flex flex-col-reverse gap-0.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                  {bar(s, j)}
                  <span className="truncate sm:w-44 sm:text-right">{figure(s.steps[j]!, j)}</span>
                </div>
              ))
            ) : (
              <div className="flex">{bar(series[0]!, j)}</div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Key figures shown by a bot (```view``` block, `"kind": "stats"`): side by side, two to three a row,
 * a line between each, no tiles.
 */
export function ViewStats({ view }: { view: StatsView }) {
  const locale = intlLocale(useLocale());
  const whole = numberFormat({ maximumFractionDigits: 2 }, locale);
  const value = (s: StatsView["stats"][number]) =>
    typeof s.value === "number" ? withUnit(whole.format(s.value), s.unit, locale, s.value) : withUnit(s.value, s.unit, locale);
  const n = view.stats.length;
  const cols = n <= 3 ? n : n % 3 === 0 ? 3 : 2;
  return (
    <div className="grid gap-y-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {view.stats.map((s, i) => (
        <div key={i} className={cn("flex min-w-0 flex-col gap-1", i % cols === 0 ? "pr-4" : "border-l px-4")}>
          <p className="line-clamp-2 text-[13px] text-muted-foreground" title={s.label}>
            {s.label}
          </p>
          <p className="truncate text-[28px] leading-tight font-semibold tabular-nums">{value(s)}</p>
          {s.note && <p className="text-xs text-subtle">{s.note}</p>}
        </div>
      ))}
    </div>
  );
}

/** A pie (a ring): the largest slices, the rest gathered into one; a legend with each share. */
function PieView({ view, rest }: { view: ChartView; rest: string }) {
  const f = useValue(view.unit);
  const slices = pieSlices(view, rest).map((s, i) => ({ ...s, key: `p${i}` }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, theme: s.color }])) satisfies ChartConfig;
  const share = (v: number) => numberFormat({ style: "percent", maximumFractionDigits: 1 }, f.locale).format(total ? v / total : 0);
  return (
    <div className="flex flex-col items-center gap-3 px-1 pt-2 sm:flex-row">
      <ChartContainer config={config} className="aspect-square h-48 shrink-0">
        <PieChart>
          <ChartTooltip
            content={({ active, payload }) => {
              const s = active ? (payload?.[0]?.payload as (typeof slices)[number] | undefined) : undefined;
              return s ? (
                <ChartTooltipPanel>
                  <ChartTooltipRow color={`var(--color-${s.key})`} name={s.label} value={`${f.exact(s.value)} · ${share(s.value)}`} />
                </ChartTooltipPanel>
              ) : null;
            }}
          />
          <Pie data={slices} dataKey="value" nameKey="label" innerRadius="55%" strokeWidth={2} stroke="var(--background)">
            {slices.map((s) => (
              <Cell key={s.key} fill={`var(--color-${s.key})`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid w-full min-w-0 gap-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <Swatch color={s.color} />
            <span className="min-w-0 truncate">{s.label}</span>
            <span className="ml-auto pl-3 tabular-nums">
              {f.exact(s.value)} <span className="text-muted-foreground">· {share(s.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
