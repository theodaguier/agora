import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { AtIcon, CheckCircleIcon, CheckIcon, ChevronLeftIcon, InboxIcon, MailIcon, MoreIcon, ReplyIcon, TaskListIcon, WarningIcon } from "@/components/icons";
import { useWide } from "@/components/CodeSession";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyFigure } from "@/components/EmptyFigure";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { useOrgTitle } from "@/lib/org";
import { dateFormat } from "@/lib/intl";
import { api, type InboxItem, type InboxKind } from "@/lib/api";
import { dayLabel } from "@/lib/dates";
import { MentionText } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { conversationsQuery, inboxQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    title: "Inbox",
    back: "Back",
    all: "All",
    unread: "Unread",
    markAllRead: "Mark all as read",
    tasks: "My tasks",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    allMarkedRead: "Everything is marked as read.",
    markedRead: "Marked as read.",
    markedUnread: "Marked as unread.",
    markFailed: "Couldn't update the inbox.",
    actions: "Notification actions",
    someone: "Someone",
    kind: {
      mention: "mentioned you",
      reply: "replied to your message",
      "task.assigned": "assigned you a task",
      "task.done": "completed a task you created",
    } as Record<InboxKind, string>,
    emptyTitle: "Nothing yet",
    empty: "Mentions, replies and tasks that concern you land here.",
    emptyUnread: "You're all caught up",
    errorTitle: "Inbox unavailable",
    error: "Your inbox can't be reached right now.",
    openConversation: "Open the conversation",
    openTasks: "Open my tasks",
    pick: "Pick an item to see it here.",
  },
  fr: {
    title: "Boîte de réception",
    back: "Retour",
    all: "Toutes",
    unread: "Non lues",
    markAllRead: "Tout marquer comme lu",
    tasks: "Mes tâches",
    markRead: "Marquer comme lu",
    markUnread: "Marquer comme non lu",
    allMarkedRead: "Tout est marqué comme lu.",
    markedRead: "Marqué comme lu.",
    markedUnread: "Marqué comme non lu.",
    markFailed: "Mise à jour impossible.",
    actions: "Actions de la notification",
    someone: "Quelqu'un",
    kind: {
      mention: "t'a mentionné",
      reply: "a répondu à ton message",
      "task.assigned": "t'a assigné une tâche",
      "task.done": "a terminé une tâche que tu as créée",
    },
    emptyTitle: "Rien pour l'instant",
    empty: "Les mentions, réponses et tâches qui te concernent arrivent ici.",
    emptyUnread: "Tout est lu",
    errorTitle: "Boîte indisponible",
    error: "Ta boîte de réception est injoignable pour le moment.",
    openConversation: "Ouvrir la conversation",
    openTasks: "Ouvrir les tâches",
    pick: "Choisis un élément pour le voir ici.",
  },
});

type Filter = "all" | "unread";

