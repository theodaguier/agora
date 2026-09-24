import { Tabs } from "heroui-native";
import { OptionPicker } from "@/components/menus";
import { useMemo } from "react";
import { fromDay, toDay } from "@/lib/availability";
import { locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/*
 * The pickers of the Profile screens: a HeroUI Select for a value among several and for
 * a day, HeroUI Tabs for a few exclusive choices.
 */

type Option<T extends string> = { value: T; label: string };

/** A value among several: a HeroUI Select. */
export function MenuPicker<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** Read by VoiceOver, and the sheet's title when the list is long. */
  label: string;
}) {
  return <OptionSelect value={value} options={options} onChange={onChange} label={label} />;
}

/** A day: a HeroUI Select of the days from `from` (today by default), a year ahead. */
export function DayPicker({ value, onChange, from, label }: { value: Date; onChange: (day: Date) => void; from?: Date; label: string }) {
  const start = toDay(from ?? new Date());
  const current = toDay(value);
  const options = useMemo(() => {
    const days: Option<string>[] = [];
    const first = fromDay(start);
    for (let i = 0; i < 366; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      days.push({ value: toDay(d), label: d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) });
    }
    // A saved day beyond the year still shows.
    if (current > days.at(-1)!.value) days.push({ value: current, label: fromDay(current).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) });
    return days;
  }, [start, current]);
  return <OptionSelect value={current} options={options} onChange={(d) => onChange(fromDay(d))} label={label} />;
}

function OptionSelect<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (value: T) => void; label: string }) {
  return <OptionPicker value={value} options={options} onChange={onChange} label={label} />;
}

/** A few exclusive choices side by side: HeroUI Tabs (scrollable when there are many). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (value: T) => void; label: string }) {
  const scroll = options.length > 4;
  const triggers = options.map((o) => (
    <Tabs.Trigger key={o.value} value={o.value} className={cn(!scroll && "flex-1")}>
      <Tabs.Label numberOfLines={1}>{o.label}</Tabs.Label>
    </Tabs.Trigger>
  ));
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        if (v !== value) onChange(v as T);
      }}
    >
      <Tabs.List accessibilityLabel={label} className="self-stretch">
        {scroll ? (
          <Tabs.ScrollView scrollAlign="center">
            <Tabs.Indicator />
            {triggers}
          </Tabs.ScrollView>
        ) : (
          <>
            <Tabs.Indicator />
            {triggers}
          </>
        )}
      </Tabs.List>
    </Tabs>
  );
}
