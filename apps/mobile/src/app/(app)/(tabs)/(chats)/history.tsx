import { historyBucket, type HistoryBucket } from "@agora/core";
import { conversations, simple } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { LinkRow, PressableRow, SearchBox, Section, SettingsScroll } from "@/components/admin/ui";
import { ColorDot, PersonAvatar } from "@/components/conversation-avatar";
import { EmptyState } from "@/components/empty-state";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { conversationTitle } from "@/components/participants";
import { useMe } from "@/components/server-scope";
import { tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import { defaultAssistant, useAssistants, useNewChat } from "@/lib/simple";
import type { ConversationSummary } from "@/lib/types";

/*
 * Figma « Mode simple », 9 · Historique: the simple interface's only menu, sliding in from the left like
 * ChatGPT's. A new chat, then every chat by day (with their assistants, a colleague's assistant writing
 * for them, a colleague), the unread ones marked; their name at the bottom opens their settings.
 * Projects stay out: what concerns them there comes to their chat.
 */

const ORDER: HistoryBucket[] = ["today", "yesterday", "week", "month", "older"];

export default function History() {
  const t = tr(simple);
  const me = useMe();
  const { data: list = [], refetch } = useQuery(conversationsQuery);
  const agents = useAssistants().data ?? [];
  const newChat = useNewChat();
  const [q, setQ] = useState("");
  const chats = useMemo(() => list.filter((c) => c.kind === "direct" && !!c.preview).map((c) => ({ ...c, name: conversationTitle(c, me.id) })), [list, me.id]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = chats.filter((c) => words.every((w) => `${c.name} ${c.preview?.text ?? ""}`.toLowerCase().includes(w)));
  const buckets = ORDER.map((b) => ({ key: b, rows: shown.filter((c) => historyBucket(new Date(c.lastAt)) === b) })).filter((b) => b.rows.length);
  const open = (c: ConversationSummary) => router.navigate({ pathname: "/", params: { c: c.id } });
  const next = defaultAssistant(agents, list);

  return (
    <>
      <Stack.Screen.Title>{t.menu}</Stack.Screen.Title>
      <SearchBox value={q} onChange={setQ} placeholder={t.search} />
      <SettingsScroll onRefresh={refetch}>
        {!words.length && !!next && (
          <Section>
            <LinkRow icon={PlusIcon} title={t.newChat} chevron={false} onPress={() => newChat.mutate(next)} />
          </Section>
        )}
        {buckets.map((b) => (
          <Section key={b.key} title={t.history[b.key]}>
            {b.rows.map((c) => (
              <PressableRow key={c.id} onPress={() => open(c)} accessibilityLabel={c.name}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1} className={c.unread ? "font-semibold" : undefined}>
                    {c.name}
                  </ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                {c.unread && (
                  <View accessibilityLabel={tr(conversations).unread}>
                    <ColorDot size={8} color="text-brand" />
                  </View>
                )}
              </PressableRow>
            ))}
          </Section>
        ))}
        {!!words.length && !buckets.length && <EmptyState icon={SearchIcon} description={t.noMatch} />}
        <Section>
          <PressableRow onPress={() => router.push("/profile")} accessibilityLabel={t.settings}>
            <ListGroup.ItemPrefix>
              <PersonAvatar person={me} className="size-8" />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <Typography numberOfLines={1}>{me.name}</Typography>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        </Section>
      </SettingsScroll>
    </>
  );
}
