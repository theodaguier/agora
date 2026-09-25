import type { CSSProperties } from "react";
import { CHART_COLORS, chartLabel, pieSlices, type ChartView } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { intlLocale, useLocale, useT } from "@/i18n";
import { numberFormat } from "@/lib/intl";

/** A value with its unit: "1,2 k", "82 %", "14 visiteurs". */
function useValue(unit?: string) {
  const locale = intlLocale(useLocale());
  const compact = numberFormat({ notation: "compact", maximumFractionDigits: 1 }, locale);
  const whole = numberFormat({ maximumFractionDigits: 2 }, locale);
  // "82 %" in French, "82%" in English.
  const withUnit = (s: string) => (!unit ? s : unit === "%" && !locale.startsWith("fr") ? `${s}%` : `${s} ${unit}`);
  return { axis: (n: number) => withUnit(compact.format(n)), exact: (n: number) => withUnit(whole.format(n)), locale };
}

/** A series' color square; outside the chart, its light and dark colors are given (the chart's variables stop at it). */
function Swatch({ color }: { color: string | { light: string; dark: string } }) {
  if (typeof color === "string") return <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />;
  const vars = { "--light": color.light, "--dark": color.dark } as CSSProperties;
  return <span className="size-2.5 shrink-0 rounded-[2px] bg-(--light) dark:bg-(--dark)" style={vars} />;
}

/** One row of the tooltip: the series' color, its name, its value. */
function TooltipRow({ color, name, value }: { color: string; name: string; value: string }) {
  return (
    <p className="flex items-center gap-2">
      <Swatch color={color} />
      <span className="min-w-0 truncate text-muted-foreground">{name}</span>
      <span className="ml-auto pl-3 font-mono tabular-nums">{value}</span>
    </p>
  );
}

const tooltipBox = "grid min-w-40 max-w-72 gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-xl";

/**
 * A chart shown by a bot (```view``` block, `"kind": "chart"`): bars, lines, areas or a pie, in the
 * data-viz palette's series colors, a tooltip on hover, a legend from two series on.
 */
export function ViewChart({ view }: { view: ChartView }) {
  const t = useT(integrations);
  const f = useValue(view.unit);
  if (view.chart === "pie") return <PieView view={view} rest={t.chartRest} />;

  const keys = view.series.map((_, i) => `s${i}`);
  const config = Object.fromEntries(view.series.map((s, i) => [keys[i], { label: s.name, theme: CHART_COLORS[i]! }])) satisfies ChartConfig;
  const data = view.labels.map((label, j) => ({ j, label, ...Object.fromEntries(view.series.map((s, i) => [keys[i], s.values[j]])) }));
  const several = view.series.length > 1;
  const stack = view.stacked ? "stack" : undefined;
  const tick = (l: string) => chartLabel(l, f.locale);

  const children = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={tick} />
      <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={f.axis} />
      <ChartTooltip
        cursor={view.chart === "bar" ? { fill: "var(--muted)", opacity: 0.5 } : true}
        content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const { j } = payload[0]!.payload as { j: number };
          return (
            <div className={tooltipBox}>
              <p className="font-medium">{tick(String(label))}</p>
              {view.series.map((s, i) => {
                const v = s.values[j];
                return v == null ? null : <TooltipRow key={keys[i]} color={`var(--color-${keys[i]})`} name={s.name} value={f.exact(v)} />;
              })}
            </div>
          );
        }}
      />
      {several && <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />}
    </>
  );

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full px-1 pt-2">
      {view.chart === "bar" ? (
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap="20%" barGap={2}>
          {children}
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={view.series[i]!.name}
              stackId={stack}
              fill={`var(--color-${k})`}
              stroke={stack ? "var(--secondary)" : undefined}
              strokeWidth={stack ? 1 : 0}
              maxBarSize={32}
              radius={!stack || i === keys.length - 1 ? [4, 4, 0, 0] : 0}
            />
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
              activeDot={{ r: 5, stroke: "var(--secondary)", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ChartContainer>
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
                <div className={tooltipBox}>
                  <TooltipRow color={`var(--color-${s.key})`} name={s.label} value={`${f.exact(s.value)} · ${share(s.value)}`} />
                </div>
              ) : null;
            }}
          />
          <Pie data={slices} dataKey="value" nameKey="label" innerRadius="55%" strokeWidth={2} stroke="var(--secondary)">
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
            <span className="ml-auto pl-3 tabular-nums text-muted-foreground">{share(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
