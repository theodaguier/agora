import { common, conversations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import { ListGroup, Tabs, Typography } from "heroui-native";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { ConversationRow } from "@/components/conversation-row";
import { EmptyState } from "@/components/empty-state";
import { headerIcon } from "@/components/header-button";
import { conversationTitle } from "@/components/participants";
import { useAdminToast } from "@/components/admin/ui";
import { useMe } from "@/components/server-scope";
import { api, conversationPath } from "@/lib/api";
import { haptic, usePullToRefresh, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { conversationQuery, conversationsQuery } from "@/lib/queries";
import type { ConversationSummary } from "@/lib/types";

/* apps/web/src/screens/ProjectDiscussions.tsx and the sidebar's DiscussionMenu (apps/web/src/components/ProjectTree.tsx). */

const messages = defineMessages({
  en: {
    discussions: "Discussions",
    active: "Active",
    archived: "Archived",
    general: "General",
    newDiscussion: "New discussion",
    rename: "Rename",
    pin: "Pin",
    unpin: "Unpin",
    move: "Move to a project",
    markRead: "Mark as read",
    archive: "Archive",
    unarchive: "Restore",
    delete: "Delete",
    deleteTitle: (name: string) => `Delete « ${name} »?`,
    deleteBody: "Its messages are deleted for every member. This can't be undone.",
    noArchived: "No archived discussion.",
    notFound: "This project doesn't exist, or you're not in it anymore.",
    failed: "Action failed.",
    waiting: "Waits for your answer",
    working: "Working",
  },
  fr: {
    discussions: "Discussions",
    active: "Actives",
    archived: "Archivées",
    general: "Général",
    newDiscussion: "Nouvelle discussion",
    rename: "Renommer",
    pin: "Épingler",
    unpin: "Désépingler",
    move: "Déplacer vers un projet",
    markRead: "Marquer comme lu",
    archive: "Archiver",
    unarchive: "Restaurer",
    delete: "Supprimer",
    deleteTitle: (name: string) => `Supprimer « ${name} » ?`,
    deleteBody: "Ses messages sont supprimés pour tous les membres. Impossible de revenir en arrière.",
    noArchived: "Aucune discussion archivée.",
    notFound: "Ce projet n'existe pas, ou tu n'en fais plus partie.",
    failed: "Action impossible.",
    waiting: "Attend ta réponse",
    working: "Au travail",
  },
});

type Named = ConversationSummary & { name: string };

/** A project's discussions: « General » (its own thread) then the active ones, pinned first; or its archive. */
export default function ProjectDiscussions() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const me = useMe();
  const t = { ...messages, ...tr(conversations), you: tr(common).you };
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const { data: list = [], refetch } = useQuery(conversationsQuery);
  const pull = usePullToRefresh(refetch);
  const named: Named[] = list.map((c) => ({ ...c, name: conversationTitle(c, me.id) }));
  const project = named.find((c) => c.id === projectId && !c.parentId);
  const projects = named.filter((c) => c.kind === "group" && !c.parentId);
  const inside = named.filter((c) => c.parentId === projectId && c.archived === (tab === "archived"));
  const rows = tab === "active" ? [...(project ? [{ ...project, name: messages.general }] : []), ...inside.filter((c) => c.pinned), ...inside.filter((c) => !c.pinned)] : inside;

  // No name to type: its bot names it after the first exchange.
  const create = async () => {
    try {
      const { id } = await api<{ id: string }>(conversationPath(projectId, "/discussions"), { method: "POST", body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: id } });
    } catch (e) {
      toast.failed(e, messages.failed);
    }
  };

  return (
    <>
      <Stack.Screen.Title>{project?.name ?? messages.discussions}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={messages.newDiscussion} onPress={withTap(create)} />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" refreshControl={<RefreshControl {...pull} />}>
        {!project ? (
          <EmptyState description={messages.notFound} />
        ) : (
          <View className="gap-3 pb-8 pt-2">
            <View className="mx-4">
              <Tabs value={tab} onValueChange={(v) => (haptic.select(), setTab(v as "active" | "archived"))}>
                <Tabs.List>
                  <Tabs.Indicator />
                  <Tabs.Trigger value="active">
                    <Tabs.Label>{messages.active}</Tabs.Label>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="archived">
                    <Tabs.Label>{messages.archived}</Tabs.Label>
                  </Tabs.Trigger>
                </Tabs.List>
              </Tabs>
            </View>
            {rows.length ? (
              <ListGroup variant="transparent" className="mx-1">
                {rows.map((c) => (
                  <ConversationRow
                    key={c.id}
                    item={c}
                    me={me.id}
                    t={t}
                    menu={c.parentId ? <DiscussionMenu discussion={c} projects={projects} /> : undefined}
                  />
                ))}
              </ListGroup>
            ) : (
              <Typography color="muted" className="mx-5">
                {messages.noArchived}
              </Typography>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/** Long press on a discussion: rename, pin, move, mark read, archive, delete (the web's same menu). */
function DiscussionMenu({ discussion: d, projects }: { discussion: Named; projects: Named[] }) {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }), qc.invalidateQueries({ queryKey: conversationQuery(d.id).queryKey })]);
  const run = useMutation({
    mutationFn: ({ path = "", method, body }: { path?: string; method: string; body?: object }) =>
      api(conversationPath(d.id, path), { method, ...(body && { body: JSON.stringify(body) }) }),
    onSuccess: refresh,
    onError: (e) => toast.failed(e, messages.failed),
  });
  const rename = () =>
    Alert.prompt(
      messages.rename,
      undefined,
      [
        { text: tr(common).cancel, style: "cancel" },
        { text: messages.rename, isPreferred: true, onPress: (title?: string) => title?.trim() && run.mutate({ method: "PATCH", body: { title: title.trim() } }) },
      ],
      "plain-text",
      d.title ?? "",
    );
  const others = projects.filter((p) => p.id !== d.parentId);
  return (
    <Link.Menu>
      <Link.MenuAction icon="pencil" onPress={withTap(rename)}>
        {messages.rename}
      </Link.MenuAction>
      <Link.MenuAction icon={d.pinned ? "pin.slash" : "pin"} onPress={withTap(() => run.mutate({ method: "PATCH", body: { pinned: !d.pinned } }))}>
        {d.pinned ? messages.unpin : messages.pin}
      </Link.MenuAction>
      {others.length > 0 && (
        <Link.Menu title={messages.move} icon="folder">
          {others.map((p) => (
            <Link.MenuAction key={p.id} icon="folder" onPress={withTap(() => run.mutate({ method: "PATCH", body: { parentId: p.id } }))}>
              {p.name}
            </Link.MenuAction>
          ))}
        </Link.Menu>
      )}
      <Link.MenuAction icon="envelope.open" disabled={!d.unread} onPress={withTap(() => run.mutate({ path: "/read", method: "POST" }))}>
        {messages.markRead}
      </Link.MenuAction>
      <Link.MenuAction icon="archivebox" onPress={withTap(() => run.mutate({ method: "PATCH", body: { archived: !d.archived } }))}>
        {d.archived ? messages.unarchive : messages.archive}
      </Link.MenuAction>
      <Link.MenuAction
        icon="trash"
        destructive
        onPress={withTap(async () => (await confirmAction({ title: messages.deleteTitle(d.name), description: messages.deleteBody, action: messages.delete })) && run.mutate({ method: "DELETE" }))}
      >
        {messages.delete}
      </Link.MenuAction>
    </Link.Menu>
  );
}
