import { useState } from "react";
import { CHART_COLORS } from "@agora/core";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipPanel, ChartTooltipRow, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getLocale, useT } from "@/i18n";
import type { DigestStats } from "@/lib/api";
import { fromDay } from "@/lib/dates";
import { useFormat } from "@/lib/usage-format";
import { messages } from "./MorningDigest.messages";

/** Categorical slots of the data-viz palette, as in the usage screen. */
const chartConfig = {
  messages: { theme: CHART_COLORS[0] },
  tokens: { theme: CHART_COLORS[1] },
} satisfies ChartConfig;

type Metric = "messages" | "tokens";

/** Messages or tokens per hour (one day) or per day. */
export function DigestActivity({ stats, byDay }: { stats: DigestStats; byDay: boolean }) {
  const t = useT(messages);
  const f = useFormat();
  const [metric, setMetric] = useState<Metric>("messages");
  const locale = getLocale();
  const label = (v: string) => (byDay ? fromDay(v).toLocaleDateString(locale, { weekday: "short" }) : `${Number(v)}h`);
  if (!stats.series.some((p) => p.messages || p.tokens)) return null;
  // Tokens hidden from the reader: messages only.
  const shown: Metric = stats.usage ? metric : "messages";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t.activity}</h3>
        {stats.usage && (
          <ToggleGroup aria-label={t.activity} value={[shown]} onValueChange={(v) => v[0] && setMetric(v[0] as Metric)} variant="outline" size="sm">
            <ToggleGroupItem value="messages" className="px-3">
              {t.metricMessages}
            </ToggleGroupItem>
            <ToggleGroupItem value="tokens" className="px-3">
              {t.metricTokens}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-36 w-full">
        <BarChart data={stats.series} margin={{ left: 0, right: 0, top: 4 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tickFormatter={label} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload, label: at }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]!.payload as DigestStats["series"][number];
              return (
                <ChartTooltipPanel title={label(String(at))}>
                  <ChartTooltipRow name={t.metricMessages} value={f.whole(point.messages)} />
                  {stats.usage && <ChartTooltipRow name={t.metricTokens} value={f.compact(point.tokens)} />}
                  {point.tasksDone > 0 && <ChartTooltipRow name={t.done} value={t.tasksDoneShort(point.tasksDone)} />}
                </ChartTooltipPanel>
              );
            }}
          />
          <Bar dataKey={shown} fill={`var(--color-${shown})`} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
