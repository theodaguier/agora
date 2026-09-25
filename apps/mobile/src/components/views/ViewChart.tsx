import { barRows, CHART_COLORS, chartLabel, funnelSteps, pieSlices, unitOnTicks, withUnit as unitValue, type ChartView, type StatsView } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { PressableFeedback, Surface, Typography, useThemeColor } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { useUniwind } from "uniwind";
import { locale, tr } from "@/lib/i18n";
import { numberFormat } from "@/lib/intl";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/views/ViewChart.tsx. The web draws with recharts; HeroUI Native has no
 * chart, so marks are react-native-svg, texts are Typography, and a tap on the plot reads a point
 * (the web's tooltip), as in profile/bars.tsx.
 */

const HEIGHT = 168;
/** Room above the top for the lines' dots. */
const PAD = 5;
/** The scale's column, and the same room before the axis labels. */
const SCALE = "w-12";

const compact = numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
const exact = numberFormat(locale, { maximumFractionDigits: 2 });
const percent = numberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
const whole = numberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

/** "82 %" in French, "82%" in English, "1 personne" (core's withUnit). */
const withUnit = (s: string, unit?: string, n?: number) => unitValue(s, unit, locale, n);
const label = (l: string) => chartLabel(l, locale);

/** A bar with its top corners rounded (4px, the data end), anchored on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
}

function Swatch({ color }: { color: string }) {
  return <View className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />;
}

/**
 * A chart shown by a bot (```view``` block, `"kind": "chart"`): bars, lines, areas or a pie, in the
 * data-viz palette's series colors (the web's), a legend from two series on.
 */
export function ViewChart({ view }: { view: ChartView }) {
  const dark = useUniwind().theme === "dark";
  if (view.chart === "pie") return <PieView view={view} dark={dark} />;
  if (barRows(view)) return <BarRows view={view} dark={dark} />;
  return <CartesianView view={view} dark={dark} />;
}

function CartesianView({ view, dark }: { view: ChartView; dark: boolean }) {
  const [grid, surface, ink] = useThemeColor(["separator", "surface", "foreground"]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const colors = view.series.map((_, i) => CHART_COLORS[i]![dark ? "dark" : "light"]);
  const n = view.labels.length;
  const stacked = !!view.stacked && view.chart !== "line";
  // With a few bars of a single series, each one's value is written above it, a 0 included (the web's).
  const values = view.chart === "bar" && view.series.length === 1 && n <= 12;
  const top = values ? 18 : PAD;
  const bottom = HEIGHT + top;

  // Stacked: each series sits on the ones before it.
  const tops = view.labels.map((_, j) => {
    let sum = 0;
    return view.series.map((s) => (stacked ? (sum += s.values[j] ?? 0) : (s.values[j] ?? 0)));
  });
  const max = Math.max(0, ...tops.flat()) || 1;
  const y = (v: number) => top + (1 - v / max) * HEIGHT;
  const step = width / Math.max(n, 1);
  const x = (j: number) => step * j + step / 2;
  const dim = (j: number) => (selected === null || selected === j ? 1 : 0.4);

  const bars = () => {
    const group = step * 0.8;
    const gap = 2;
    const barW = stacked ? group : (group - gap * (view.series.length - 1)) / view.series.length;
    return view.labels.flatMap((_, j) =>
      view.series.map((s, i) => {
        const v = s.values[j];
        if (v == null || v <= 0) return null;
        const left = step * j + step * 0.1 + (stacked ? 0 : i * (barW + gap));
        // Only the top of a stack is rounded; the segments are split by a 1px gap of the card's surface.
        const last = !stacked || view.series.slice(i + 1).every((t) => !t.values[j]);
        return (
          <Path
            key={`${i}-${j}`}
            d={barPath(left, y(tops[j]![i]!), barW, (v / max) * HEIGHT, last ? 4 : 0)}
            fill={colors[i]}
            stroke={stacked ? surface : undefined}
            strokeWidth={stacked ? 1 : 0}
            opacity={dim(j)}
          />
        );
      }),
    );
  };

  const labels = () =>
    view.series[0]!.values.map((v, j) =>
      v == null ? null : (
        <SvgText key={j} x={x(j)} y={y(Math.max(v, 0)) - 6} fontSize={11} fill={ink} textAnchor="middle" opacity={dim(j)}>
          {compact.format(v)}
        </SvgText>
      ),
    );

  // Lines and areas: a gap in the data breaks the line.
  const lines = () =>
    view.series.map((s, i) => {
      const runs: number[][] = [];
      let run: number[] = [];
      s.values.forEach((v, j) => {
        if (v != null) return run.push(j);
        if (run.length) runs.push(run);
        run = [];
      });
      if (run.length) runs.push(run);
      const top = (j: number) => y(tops[j]![i]!);
      // A stacked area fills down to the series below it, otherwise down to the baseline.
      const base = (j: number) => (stacked && i > 0 ? y(tops[j]![i - 1]!) : bottom);
      const path = (js: number[], at: (j: number) => number, first = "M") => js.map((j, k) => `${k ? "L" : first}${x(j)},${at(j)}`).join("");
      const line = runs.map((r) => path(r, top)).join("");
      const area = runs.map((r) => `${path(r, top)}${path(r.slice().reverse(), base, "L")}Z`).join("");
      return (
        <G key={i}>
          {view.chart === "area" && <Path d={area} fill={colors[i]} fillOpacity={stacked ? 0.5 : 0.15} />}
          <Path d={line} stroke={colors[i]} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {runs.flat().map((j) =>
            n <= 12 || selected === j ? <Circle key={j} cx={x(j)} cy={top(j)} r={selected === j ? 5 : 4} fill={colors[i]} stroke={surface} strokeWidth={2} /> : null,
          )}
        </G>
      );
    });

  const shown = selected !== null && selected < n ? selected : null;
  const detail =
    shown === null
      ? " "
      : [
          label(view.labels[shown]!),
          ...view.series.flatMap((s) => {
            const v = s.values[shown];
            return v == null ? [] : [`${view.series.length > 1 ? `${s.name} ` : ""}${withUnit(exact.format(v), view.unit, v)}`];
          }),
        ].join(" · ");
  const ticks = new Set([0, Math.floor((n - 1) / 2), n - 1]);

  return (
    <View className="gap-2">
      {view.series.length > 1 && (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          {view.series.map((s, i) => (
            <View key={i} className="flex-row items-center gap-1.5">
              <Swatch color={colors[i]!} />
              <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
                {s.name}
              </Typography.Paragraph>
            </View>
          ))}
        </View>
      )}
      <Typography.Paragraph type="body-sm" color="muted" className="tabular-nums" numberOfLines={2}>
        {detail}
      </Typography.Paragraph>
      {/* A long unit is written once, above the scale, rather than cut on its tick. */}
      {!!view.unit && !unitOnTicks(view.unit) && (
        <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
          {view.unit}
        </Typography.Paragraph>
      )}
      <View className="flex-row gap-2">
        {/* The scale: its top and its baseline. */}
        <View className={cn(SCALE, "justify-between")} style={{ height: bottom, paddingTop: top - PAD }}>
          <Typography.Paragraph type="body-xs" color="muted" className="tabular-nums" numberOfLines={1}>
            {unitOnTicks(view.unit) ? withUnit(compact.format(max), view.unit, max) : compact.format(max)}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted" className="tabular-nums" numberOfLines={1}>
            0
          </Typography.Paragraph>
        </View>
        <PressableFeedback
          accessibilityRole="button"
          accessibilityLabel={view.title}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            if (!n) return;
            const j = Math.min(n - 1, Math.max(0, Math.floor(e.nativeEvent.locationX / step)));
            Haptics.selectionAsync();
            setSelected(selected === j ? null : j);
          }}
          className="flex-1"
          style={{ height: bottom }}
        >
          {width > 0 && (
            <Svg width={width} height={bottom} pointerEvents="none">
              {[top, top + HEIGHT / 2, bottom].map((gy) => (
                <Line key={gy} x1={0} x2={width} y1={gy} y2={gy} stroke={grid} strokeWidth={1} />
              ))}
              {shown !== null && view.chart !== "bar" && <Line x1={x(shown)} x2={x(shown)} y1={top} y2={bottom} stroke={grid} strokeWidth={1} />}
              {view.chart === "bar" ? bars() : lines()}
              {values && labels()}
            </Svg>
          )}
        </PressableFeedback>
      </View>
      {/* A few labels under the axis: first, middle, last. */}
      <View className="h-5 flex-row gap-2">
        <View className={SCALE} />
        <View className="flex-1 flex-row">
          {view.labels.map((l, j) => (
            <View key={j} className="flex-1 items-center overflow-visible">
              {ticks.has(j) && (
                <Typography.Paragraph type="body-xs" color="muted" align="center" className="w-20" numberOfLines={1}>
                  {label(l)}
                </Typography.Paragraph>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** A slice of a ring, from angle a to b (radians, clockwise from the top). */
function arc(cx: number, cy: number, r: number, inner: number, a: number, b: number) {
  const p = (rad: number, ang: number) => `${cx + rad * Math.sin(ang)},${cy - rad * Math.cos(ang)}`;
  const large = b - a > Math.PI ? 1 : 0;
  return `M${p(r, a)}A${r},${r} 0 ${large} 1 ${p(r, b)}L${p(inner, b)}A${inner},${inner} 0 ${large} 0 ${p(inner, a)}Z`;
}

/** A ring: the largest slices, the rest gathered into one; beside it, each slice's share (the web's legend). */
function PieView({ view, dark }: { view: ChartView; dark: boolean }) {
  const surface = useThemeColor("surface");
  const slices = pieSlices(view, tr(integrations).chartRest);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 128;
  const c = size / 2;
  let at = 0;
  return (
    <View className="flex-row items-center gap-4">
      <Svg width={size} height={size}>
        {slices.length === 1 ? (
          <>
            <Circle cx={c} cy={c} r={c} fill={slices[0]!.color[dark ? "dark" : "light"]} />
            <Circle cx={c} cy={c} r={c * 0.55} fill={surface} />
          </>
        ) : (
          slices.map((s, i) => {
            const a = at;
            at += (s.value / total) * Math.PI * 2;
            return <Path key={i} d={arc(c, c, c, c * 0.55, a, at)} fill={s.color[dark ? "dark" : "light"]} stroke={surface} strokeWidth={2} />;
          })
        )}
      </Svg>
      <View className="min-w-0 flex-1 gap-1.5">
        {slices.map((s, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <Swatch color={s.color[dark ? "dark" : "light"]} />
            <Typography.Paragraph type="body-sm" numberOfLines={1} className="min-w-0 flex-1">
              {s.label}
            </Typography.Paragraph>
            <Typography.Paragraph type="body-sm" color="muted" className="tabular-nums">
              {`${withUnit(exact.format(s.value), view.unit, s.value)} · ${percent.format(total ? s.value / total : 0)}`}
            </Typography.Paragraph>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Bars lying down, one row per label with its name and values written out (barRows): a funnel, where
 * each step also says its share of the first one and how many went on from the one before (the
 * biggest loss in red), or bars with long names. Several series: a bar each, under the name. The web's BarRows.
 */
function BarRows({ view, dark }: { view: ChartView; dark: boolean }) {
  const t = tr(integrations);
  const funnel = view.chart === "funnel";
  const several = view.series.length > 1;
  const series = view.series.map((s, i) => ({
    name: s.name,
    color: CHART_COLORS[i]![dark ? "dark" : "light"],
    steps: funnel ? funnelSteps(view, i) : view.labels.map((l, j) => ({ label: l, value: s.values[j] ?? 0, ofFirst: 0, kept: null as number | null, worst: false })),
  }));
  const max = Math.max(0, ...series.flatMap((s) => s.steps.map((st) => st.value))) || 1;
  const figure = (st: (typeof series)[number]["steps"][number], j: number, type: "body-sm" | "body-xs") => (
    <Typography.Paragraph type={type} className="tabular-nums">
      {withUnit(exact.format(st.value), view.unit, st.value)}
      {funnel && j > 0 && (
        <Typography.Paragraph type={type} color="muted">
          {` · ${t.ofStart(whole.format(st.ofFirst))}`}
        </Typography.Paragraph>
      )}
    </Typography.Paragraph>
  );
  const bar = (s: (typeof series)[number], j: number) => (
    <Surface variant="tertiary" className="h-2 flex-1 overflow-hidden rounded-full p-0">
      <View className="h-full rounded-full" style={{ width: `${(s.steps[j]!.value / max) * 100}%`, backgroundColor: s.color }} />
    </Surface>
  );
  return (
    <View className="gap-3">
      {several && (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1">
          {series.map((s, i) => (
            <View key={i} className="flex-row items-center gap-1.5">
              <Swatch color={s.color} />
              <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
                {s.name}
              </Typography.Paragraph>
            </View>
          ))}
        </View>
      )}
      <View className="gap-4">
        {view.labels.map((l, j) => (
          <View key={j} className="gap-1">
            {funnel && j > 0 && (
              <View className="flex-row flex-wrap gap-x-3">
                {series.map((s, i) => {
                  const st = s.steps[j]!;
                  const before = s.steps[j - 1]!.value;
                  const lost = Math.max(0, before - st.value);
                  return st.kept === null ? null : (
                    <View key={i} className="flex-row items-center gap-1.5">
                      {several && <Swatch color={s.color} />}
                      <Typography.Paragraph type="body-xs" color="muted" className={cn(st.worst && "font-medium text-danger")}>
                        {lost ? t.funnelLost(withUnit(exact.format(lost), view.unit, lost), whole.format(lost / before)) : t.funnelNone}
                      </Typography.Paragraph>
                    </View>
                  );
                })}
              </View>
            )}
            <View className="flex-row items-baseline gap-3">
              <Typography.Paragraph type="body-sm" numberOfLines={1} className="min-w-0 flex-1">
                {label(l)}
              </Typography.Paragraph>
              {!several && figure(series[0]!.steps[j]!, j, "body-sm")}
            </View>
            {several ? (
              series.map((s, i) => (
                // The figures above the bar, not beside it: the bars keep the full width, so they compare.
                <View key={i} className="gap-1">
                  {figure(s.steps[j]!, j, "body-xs")}
                  <View className="flex-row">{bar(s, j)}</View>
                </View>
              ))
            ) : (
              <View className="flex-row">{bar(series[0]!, j)}</View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Key figures shown by a bot (```view``` block, `"kind": "stats"`): two a row. The web's ViewStats. */
export function ViewStats({ view }: { view: StatsView }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {view.stats.map((s, i) => (
        <Surface key={i} variant="secondary" className="min-w-[45%] flex-1 gap-1 p-3">
          <Typography.Paragraph type="body-xs" color="muted" numberOfLines={2}>
            {s.label}
          </Typography.Paragraph>
          <Typography.Heading type="h3" className="tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
            {typeof s.value === "number" ? withUnit(exact.format(s.value), s.unit, s.value) : withUnit(s.value, s.unit)}
          </Typography.Heading>
          {!!s.note && (
            <Typography.Paragraph type="body-xs" color="muted">
              {s.note}
            </Typography.Paragraph>
          )}
        </Surface>
      ))}
    </View>
  );
}
