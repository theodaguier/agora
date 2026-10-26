import { Chip, PressableFeedback } from "heroui-native";
import { ScrollView } from "react-native";
import { haptic } from "@/lib/haptics";

/**
 * A list's filter (Figma « Filtre », inbox and tasks): one HeroUI Chip per option, the selected
 * one `primary` (ink, white label), the others `secondary` (grey), scrolling sideways when they
 * overflow. Not TagGroup: its selected tag is `accent-soft`, the same grey as the others in this
 * theme. Tapping the selected chip does nothing — a filter is never empty.
 */
export function FilterTags<K extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
}: {
  value: K;
  onChange: (value: K) => void;
  options: { id: K; label: string }[];
  accessibilityLabel: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      contentContainerClassName="gap-2 px-4"
    >
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <PressableFeedback
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(o.id);
            }}
          >
            <Chip size="md" variant={selected ? "primary" : "secondary"} color={selected ? "accent" : "default"}>
              <Chip.Label>{o.label}</Chip.Label>
            </Chip>
          </PressableFeedback>
        );
      })}
    </ScrollView>
  );
}
