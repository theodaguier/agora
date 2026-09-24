import { Stack, useLocalSearchParams } from "expo-router";
import { Separator, Typography } from "heroui-native";
import { useDeferredValue, useState } from "react";
import { FlatList, View, type ListRenderItem } from "react-native";
import { AdminGate, LoadingRows, SearchBox } from "@/components/admin/ui";
import { ItemRow } from "@/components/marketplace/item-row";
import { sectionTitles, useMarket, type Section } from "@/components/marketplace/use-market";
import { defineMessages } from "@/lib/i18n";
import { matches, type Item } from "@/lib/marketplace";

/* AllOf of apps/web/src/components/marketplace/Marketplace.tsx: every item of a section, filtered. */

const t = defineMessages({
  en: { filter: "Filter", nothing: "Nothing matches." },
  fr: { filter: "Filtrer", nothing: "Aucun résultat." },
});

export default function AllScreen() {
  const { section, q = "" } = useLocalSearchParams<{ section: Section; q?: string }>();
  return (
    <>
      <Stack.Screen.Title>{sectionTitles[section]}</Stack.Screen.Title>
      <AdminGate>
        <All section={section} query={q} />
      </AdminGate>
    </>
  );
}

// Module-level, so the list never remounts its rows or separators on a render.
const keyOf = (item: Item) => item.key;
const renderRow: ListRenderItem<Item> = ({ item }) => <ItemRow item={item} />;
const RowSeparator = () => <Separator className="mx-4" />;

/** Catalogs run to hundreds of items (skills.sh): a virtualized list, not a grouped section. */
function All({ section, query }: { section: Section; query: string }) {
  const market = useMarket(query);
  const [filter, setFilter] = useState("");
  const f = useDeferredValue(filter.trim());
  const all = market.items[section];
  const items = f ? all.filter((i) => matches(i, f)) : all;

  return (
    <FlatList
      data={items}
      keyExtractor={keyOf}
      renderItem={renderRow}
      ItemSeparatorComponent={RowSeparator}
      ListHeaderComponent={
        <View className="px-4 pb-3 pt-2">
          <SearchBox value={filter} onChange={setFilter} placeholder={t.filter} />
        </View>
      }
      ListEmptyComponent={
        !all.length && market.pending[section] ? (
          <View className="px-4">
            <LoadingRows rows={6} />
          </View>
        ) : (
          <Typography.Paragraph type="body-sm" color="muted" align="center" className="px-8 py-10">
            {t.nothing}
          </Typography.Paragraph>
        )
      }
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      className="bg-background"
      contentContainerClassName="pb-16"
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      removeClippedSubviews
    />
  );
}
