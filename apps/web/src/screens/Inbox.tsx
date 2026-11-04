import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { CheckIcon, ChevronLeftIcon, MailIcon, MoreIcon, WarningIcon } from "@/components/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { CardTitle } from "@/components/ui/card";
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

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link to="/" aria-label={t.back} />}
            className="-ml-2 mb-2 md:hidden"
          >
            <ChevronLeftIcon />
          </Button>
          <header className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-xl font-medium">{t.title}</h1>
            <Button variant="secondary" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
              {t.markAllRead}
            </Button>
          </header>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-4">
            <TabsList>
              <TabsTrigger value="all">
                {t.all}
              </TabsTrigger>
              <TabsTrigger value="unread">
                {t.unread}
                {unread > 0 && <Badge variant="secondary">{unread}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {isPending ? (
            <div className="mt-6 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
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
          ) : !data?.items.length ? (
            <Empty className="mt-8">
              <EmptyHeader>
                <EmptyFigure mascot="teal" />
                <EmptyTitle>{filter === "unread" ? t.emptyUnread : t.emptyTitle}</EmptyTitle>
                {filter !== "unread" && <EmptyDescription>{t.empty}</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          ) : (
            byDay(data.items).map(([day, items]) => (
              <ListCard key={day} size="sm" className="mt-6">
                <ListCardHeader>
                  <CardTitle>{day}</CardTitle>
                </ListCardHeader>
                <ListCardRows>
                  {items.map((n) => (
                    <InboxRow key={n.id} item={n} />
                  ))}
                </ListCardRows>
              </ListCard>
            ))
          )}
        </div>
      </div>
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

function InboxRow({ item }: { item: InboxItem }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const mentionables = useMentionables(noAgents);
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const where = onTaskKind(item.kind) ? t.tasks : conv ? conversationTitle(conv, user.id) : null;
  const onTask = item.kind === "task.assigned" || item.kind === "task.done";
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

  return (
    <Item size="sm" role="listitem" className="flex-nowrap items-start">
      <ItemMedia>
        {item.actor?.kind === "agent" ? (
          <AgentAvatar agent={item.actor} className="size-9" />
        ) : item.actor ? (
          <PersonAvatar person={item.actor} className="size-9" />
        ) : (
          <Avatar size="lg">
            <AvatarFallback />
          </Avatar>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 cursor-pointer" onClick={open}>
        <ItemTitle className="w-full min-w-0">
          <span className="min-w-0 truncate">
            <span className="font-medium">{item.actor?.name ?? t.someone}</span> {t.kind[item.kind]}
          </span>
          <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{dateFormat({ hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</span>
        </ItemTitle>
        {body && (
          <ItemDescription>
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

const noAgents: never[] = [];

const onTaskKind = (kind: InboxKind) => kind === "task.assigned" || kind === "task.done";
