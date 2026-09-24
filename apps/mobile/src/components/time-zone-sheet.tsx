import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { SheetSearch } from "@/components/conversation/sheet-search";
import { BottomSheet, ListGroup, Separator } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { CheckIcon } from "@/components/icons";
import { timeZones } from "@/lib/admin";
import { PressableRow } from "@/components/profile/settings";
import { zoneLabel } from "@/components/profile/timezone";

/**
 * Searchable list of time zones in a sheet (the web's SearchSelect): the organization's zone in
 * Administration, a person's in their working hours. `first`: a row above the zones (the
 * organization's zone, for a person who follows it).
 */
export function TimeZoneSheet(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (zone: string) => void;
  title: string;
  placeholder: string;
  first?: { value: string; label: string };
}) {
  const [q, setQ] = useState("");
  const label = (z: string) => (z === props.first?.value ? props.first.label : zoneLabel(z));
  const zones = useMemo(() => {
    const all = timeZones(props.first?.value === props.value ? "UTC" : props.value);
    return props.first ? [props.first.value, ...all] : all;
  }, [props.value, props.first]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? zones.filter((z) => words.every((w) => label(z).toLowerCase().includes(w))) : zones;

  return (
    <BottomSheet isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={["85%"]} enableOverDrag={false} enableDynamicSizing={false} keyboardBehavior="extend" contentContainerClassName="h-full">
          <View className="gap-3 pb-3">
            <BottomSheet.Title>{props.title}</BottomSheet.Title>
            <SheetSearch value={q} onChange={setQ} placeholder={props.placeholder} />
          </View>
          <BottomSheetFlatList
            data={shown}
            keyExtractor={(z: string) => z}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <Separator />}
            renderItem={({ item }: { item: string }) => (
              <PressableRow
                onPress={() => {
                  props.onChange(item);
                  props.onOpenChange(false);
                }}
                accessibilityLabel={label(item)}
                accessibilityState={{ selected: item === props.value }}
              >
                <ListGroup.Item className="px-0">
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{label(item)}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  {item === props.value && (
                    <ListGroup.ItemSuffix>
                      <CheckIcon size={20} className="text-accent" />
                    </ListGroup.ItemSuffix>
                  )}
                </ListGroup.Item>
              </PressableRow>
            )}
          />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
