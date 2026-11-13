import { common } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { ListGroup, SkeletonGroup, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { TaskStatusIcon } from "@/components/code-session-marks";
import { ColorDot } from "@/components/conversation-avatar";
import { EmptyState } from "@/components/empty-state";
import { FilterTags } from "@/components/filter-tags";
import { headerIcon } from "@/components/header-button";
import { InboxIcon, WarningIcon } from "@/components/icons";
import { ActorAvatar, inboxItemHref, inboxMessages, tabOf, useInboxItem, type InboxTab } from "@/components/inbox-item";
import { LongPressMenu } from "@/components/menus";
import { PressableItem } from "@/components/people/section";
import { ageLabel } from "@/lib/dates";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { inboxQuery, useMarkInbox, type InboxItem } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/screens/Inbox.tsx at phone width (Figma « Boîte de réception »): the filters
 * « Prioritaire » / « Autres » with their counts, then one flat list; a row opens its item on a
 * pushed screen (inbox/[itemId]). The web's display menu (mark all as read) is the header's check.
 */

const t = inboxMessages;

export default function InboxScreen() {
  const c = tr(common);
  const [tab, setTab] = useState<InboxTab>("priority");
  const { data, isPending, isError, refetch } = useQuery(inboxQuery());
  const pull = usePullToRefresh(refetch);
  const mark = useMarkInbox();
  const { toast } = useToast();
  const items = data?.items ?? [];
  const shown = items.filter((i) => tabOf(i.kind) === tab);
  const count = (key: InboxTab) => items.filter((i) => tabOf(i.kind) === key).length;

  const markAll = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    mark.mutateAsync({}).then(
      () => toast.show({ variant: "success", label: t.allMarkedRead }),
      () => toast.show({ variant: "danger", label: t.markFailed }),
    );
  };

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={t.markAllRead} disabled={!data?.unread || mark.isPending} onPress={withTap(markAll)} />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="pb-10 pt-2" refreshControl={<RefreshControl {...pull} />}>
        <FilterTags
          accessibilityLabel={t.title}
          value={tab}
          onChange={setTab}
          options={[
            { id: "priority", label: `${t.priority} ${count("priority")}` },
            { id: "other", label: `${t.other} ${count("other")}` },
          ]}
        />
        {isPending ? (
          <View className="gap-2 px-4 pt-3">
            {[0, 1, 2].map((i) => (
              <SkeletonGroup key={i} isLoading isSkeletonOnly className="flex-row items-center gap-3 py-2">
                <SkeletonGroup.Item className="size-9 rounded-full" />
                <View className="flex-1 gap-2">
                  <SkeletonGroup.Item className="h-4 w-3/5 rounded-md" />
                  <SkeletonGroup.Item className="h-3 w-4/5 rounded-md" />
                </View>
              </SkeletonGroup>
            ))}
          </View>
        ) : isError ? (
          <EmptyState icon={WarningIcon} title={t.errorTitle} description={t.error} action={{ label: c.retry, onPress: () => void refetch() }} className="mt-8" />
        ) : !shown.length ? (
          <EmptyState icon={InboxIcon} title={t.emptyTitle} description={t.empty} className="mt-8" />
        ) : (
          // As the web's list: flat rows on the page, no card, no separators.
          <ListGroup variant="transparent" className="mx-1 mt-2">
            {shown.map((item) => (
              <InboxRow key={item.id} item={item} />
            ))}
          </ListGroup>
        )}
      </ScrollView>
    </>
  );
}

/** A row: the avatar and its action mark, the title over what happened, the task's state and the age on the right. Read rows fade. */
function InboxRow({ item }: { item: InboxItem }) {
  const { title, action, setRead } = useInboxItem(item);
  const { toast } = useToast();
  // From the menu: said with a toast.
  const toggleRead = () => {
    const read = !item.read;
    setRead(read).then(
      () => toast.show({ variant: "success", label: read ? t.markedRead : t.markedUnread }),
      () => toast.show({ variant: "danger", label: t.markFailed }),
    );
  };
  const open = () => {
    if (!item.read) setRead(true).catch(() => {});
    router.push(inboxItemHref(item.id));
  };
  return (
    <LongPressMenu actions={[{ label: item.read ? t.markUnread : t.markRead, icon: item.read ? "envelope.badge" : "envelope.open", onPress: toggleRead }]}>
      <PressableItem onPress={open} itemClassName="gap-3 py-2.5">
        <ListGroup.ItemPrefix>
          <ActorAvatar item={item} size={36} />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent className="gap-0.5">
          <View className="flex-row items-center gap-1.5">
            {!item.read && (
              <View accessibilityLabel={t.unread}>
                <ColorDot size={6} color="text-brand" />
              </View>
            )}
            <ListGroup.ItemTitle numberOfLines={1} className={cn("flex-1", item.read && "font-normal text-muted")}>
              {title}
            </ListGroup.ItemTitle>
          </View>
          <ListGroup.ItemDescription numberOfLines={1} className={item.read ? "text-subtle" : undefined}>
            {action}
          </ListGroup.ItemDescription>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix className="items-end justify-between gap-1.5 self-stretch py-0.5">
          {item.task ? <TaskStatusIcon status={item.task.status} /> : <View style={{ width: 14, height: 14 }} />}
          <Typography type="body-xs" className="text-subtle" style={{ fontVariant: ["tabular-nums"] }}>
            {ageLabel(new Date(item.createdAt))}
          </Typography>
        </ListGroup.ItemSuffix>
      </PressableItem>
    </LongPressMenu>
  );
}
