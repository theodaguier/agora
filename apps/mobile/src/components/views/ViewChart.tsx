import { CHART_COLORS, chartLabel, pieSlices, type ChartView } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
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

/** "82 %" in French, "82%" in English. */
const withUnit = (s: string, unit?: string) => (!unit ? s : unit === "%" && locale !== "fr" ? `${s}%` : `${s} ${unit}`);
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
  return <CartesianView view={view} dark={dark} />;
}

function CartesianView({ view, dark }: { view: ChartView; dark: boolean }) {
  const [grid, surface] = useThemeColor(["separator", "surface"]);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const colors = view.series.map((_, i) => CHART_COLORS[i]![dark ? "dark" : "light"]);
  const n = view.labels.length;
  const stacked = !!view.stacked && view.chart !== "line";
  const bottom = HEIGHT + PAD;

  // Stacked: each series sits on the ones before it.
  const tops = view.labels.map((_, j) => {
    let sum = 0;
    return view.series.map((s) => (stacked ? (sum += s.values[j] ?? 0) : (s.values[j] ?? 0)));
  });
  const max = Math.max(0, ...tops.flat()) || 1;
  const y = (v: number) => PAD + (1 - v / max) * HEIGHT;
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
            return v == null ? [] : [`${view.series.length > 1 ? `${s.name} ` : ""}${withUnit(exact.format(v), view.unit)}`];
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
      <View className="flex-row gap-2">
        {/* The scale: its top and its baseline. */}
        <View className={cn(SCALE, "justify-between")} style={{ height: bottom }}>
          <Typography.Paragraph type="body-xs" color="muted" className="tabular-nums" numberOfLines={1}>
            {withUnit(compact.format(max), view.unit)}
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
              {[PAD, PAD + HEIGHT / 2, bottom].map((gy) => (
                <Line key={gy} x1={0} x2={width} y1={gy} y2={gy} stroke={grid} strokeWidth={1} />
              ))}
              {shown !== null && view.chart !== "bar" && <Line x1={x(shown)} x2={x(shown)} y1={PAD} y2={bottom} stroke={grid} strokeWidth={1} />}
              {view.chart === "bar" ? bars() : lines()}
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
              {percent.format(total ? s.value / total : 0)}
            </Typography.Paragraph>
          </View>
        ))}
      </View>
    </View>
  );
}
