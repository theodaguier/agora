import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Tabs } from "heroui-native";
import { useUniwind } from "uniwind";
import { OptionPicker } from "@/components/menus";
import { useMemo } from "react";
import { fromDay, toDay } from "@/lib/availability";
import { locale } from "@/lib/i18n";

/*
 * The pickers of the Profile screens: the native menu for a value among several and for a day, iOS's
 * segmented control for a few exclusive choices.
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

/**
 * A few exclusive choices side by side: iOS's own segmented control (SwiftUI's Picker, segmented), as
 * in Réglages; more than five do not fit it, and scroll in HeroUI Tabs instead.
 */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (value: T) => void; label: string }) {
  const { theme } = useUniwind();
  if (options.length <= 5)
    return (
      <Host matchContents={{ vertical: true }} colorScheme={theme === "dark" ? "dark" : "light"} style={{ alignSelf: "stretch" }}>
        <Picker<string>
          selection={value}
          onSelectionChange={(v) => {
            if (v !== value) onChange(v as T);
          }}
          modifiers={[pickerStyle("segmented"), accessibilityLabel(label)]}
        >
          {options.map((o) => (
            <Text key={o.value} modifiers={[tag(o.value)]}>
              {o.label}
            </Text>
          ))}
        </Picker>
      </Host>
    );
  const triggers = options.map((o) => (
    <Tabs.Trigger key={o.value} value={o.value}>
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
        <Tabs.ScrollView scrollAlign="center">
          <Tabs.Indicator />
          {triggers}
        </Tabs.ScrollView>
      </Tabs.List>
    </Tabs>
  );
}
