import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { Avatar, ListGroup, Separator, SkeletonGroup, Typography, useToast } from "heroui-native";
import { Fragment, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { FilterTags } from "@/components/filter-tags";
import { ColorDot, PersonAvatar } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { MentionText } from "@/components/mention";
import { useMe } from "@/components/server-scope";
import { dividerLabel } from "@/lib/dates";
import { defineMessages } from "@/lib/i18n";
import { inboxQuery, useMarkInbox, type InboxItem, type InboxKind } from "@/lib/inbox";
import type { Mentionable } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { conversationsQuery } from "@/lib/queries";
import { taskHref } from "@/lib/tasks";
import { LongPressMenu } from "@/components/menus";
import { PressableItem } from "@/components/people/section";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { EmptyState } from "@/components/empty-state";

/* apps/web/src/screens/Inbox.tsx: the "…" menu of a row becomes a HeroUI Menu opened by a long press. */

const messages = defineMessages({
  en: {
    title: "Inbox",
    all: "All",
    unread: "Unread",
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    someone: "Someone",
    justNow: "Just now",
    // Written out: Hermes has no Intl.RelativeTimeFormat.
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    kind: {
      mention: "mentioned you",
      reply: "replied to your message",
      "task.assigned": "assigned you a task",
      "task.done": "completed a task you created",
    } as Record<InboxKind, string>,
    emptyTitle: "Nothing yet",
    empty: "Mentions, replies and tasks that concern you land here.",
    emptyUnread: "You're all caught up",
    showAll: "Show all",
    markedRead: "Marked as read",
    markedUnread: "Marked as unread",
    allMarkedRead: "Everything is marked as read",
    markFailed: "Couldn't update the inbox.",
  },
  fr: {
    title: "Boîte de réception",
    all: "Toutes",
    unread: "Non lues",
    markAllRead: "Tout marquer comme lu",
    markRead: "Marquer comme lu",
    markUnread: "Marquer comme non lu",
    someone: "Quelqu'un",
    justNow: "À l'instant",
    minutesAgo: (n: number) => `il y a ${n} min`,
    hoursAgo: (n: number) => `il y a ${n} h`,
    kind: {
      mention: "t'a mentionné",
      reply: "a répondu à ton message",
      "task.assigned": "t'a assigné une tâche",
      "task.done": "a terminé une tâche que tu as créée",
    },
    emptyTitle: "Rien pour l'instant",
    empty: "Les mentions, réponses et tâches qui te concernent arrivent ici.",
    emptyUnread: "Tout est lu",
    showAll: "Tout afficher",
    markedRead: "Marqué comme lu",
    markedUnread: "Marqué comme non lu",
    allMarkedRead: "Tout est marqué comme lu",
    markFailed: "Mise à jour impossible.",
  },
});

const t = messages;

type Filter = "all" | "unread";

/** "Just now", "5 min ago", "3 h ago", then "Yesterday 17:42" / "Sep 12 09:15". */
function sinceLabel(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutesAgo(minutes);
  if (minutes < 6 * 60) return t.hoursAgo(Math.floor(minutes / 60));
  return dividerLabel(date);
}

/** Mentions, replies and tasks that concern you, newest first. */
export default function InboxScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isPending, refetch } = useQuery(inboxQuery(filter === "unread"));
  const pull = usePullToRefresh(refetch);
  const mentionables = useMentionables(noAgents);
  const mark = useMarkInbox();
  const { toast } = useToast();
  const unread = data?.unread ?? 0;

  const markAll = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    mark.mutateAsync({}).then(
      () => toast.show({ variant: "success", label: t.allMarkedRead }),
      () => toast.show({ variant: "danger", label: t.markFailed }),
    );
  };

  // The list of the selected filter (the query follows the filter).
  const list = isPending ? (
    <ListGroup>
      {[0, 1, 2].map((i) => (
        <Fragment key={i}>
          {i > 0 && <Separator className="ms-16 me-4" />}
          <SkeletonGroup isLoading isSkeletonOnly className="flex-row items-start gap-3 p-4">
            <SkeletonGroup.Item className="size-10 rounded-full" />
            <View className="flex-1 gap-2">
              <SkeletonGroup.Item className="h-4 w-4/5 rounded-md" />
              <SkeletonGroup.Item className="h-3 w-3/5 rounded-md" />
            </View>
          </SkeletonGroup>
        </Fragment>
      ))}
    </ListGroup>
  ) : !data?.items.length ? (
    // Figma « État vide », Grand (web Inbox.tsx): the teal figurine with its notebook.
    <EmptyState
      mascot="teal"
      title={filter === "unread" ? t.emptyUnread : t.emptyTitle}
      description={filter === "unread" ? undefined : t.empty}
      action={filter === "unread" ? { label: t.showAll, onPress: () => setFilter("all") } : undefined}
    />
  ) : (
    <ListGroup className="overflow-hidden">
      {data.items.map((item, i) => (
        <Fragment key={item.id}>
          {i > 0 && <Separator className="ms-16 me-4" />}
          <InboxRow item={item} mentionables={mentionables} />
        </Fragment>
      ))}
    </ListGroup>
  );

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={t.markAllRead} disabled={!unread || mark.isPending} onPress={withTap(markAll)} />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="bg-background"
        contentContainerClassName="pb-10 pt-2"
        refreshControl={
          <RefreshControl
            {...pull}
          />
        }
      >
        <View className="gap-4">
          <FilterTags
            accessibilityLabel={t.title}
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: t.all },
              { id: "unread", label: unread > 0 ? `${t.unread} · ${unread}` : t.unread },
            ]}
          />
          <View className="px-4">{list}</View>
        </View>
      </ScrollView>
    </>
  );
}

