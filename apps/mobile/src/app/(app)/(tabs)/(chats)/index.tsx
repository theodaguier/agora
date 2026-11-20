import { common, conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ListGroup, PressableFeedback, Separator, SkeletonGroup, Typography } from "heroui-native";
import { Fragment, useMemo } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { conversationTitle } from "@/components/participants";
import { ConversationRow } from "@/components/conversation-row";
import { OrgLogo } from "@/components/org-logo";
import { useMe, useServer } from "@/components/server-scope";
import { digestQuery } from "@/lib/digest";
import { defineMessages, tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { ConversationSummary } from "@/lib/types";
import { headerIcon } from "@/components/header-button";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { EmptyState } from "@/components/empty-state";
import { WarningIcon } from "@/components/icons";

const messages = defineMessages({
  en: {
    title: "Chats",
    waiting: "Waits for your answer",
    working: "Working",
    digest: "Morning recap",
    digestReady: "Morning recap ready",
    agents: "Agents",
    projects: "Projects",
    directMessages: "Messages",
    listError: "Conversations can't be reached right now.",
  },
  fr: {
    title: "Discussions",
    waiting: "Attend ta réponse",
    working: "Au travail",
    digest: "Récap du matin",
    digestReady: "Récap du matin prêt",
    agents: "Agents",
    projects: "Projets",
    directMessages: "Messages",
    listError: "Les conversations sont injoignables pour le moment.",
  },
});

type Named = ConversationSummary & { name: string };

/**
 * The projects, one row each whatever their discussions: the row tells the latest activity among
 * the project and its discussions still in use, and is unread when any of them is.
 */
function projectRows(rows: Named[]): Named[] {
  return rows
    .filter((c) => c.kind === "group" && !c.parentId)
    .map((p) => {
      const inside = [p, ...rows.filter((d) => d.parentId === p.id && !d.archived)];
      const latest = inside.reduce((a, b) => (new Date(b.lastAt) > new Date(a.lastAt) ? b : a));
      return { ...p, preview: latest.preview, lastAt: latest.lastAt, unread: inside.some((c) => c.unread) };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

/** The conversation list: the app's home, like the web's sidebar. */
export default function Chats() {
  const me = useMe();
  const t = { ...messages, ...tr(conversations), you: tr(common).you };
  const { data: list = [], isPending, error, refetch } = useQuery(conversationsQuery);
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
          // As the web's sidebar: the bots you talk to one-on-one, the projects (groups), then one-on-one messages with colleagues.
          <View className="mb-8 mt-1 gap-4">
            {[
              { key: "agents", label: t.agents, rows: rows.filter((c) => c.kind === "direct" && c.agents.length > 0) },
              { key: "projects", label: t.projects, rows: projectRows(rows) },
              { key: "messages", label: t.directMessages, rows: rows.filter((c) => c.kind === "direct" && c.agents.length === 0) },
            ].map(
              (g) =>
                g.rows.length > 0 && (
                  <View key={g.key}>
                    <Typography type="body-sm" color="muted" className="mx-5 mb-0.5">
                      {g.label}
                    </Typography>
                    {/* Figma « Discussions »: one flat list on the page, no card, no separators. */}
                    <ListGroup variant="transparent" className="mx-1">
                      {g.rows.map((item) => (
                        <ConversationRow
                          key={item.id}
                          item={item}
                          me={me.id}
                          t={t}
                          // A project opens its discussions; everything else its thread.
                          href={g.key === "projects" ? { pathname: "/project/[projectId]", params: { projectId: item.id } } : undefined}
                        />
                      ))}
                    </ListGroup>
                  </View>
                ),
            )}
          </View>
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
        ) : error ? (
          <EmptyState icon={WarningIcon} description={t.listError} action={{ label: tr(common).retry, onPress: () => refetch() }} />
        ) : (
          // Nothing yet: say so, and offer the first conversation (Figma « État vide », Grand).
          <EmptyState mascot="violet" title={t.empty} action={{ label: t.newConversation, onPress: () => router.push("/new") }} />
        )}
      </ScrollView>
    </>
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