/** Mentions, replies and tasks that concern you, newest first. */
export function Inbox() {
  const t = useT(messages);
  useOrgTitle(t.title);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const c = useT(common);
  const { data, isPending, isError, error, refetch } = useQuery(inboxQuery(filter === "unread"));
  const unread = data?.unread ?? 0;

  const markAll = useMutation({
    mutationFn: () => api("/inbox/read", { method: "POST", body: JSON.stringify({}) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
    meta: { success: t.allMarkedRead, error: t.markFailed },
  });

  // Large screens: the list on the left, the picked item on the right (Linear's inbox); smaller ones open it directly.
  const wide = useWide();
  const [picked, setPicked] = useState<string | null>(null);
  const items = data?.items ?? [];
  const selected = items.find((i) => i.id === picked) ?? (wide ? items[0] : undefined);

  return (
    <section className="flex h-full min-w-0 flex-1 bg-background">
      <div className={cn("flex min-h-0 min-w-0 flex-col", wide ? "w-md shrink-0 border-r" : "flex-1")}>
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="md:hidden">
            <ChevronLeftIcon />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-medium">{t.title}</h1>
          <Button variant="ghost" size="sm" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
            {t.markAllRead}
          </Button>
        </header>
        <div className="px-3 pt-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">{t.all}</TabsTrigger>
              <TabsTrigger value="unread">
                {t.unread}
                {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-6">
          {isPending ? (
            <div className="flex flex-col gap-2 px-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <Empty className="mt-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WarningIcon />
                </EmptyMedia>
                <EmptyTitle>{t.errorTitle}</EmptyTitle>
                <EmptyDescription title={error.message}>{t.error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="secondary" onClick={() => void refetch()}>
                  {c.retry}
                </Button>
              </EmptyContent>
            </Empty>
          ) : !items.length ? (
            <Empty className="mt-8">
              <EmptyHeader>
                <EmptyFigure mascot="teal" />
                <EmptyTitle>{filter === "unread" ? t.emptyUnread : t.emptyTitle}</EmptyTitle>
                {filter !== "unread" && <EmptyDescription>{t.empty}</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          ) : (
            byDay(items).map(([day, dayItems]) => (
              <div key={day} role="list" aria-label={day} className="flex flex-col gap-0.5 pt-3">
                <p className="px-3 pb-1 text-xs text-muted-foreground">{day}</p>
                {dayItems.map((n) => (
                  <InboxRow key={n.id} item={n} selected={wide && selected?.id === n.id} onPick={wide ? () => setPicked(n.id) : undefined} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {wide && <InboxPreview item={selected} />}
    </section>
  );
}

/** Items grouped under their day ("Today", "Yesterday"…), newest first. */
function byDay(items: InboxItem[]) {
  const groups = new Map<string, InboxItem[]>();
  for (const item of items) {
    const day = dayLabel(new Date(item.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups];
}

const KIND_ICON: Record<InboxKind, typeof AtIcon> = { mention: AtIcon, reply: ReplyIcon, "task.assigned": TaskListIcon, "task.done": CheckCircleIcon };

/** What an item is about and where it leads: its text, its place, and opening it (read on the way). */
function useInboxItem(item: InboxItem) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const onTask = onTaskKind(item.kind);
  const where = onTask ? t.tasks : conv ? conversationTitle(conv, user.id) : null;
  const body = onTask ? (item.task?.title ?? item.text) : item.text;
  // From the menu: said with a toast (the row may leave the "Unread" list meanwhile); opening the item says nothing.
  const setRead = useMutation({
    mutationFn: ({ read }: { read: boolean; menu?: boolean }) => api("/inbox/read", { method: "POST", body: JSON.stringify({ ids: [item.id], read }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
    meta: { success: (_: unknown, v: { read: boolean; menu?: boolean }) => (v.menu ? (v.read ? t.markedRead : t.markedUnread) : undefined), error: t.markFailed },
  });
  const open = () => {
    if (!item.read) setRead.mutate({ read: true });
    if (onTask) navigate({ to: "/tasks" });
    else if (item.conversationId)
      navigate({ to: "/c/$conversationId", params: { conversationId: item.conversationId }, search: item.messageId ? { m: item.messageId } : {} });
  };
  return { onTask, where, body, setRead, open };
}

/** Who did it, with what they did as a small mark on their avatar. */
function ActorAvatar({ item, className }: { item: InboxItem; className: string }) {
  const Mark = KIND_ICON[item.kind];
  return (
    <span className="relative shrink-0">
      {item.actor?.kind === "agent" ? (
        <AgentAvatar agent={item.actor} className={className} />
      ) : item.actor ? (
        <PersonAvatar person={item.actor} className={className} />
      ) : (
        <Avatar size="lg">
          <AvatarFallback />
        </Avatar>
      )}
      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-muted ring-2 ring-background">
        <Mark className="size-2.5" />
      </span>
    </span>
  );
}

/** A row: who and what, its text, then when; read ones fade. `onPick`: shown in the preview instead of opened. */
function InboxRow({ item, selected, onPick }: { item: InboxItem; selected?: boolean; onPick?: () => void }) {
  const t = useT(messages);
  const mentionables = useMentionables(noAgents);
  const { where, body, setRead, open } = useInboxItem(item);
  return (
    <Item size="sm" role="listitem" className={cn("flex-nowrap items-start rounded-lg", selected && "bg-muted", item.read && !selected && "opacity-60")}>
      <ItemMedia>
        <ActorAvatar item={item} className="size-8" />
      </ItemMedia>
      <ItemContent
        className="min-w-0 cursor-pointer"
        onClick={() => {
          if (!onPick) return open();
          onPick();
          if (!item.read) setRead.mutate({ read: true });
        }}
      >
        <ItemTitle className="w-full min-w-0">
          <span className="min-w-0 truncate">
            <span className="font-medium">{item.actor?.name ?? t.someone}</span> {t.kind[item.kind]}
          </span>
          <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{dateFormat({ hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</span>
        </ItemTitle>
        {body && (
          <ItemDescription className="line-clamp-1">
            <MentionText text={body} mentionables={mentionables} />
          </ItemDescription>
        )}
        {where && <p className="truncate text-xs text-muted-foreground">{where}</p>}
      </ItemContent>
      <ItemActions className="gap-1 self-start">
        {/* Always there, so times line up whether a row is read or not. */}
        <span className={cn("size-2 rounded-full bg-brand", item.read && "invisible")} aria-label={item.read ? undefined : t.unread} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t.actions} />}>
            <MoreIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRead.mutate({ read: !item.read, menu: true })}>
              {item.read ? <MailIcon /> : <CheckIcon />}
              {item.read ? t.markUnread : t.markRead}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

/** The picked item, whole: who, where and when, its text, then the way to it. */
function InboxPreview({ item }: { item?: InboxItem }) {
  const t = useT(messages);
  if (!item) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyDescription>{t.pick}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <InboxItemView key={item.id} item={item} />;
}

function InboxItemView({ item }: { item: InboxItem }) {
  const t = useT(messages);
  const mentionables = useMentionables(noAgents);
  const { onTask, where, body, setRead, open } = useInboxItem(item);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-10 py-8">
      <div className="flex items-center gap-3">
        <ActorAvatar item={item} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-medium">{item.actor?.name ?? t.someone}</span> {t.kind[item.kind]}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[where, dateFormat({ dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>
      {body && (
        <div className="rounded-lg border bg-card px-4 py-3 text-sm leading-relaxed">
          <MentionText text={body} mentionables={mentionables} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={open}>{onTask ? t.openTasks : t.openConversation}</Button>
        <Button variant="outline" onClick={() => setRead.mutate({ read: !item.read, menu: true })}>
          {item.read ? t.markUnread : t.markRead}
        </Button>
      </div>
    </div>
  );
}

const noAgents: never[] = [];

const onTaskKind = (kind: InboxKind) => kind === "task.assigned" || kind === "task.done";
