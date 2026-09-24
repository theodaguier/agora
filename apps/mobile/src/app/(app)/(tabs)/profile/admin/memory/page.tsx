import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Card, Chip, SkeletonGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { AdminGate, ErrorAlert, SettingsScroll, Section } from "@/components/admin/ui";
import { NodeDot, WikiRow } from "@/components/memory/wiki";
import { wikiMessages } from "@/components/memory/wiki-messages";
import { MessageText } from "@/components/message-text";
import { isReadable, linkedTo, wikiGraphQuery, wikiPageQuery, withLinks } from "@/lib/memory";

/* PagePanel of apps/web/src/components/admin/WikiMemory.tsx: a page of the second brain, then the pages it's linked to. */

export default function WikiPageScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const m = wikiMessages;
  const graph = useQuery(wikiGraphQuery);
  const page = useQuery(wikiPageQuery(id));
  const nodes = graph.data?.nodes ?? [];
  const node = nodes.find((n) => n.id === id);
  const linked = linkedTo(id, nodes, graph.data?.edges ?? []);

  const meta = page.data?.meta ?? {};
  const title = (typeof meta.title === "string" && meta.title) || node?.label || id;
  const type = node?.type ?? "concept";
  const tags = Array.isArray(meta.tags) ? meta.tags : [];

  return (
    <>
      <Stack.Screen options={{ title }} />
      <AdminGate>
        <SettingsScroll onRefresh={() => Promise.all([graph.refetch(), page.refetch()])}>
          <View className="gap-3 px-1">
            <View className="flex-row items-center gap-2">
              <NodeDot type={type} />
              <Typography.Paragraph type="body-sm" color="muted">
                {m.type[type]}
                {typeof meta.updated === "string" && ` ${m.updated(meta.updated)}`}
              </Typography.Paragraph>
            </View>
            <Typography.Heading type="h3">{title}</Typography.Heading>
            {typeof meta.summary === "string" && !!meta.summary && <Typography.Paragraph type="body-sm" color="muted">{meta.summary}</Typography.Paragraph>}
            {tags.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Chip key={tag} size="sm" variant="secondary">
                    <Chip.Label>{`#${tag}`}</Chip.Label>
                  </Chip>
                ))}
              </View>
            )}
            {type === "ghost" && <Typography.Paragraph type="body-sm" color="muted">{m.ghost}</Typography.Paragraph>}
            {type === "agent" && <Typography.Paragraph type="body-sm" color="muted">{m.agent}</Typography.Paragraph>}
          </View>

          <ErrorAlert error={page.error} />
          {page.isPending && isReadable(id) ? (
            <Card>
              <Card.Body>
                <SkeletonGroup isLoading isSkeletonOnly className="gap-2.5">
                  {["w-full", "w-full", "w-5/6", "w-full", "w-2/3"].map((width, i) => (
                    <SkeletonGroup.Item key={i} className={`h-3 rounded-md ${width}`} />
                  ))}
                </SkeletonGroup>
              </Card.Body>
            </Card>
          ) : (
            page.data && (
              <Card>
                <Card.Body>
                  <MessageText text={withLinks(page.data.body, nodes)} />
                </Card.Body>
              </Card>
            )
          )}

          {linked.length > 0 && (
            <Section title={m.linked(linked.length)}>
              {linked.map((n) => (
                <WikiRow key={n.id} node={n} />
              ))}
            </Section>
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
