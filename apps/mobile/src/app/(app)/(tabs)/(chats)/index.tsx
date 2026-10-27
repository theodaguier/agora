import { renderEvent } from "@agora/core";
import { common, conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, router, Stack } from "expo-router";
import { ListGroup, PressableFeedback, Separator, SkeletonGroup, Spinner, Typography } from "heroui-native";
import { Fragment, useMemo } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ColorDot, ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { PressableItem } from "@/components/people/section";
import { OrgLogo } from "@/components/org-logo";
import { useMe, useServer } from "@/components/server-scope";
import { listTime } from "@/lib/dates";
import { digestQuery } from "@/lib/digest";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { ConversationSummary } from "@/lib/types";
import { headerIcon } from "@/components/header-button";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { useTurns } from "@/lib/realtime";
import { EmptyState } from "@/components/empty-state";

const messages = defineMessages({
  en: { title: "Chats", waiting: "Waits for your answer", working: "Working", digest: "Morning recap", digestReady: "Morning recap ready" },
  fr: { title: "Discussions", waiting: "Attend ta réponse", working: "Au travail", digest: "Récap du matin", digestReady: "Récap du matin prêt" },
});

/** The conversation list: the app's home, like the web's sidebar. */
export default function Chats() {
  const me = useMe();
  const t = { ...messages, ...tr(conversations), you: tr(common).you };
  const { data: list = [], isPending, refetch } = useQuery(conversationsQuery);
  const pull = usePullToRefresh(refetch);
  const rows = useMemo(() => list.map((c) => ({ ...c, name: conversationTitle(c, me.id) })), [list, me.id]);

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.search} iconRenderingMode="template" accessibilityLabel={tr(common).search} onPress={withTap(() => router.push("/search"))} />
      </Stack.Toolbar>
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
        <Home />
        {rows.length ? (
          // Figma « Discussions »: one flat list on the page, no card, no separators.
          <ListGroup variant="transparent" className="mx-1 mb-8 mt-1">
            {rows.map((item) => (
              <Row key={item.id} item={item} me={me.id} t={t} />
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
        ) : (
          // Nothing yet: say so, and offer the first conversation (Figma « État vide », Grand).
          <EmptyState mascot="violet" title={t.empty} action={{ label: t.newConversation, onPress: () => router.push("/new") }} />
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
  t: { prefix: (name: string) => string; you: string; unread: string; waiting: string; working: string };
}) {
  // A bot waiting for an approval: said instead of the last message, with the orange dot (état/attente).
  const turns = useTurns(c.id);
  const waiting = turns.some((x) => x.approval);
  const working = !waiting && turns.length > 0;
  const preview = c.preview;
  const prefix = preview ? (preview.fromMe ? t.prefix(t.you) : preview.author && c.kind === "group" ? t.prefix(preview.author) : "") : "";
  const text = preview ? (preview.event ? renderEvent(preview.event, locale) : preview.text).replace(/[*_`#>]/g, "").replace(/\s+/g, " ") : "";
  return (
    <Link href={{ pathname: "/c/[conversationId]", params: { conversationId: c.id } }} asChild>
      <Link.Trigger>
        <PressableItem itemClassName="gap-3 py-2.5">
          <ListGroup.ItemPrefix>
            {/* Presence only for colleagues: what a bot is doing is said on the second line. */}
            <ConversationAvatar conversation={c} me={me} className="size-11" status={!c.agents.length} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent className="gap-0.5">
            <View className="flex-row items-baseline gap-2">
              <ListGroup.ItemTitle className="flex-1" numberOfLines={1}>
                {c.name}
              </ListGroup.ItemTitle>
              <Typography type="body-xs" className="text-subtle">
                {listTime(new Date(c.lastAt))}
              </Typography>
            </View>
            {/* Figma « Ligne de conversation »: the dot ends the second line, under the time. Waiting for you: orange; unread: blue. */}
            <View className="flex-row items-center gap-2">
              {working && <Spinner size="sm" color="default" />}
              <ListGroup.ItemDescription className="flex-1" numberOfLines={1}>
                {waiting ? t.waiting : working ? t.working : preview ? `${prefix}${text}` : ""}
              </ListGroup.ItemDescription>
              {waiting ? (
                <View accessibilityLabel={t.waiting}>
                  <ColorDot size={8} color="text-waiting" />
                </View>
              ) : (
                c.unread && (
                  <View accessibilityLabel={t.unread}>
                    <ColorDot size={8} color="text-brand" />
                  </View>
                )
              )}
            </View>
          </ListGroup.ItemContent>
        </PressableItem>
      </Link.Trigger>
      <Link.Preview />
    </Link>
  );
}

/** Figma « Accueil » (the web sidebar's org button): who this space is; opens the morning recap when there is one. */
function Home() {
  const server = useServer();
  const { data: digest } = useQuery(digestQuery);
  return (
    <PressableFeedback
      isDisabled={!digest}
      onPress={withTap(() => router.push("/digest"))}
      accessibilityRole="button"
      accessibilityLabel={digest ? `${server.orgName}, ${messages.digest}` : server.orgName}
      className="items-center gap-1.5 self-center rounded-2xl px-4 pb-4 pt-2"
    >
      <OrgLogo server={server.url} image={server.orgImage} className="size-16" />
      <Typography weight="medium" numberOfLines={1} className="mt-0.5">
        {server.orgName}
      </Typography>
      {!!digest && !digest.seen && (
        <Typography type="body-sm" color="muted">
          {messages.digestReady}
        </Typography>
      )}
    </PressableFeedback>
  );
}