function InboxRow({ item, mentionables }: { item: InboxItem; mentionables: Mentionable[] }) {
  const me = useMe();
  const { data: conversations } = useQuery(conversationsQuery);
  const mark = useMarkInbox();
  const { toast } = useToast();
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const where = conv && conv.kind === "group" ? conversationTitle(conv, me.id) : null;
  const onTask = item.kind === "task.assigned" || item.kind === "task.done";
  const body = onTask ? (item.task?.title ?? item.text) : item.text;

  const setRead = (read: boolean) => mark.mutateAsync({ ids: [item.id], read });
  // From the menu: said with a toast (the row may leave the "Unread" list meanwhile).
  const toggleRead = () => {
    const read = !item.read;
    setRead(read).then(
      () => toast.show({ variant: "success", label: read ? t.markedRead : t.markedUnread }),
      () => toast.show({ variant: "danger", label: t.markFailed }),
    );
  };
  const open = () => {
    if (!item.read) setRead(true).catch(() => {});
    if (onTask) {
      if (item.task) router.push(taskHref(item.task.id));
    } else if (item.conversationId)
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: item.conversationId, ...(item.messageId ? { m: item.messageId } : {}) } });
  };

  // A tap opens the item; a long press, the HeroUI Menu .
  return (
    <LongPressMenu
      actions={[{ label: item.read ? t.markUnread : t.markRead, icon: item.read ? "envelope.badge" : "envelope.open", onPress: toggleRead }]}
    >
      <PressableItem onPress={open} itemClassName="items-start gap-3 py-3">
        <ListGroup.ItemPrefix className="pt-0.5">
          {item.actor?.kind === "agent" ? (
            <AgentAvatar agent={item.actor} size={40} />
          ) : item.actor ? (
            <PersonAvatar person={item.actor} size={40} />
          ) : (
            <Avatar alt="" size="sm" variant="soft" color="default" animation="disable-all" />
          )}
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent className="gap-0.5">
          <View className="flex-row items-baseline gap-2">
            <ListGroup.ItemTitle className="flex-1" numberOfLines={2}>
              <Typography weight="semibold">{item.actor?.name ?? t.someone}</Typography> {t.kind[item.kind]}
              {!!where && <Typography color="muted"> · {where}</Typography>}
            </ListGroup.ItemTitle>
            <Typography type="body-xs" color="muted">
              {sinceLabel(new Date(item.createdAt))}
            </Typography>
          </View>
          {!!body && (
            <ListGroup.ItemDescription className={onTask && item.task?.status === "done" ? "line-through" : undefined} numberOfLines={2}>
              <MentionText text={body} mentionables={mentionables} flat />
            </ListGroup.ItemDescription>
          )}
        </ListGroup.ItemContent>
        {/* Always there, so the dates line up whether a row is read or not: the unread dot. */}
        <ListGroup.ItemSuffix className="self-center" accessibilityLabel={item.read ? undefined : t.unread}>
          <View style={{ width: 10, height: 10 }}>{!item.read && <ColorDot size={10} color="text-brand" />}</View>
        </ListGroup.ItemSuffix>
      </PressableItem>
    </LongPressMenu>
  );
}

const noAgents: never[] = [];
