import * as Haptics from "expo-haptics";
import { PressableFeedback, Surface, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { cn } from "@/lib/utils";

/*
 * A small bar chart (the web uses recharts): one column per period, stacked segments, and a tap
 * on a column to read its figures, like the web's tooltip. HeroUI Native has no chart: columns
 * are PressableFeedback, bars and segments are Surfaces colored with theme tokens.
 */

/** `className`: the segment's background token (bg-accent, bg-warning, bg-success…). */
export type BarSegment = { value: number; className: string };

export function Bars<T>({
  data,
  segments,
  label,
  detail,
  height = 160,
}: {
  data: T[];
  /** Stacked from the bottom. */
  segments: (point: T) => BarSegment[];
  /** Axis label of a column. */
  label: (point: T) => string;
  /** What the selected column says, above the chart. */
  detail: (point: T) => string;
  height?: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const totals = data.map((p) => segments(p).reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(...totals, 0) || 1;
  const shown = selected !== null && data[selected] ? data[selected] : null;
  // A few labels under the axis: first, middle, last.
  const ticks = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <View className="gap-2">
      <Typography.Paragraph type="body-sm" color="muted" className="tabular-nums" numberOfLines={1}>
        {shown ? `${label(shown)} · ${detail(shown)}` : " "}
      </Typography.Paragraph>
      <View className="flex-row items-end gap-0.5" style={{ height }}>
        {data.map((point, i) => (
          <PressableFeedback
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`${label(point)}, ${detail(point)}`}
            onPress={() => {
              Haptics.selectionAsync();
              setSelected(selected === i ? null : i);
            }}
            className="h-full flex-1 justify-end"
 >
            <Surface
              variant="transparent"
              className={cn("rounded-t-sm rounded-b-none p-0", selected !== null && selected !== i && "opacity-40")}
              style={{ height: Math.max((totals[i]! / max) * height, totals[i]! > 0 ? 2 : 0) }}
 >
              {segments(point)
                .slice()
                .reverse()
                .map((s, j) => (
                  <Surface key={j} className={cn("rounded-none p-0 shadow-none", s.className)} style={{ flex: s.value }} />
                ))}
            </Surface>
          </PressableFeedback>
        ))}
      </View>
      <View className="h-5 flex-row">
        {data.map((point, i) => (
          <View key={i} className="flex-1 items-center overflow-visible">
            {ticks.has(i) && (
              <Typography.Paragraph type="body-xs" color="muted" align="center" className="w-20" numberOfLines={1}>
                {label(point)}
              </Typography.Paragraph>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A share of a total: a thin track (Surface) and its fill (Surface in the accent token). */
export function ShareBar({ share, className }: { share: number; className?: string }) {
  return (
    <Surface variant="tertiary" className="h-1.5 flex-1 p-0">
      <Surface className={cn("h-full rounded-full bg-accent p-0 shadow-none", className)} style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
    </Surface>
  );
}
