import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Alert, Separator, Spinner, TagGroup, Typography } from "heroui-native";
import { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { usePullToRefresh } from "@/lib/haptics";
import { AdminGate, ErrorAlert, LoadingRows, SearchBox } from "@/components/admin/ui";
import { NodeDot, WikiRow } from "@/components/memory/wiki";
import { wikiMessages } from "@/components/memory/wiki-messages";
import { defineMessages } from "@/lib/i18n";
import { LEGEND, wikiGraphQuery, type WikiNodeType } from "@/lib/memory";

/*
 * apps/web/src/components/admin/WikiMemory.tsx. The web draws the pages as a force graph;
 * on a phone they are a list grouped by type, with the legend as filters and the links
 * between pages under each page.
 */

const t = defineMessages({
  en: {
    title: "Second brain",
    intro: "The agents' shared wiki. Every conversation is added to it, then the curator compiles it into linked pages.",
    empty: "Memory is still empty.",
    emptyHint: "It fills up with every conversation with an agent. Pages will show up here after the first compilation.",
    searchPlaceholder: "Search for a page…",
    noPage: "No pages.",
    compiling: "The curator is compiling new pages…",
    filters: "Types shown",
  },
  fr: {
    title: "Second cerveau",
    intro: "Le wiki commun des agents. Chaque conversation y est versée, puis le curateur la compile en pages reliées entre elles.",
    empty: "La mémoire est encore vide.",
    emptyHint: "Elle se remplit à chaque conversation avec un agent. Les pages apparaîtront ici après la première compilation.",
    searchPlaceholder: "Chercher une page…",
    noPage: "Aucune page.",
    compiling: "Le curateur compile de nouvelles pages…",
    filters: "Types affichés",
  },
});

/** Most recently updated first, then by name. */
const byRecent = (a: { updated?: string | null; label: string }, b: { updated?: string | null; label: string }) =>
  (b.updated ?? "").localeCompare(a.updated ?? "") || a.label.localeCompare(b.label);

export default function WikiScreen() {
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <Wiki />
      </AdminGate>
    </>
  );
}

function Wiki() {
  const m = wikiMessages;
  const graph = useQuery(wikiGraphQuery);
  const pull = usePullToRefresh(graph.refetch);
  const [shown, setShown] = useState<Set<WikiNodeType>>(() => new Set(LEGEND.filter((type) => type !== "raw")));
  const [query, setQuery] = useState("");
  const nodes = useMemo(() => graph.data?.nodes ?? [], [graph.data]);

  const counts = useMemo(() => {
    const c = {} as Record<WikiNodeType, number>;
    for (const n of nodes) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [nodes]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    // A search looks through every type, like the web's search box over the graph.
    const match = (n: (typeof nodes)[number]) => {
      if (!q) return shown.has(n.type);
      return n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || !!n.tags?.some((tag) => tag.toLowerCase().includes(q));
    };
    return LEGEND.map((type) => ({
      type,
      data: nodes.filter((n) => n.type === type && match(n)).sort(byRecent),
    })).filter((s) => s.data.length);
  }, [nodes, query, shown]);

  const header = (
    <View className="gap-4 px-4 pb-4 pt-2">
      <Typography.Paragraph type="body-sm" color="muted">
        {t.intro}
      </Typography.Paragraph>
      <SearchBox value={query} onChange={setQuery} placeholder={t.searchPlaceholder} />
      <ErrorAlert error={graph.error} />
      {graph.data?.status.running && (
        <Alert status="accent">
          <Alert.Indicator>
            <Spinner size="sm" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>{t.compiling}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {nodes.length > 0 && !query && (
        <TagGroup
          accessibilityLabel={t.filters}
          selectionMode="multiple"
          size="sm"
          selectedKeys={shown}
          onSelectionChange={(keys) => setShown(new Set([...keys] as WikiNodeType[]))}
 >
          <TagGroup.List className="flex-row flex-wrap gap-2">
            {LEGEND.filter((type) => counts[type]).map((type) => (
              <TagGroup.Item key={type} id={type}>
                <View className="flex-row items-center gap-1.5">
                  <NodeDot type={type} />
                  <TagGroup.ItemLabel>{`${m.legend[type]} ${counts[type]}`}</TagGroup.ItemLabel>
                </View>
              </TagGroup.Item>
            ))}
          </TagGroup.List>
        </TagGroup>
      )}
    </View>
  );

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="bg-background"
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            {...pull}
 />
        }
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center gap-2 px-4 pb-1.5 pt-4">
            <NodeDot type={section.type} />
            <Typography.Paragraph type="body-sm" color="muted" className="flex-1">
              {m.legend[section.type]}
            </Typography.Paragraph>
            <Typography.Paragraph type="body-sm" color="muted">
              {section.data.length}
            </Typography.Paragraph>
          </View>
        )}
        renderItem={({ item }) => <WikiRow node={item} />}
        ItemSeparatorComponent={() => <Separator className="ml-10" />}
        ListEmptyComponent={
          graph.isPending ? (
            <View className="px-4">
              <LoadingRows rows={6} avatar={false} />
            </View>
          ) : graph.data && !nodes.length ? (
            <View className="items-center gap-1 px-8 py-12">
              <Typography.Heading type="h6" align="center">
                {t.empty}
              </Typography.Heading>
              <Typography.Paragraph type="body-sm" color="muted" align="center">
                {t.emptyHint}
              </Typography.Paragraph>
            </View>
          ) : graph.data ? (
            <Typography.Paragraph color="muted" align="center" className="px-8 py-12">
              {t.noPage}
            </Typography.Paragraph>
          ) : null
        }
        contentContainerClassName="pb-16"
 />
    </>
  );
}
