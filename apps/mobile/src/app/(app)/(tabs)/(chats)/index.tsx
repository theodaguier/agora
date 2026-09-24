import { renderEvent } from "@agora/core";
import { common, conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, router, Stack } from "expo-router";
import { Button, ListGroup, Separator, SkeletonGroup, Typography } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ColorDot, ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { PressableItem } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { ConversationSummary } from "@/lib/types";
import { headerIcon } from "@/components/header-button";
import { PlusIcon } from "@/components/icons";
import { usePullToRefresh, withTap } from "@/lib/haptics";

const messages = defineMessages({
  en: { title: "Chats", yesterday: "Yesterday" },
  fr: { title: "Discussions", yesterday: "Hier" },
});

const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "long" });
const dateFormat = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "2-digit" });

/** "11:45", "Yesterday", "Monday", "12/09/26": the date column of iOS Messages. */
function when(iso: string) {
  const at = new Date(iso);
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(at.toDateString()).getTime()) / 86_400_000);
  const capitalized = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  if (days === 0) return timeFormat.format(at);
  // No Intl.RelativeTimeFormat in Hermes.
  if (days === 1) return messages.yesterday;
  if (days < 7) return capitalized(weekdayFormat.format(at));
  return dateFormat.format(at);
}

/** The conversation list: the app's home, like the web's sidebar. */
export default function Chats() {
  const me = useMe();
  const t = { ...messages, ...tr(conversations), search: tr(common).search, you: tr(common).you };
  const [q, setQ] = useState("");
  const { data: list = [], isPending, refetch } = useQuery(conversationsQuery);
  const pull = usePullToRefresh(refetch);
  const rows = useMemo(
    () => list.map((c) => ({ ...c, name: conversationTitle(c, me.id) })).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())),
    [list, me.id, q],
  );

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.SearchBar placeholder={t.search} onChangeText={(e) => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ("")} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.newConversation} onPress={withTap(() => router.push("/new"))} />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="bg-background"
        refreshControl={
          <RefreshControl
            {...pull}
 />
        }
 >
        {rows.length ? (
          <ListGroup className="mx-4 mb-8 mt-2 overflow-hidden">
            {rows.map((item, i) => (
              <Fragment key={item.id}>
                {i > 0 && <Separator className="ms-20 me-4" />}
                <Row item={item} me={me.id} t={t} />
              </Fragment>
            ))}
          </ListGroup>
        ) : isPending ? (
          <ListGroup className="mx-4 mt-2">
            {[0, 1, 2, 3].map((i) => (
              <Fragment key={i}>
                {i > 0 && <Separator className="ms-20 me-4" />}
                <SkeletonGroup isLoading isSkeletonOnly className="flex-row items-center gap-3 p-4">
                  <SkeletonGroup.Item className="size-13 rounded-full" />
                  <View className="flex-1 gap-2">
                    <SkeletonGroup.Item className="h-4 w-2/5 rounded-md" />
                    <SkeletonGroup.Item className="h-3 w-4/5 rounded-md" />
                  </View>
                </SkeletonGroup>
              </Fragment>
            ))}
          </ListGroup>
        ) : q.trim() ? (
          <Typography type="body-sm" color="muted" align="center" className="px-6 py-12">
            {t.empty}
          </Typography>
        ) : (
          // Nothing yet: say so, and offer the first conversation.
          <View className="items-center gap-4 px-6 py-12">
            <Typography type="body-sm" color="muted" align="center">
              {t.empty}
            </Typography>
            <Button variant="secondary" onPress={withTap(() => router.push("/new"))}>
              {t.newConversation}
            </Button>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Row({
  item: c,
  me,
  t,
}: {
  item: ConversationSummary & { name: string };
  me: string;
  t: { prefix: (name: string) => string; you: string; unread: string };
}) {
  const preview = c.preview;
  const prefix = preview ? (preview.fromMe ? t.prefix(t.you) : preview.author && c.kind === "group" ? t.prefix(preview.author) : "") : "";
  const text = preview ? (preview.event ? renderEvent(preview.event, locale) : preview.text).replace(/[*_`#>]/g, "").replace(/\s+/g, " ") : "";
  return (
    <Link href={{ pathname: "/c/[conversationId]", params: { conversationId: c.id } }} asChild>
      <Link.Trigger>
        <PressableItem itemClassName="gap-3 py-2.5">
          <ListGroup.ItemPrefix>
            <ConversationAvatar conversation={c} me={me} className="size-13" status />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent className="gap-0.5">
            <View className="flex-row items-baseline gap-2">
              <ListGroup.ItemTitle className="flex-1" numberOfLines={1}>
                {c.name}
              </ListGroup.ItemTitle>
              <Typography type="body-sm" color="muted">
                {when(c.lastAt)}
              </Typography>
            </View>
            {!!preview && (
              <ListGroup.ItemDescription numberOfLines={2}>
                {prefix}
                {text}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          {/* Unread: the dot of iOS Messages. */}
          {c.unread && (
            <ListGroup.ItemSuffix accessibilityLabel={t.unread}>
              <ColorDot size={10} color="text-accent" />
            </ListGroup.ItemSuffix>
          )}
        </PressableItem>
      </Link.Trigger>
      <Link.Preview />
    </Link>
  );
}
