import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { ChevronLeftIcon, InboxIcon, MoreIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defineMessages, useT } from "@/i18n";
import { relativeTimeFormat } from "@/lib/intl";
import { api, type InboxItem, type InboxKind } from "@/lib/api";
import { dividerLabel } from "@/lib/dates";
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
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    actions: "Notification actions",
    someone: "Someone",
    justNow: "Just now",
    kind: {
      mention: "mentioned you",
      reply: "replied to your message",
      "task.assigned": "assigned you a task",
      "task.done": "completed a task you created",
    } as Record<InboxKind, string>,
    empty: "Nothing yet. Mentions, replies and tasks that concern you land here.",
    emptyUnread: "You're all caught up.",
  },
  fr: {
    title: "Boîte de réception",
    back: "Retour",
    all: "Toutes",
    unread: "Non lues",
    markAllRead: "Tout marquer comme lu",
    markRead: "Marquer comme lu",
    markUnread: "Marquer comme non lu",
    actions: "Actions de la notification",
    someone: "Quelqu'un",
    justNow: "À l'instant",
    kind: {
      mention: "t'a mentionné",
      reply: "a répondu à ton message",
      "task.assigned": "t'a assigné une tâche",
      "task.done": "a terminé une tâche que tu as créée",
    },
    empty: "Rien pour l'instant. Les mentions, réponses et tâches qui te concernent arrivent ici.",
    emptyUnread: "Tout est lu.",
  },
});

type Filter = "all" | "unread";

/** Mentions, replies and tasks that concern you, newest first. */
export function Inbox() {
  const t = useT(messages);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isPending } = useQuery(inboxQuery(filter === "unread"));
  const unread = data?.unread ?? 0;

  const markAll = useMutation({
    mutationFn: () => api("/inbox/read", { method: "POST", body: JSON.stringify({}) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border/60 px-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link to="/" aria-label={t.back} />}
          className="-ml-1 rounded-lg hover:bg-transparent md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
        <h1 className="truncate text-[15px] font-medium">{t.title}</h1>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
          {t.markAllRead}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">{t.all}</TabsTrigger>
              <TabsTrigger value="unread" className="gap-1.5">
                {t.unread}
                {unread > 0 && <span className="text-muted-foreground tabular-nums">{unread}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {isPending ? (
            <ItemGroup className="gap-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </ItemGroup>
          ) : !data?.items.length ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyDescription>{filter === "unread" ? t.emptyUnread : t.empty}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-1">
              {data.items.map((n) => (
                <InboxRow key={n.id} item={n} />
              ))}
            </ItemGroup>
          )}
        </div>
      </div>
    </section>
  );
}

/** "Just now", "5 min ago", "3 h ago", then "Yesterday 17:42" / "Sep 12 09:15". */
function sinceLabel(date: Date, justNow: string) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return justNow;
  const rtf = relativeTimeFormat({ numeric: "always", style: "short" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 6 * 60) return rtf.format(-Math.floor(minutes / 60), "hour");
  return dividerLabel(date);
}

function InboxRow({ item }: { item: InboxItem }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const mentionables = useMentionables(noAgents);
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const where = conv && conv.kind === "group" ? conversationTitle(conv, user.id) : null;
  const onTask = item.kind === "task.assigned" || item.kind === "task.done";
  const body = onTask ? (item.task?.title ?? item.text) : item.text;

  const setRead = useMutation({
    mutationFn: (read: boolean) => api("/inbox/read", { method: "POST", body: JSON.stringify({ ids: [item.id], read }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });

  const open = () => {
    if (!item.read) setRead.mutate(true);
    if (onTask) navigate({ to: "/tasks" });
    else if (item.conversationId)
      navigate({ to: "/c/$conversationId", params: { conversationId: item.conversationId }, search: item.messageId ? { m: item.messageId } : {} });
  };

  return (
    <Item size="sm" className={cn("flex-nowrap items-start px-3 hover:bg-muted/50", !item.read && "bg-muted/40")}>
      <ItemMedia className="pt-0.5">
        {item.actor?.kind === "agent" ? (
          <AgentAvatar agent={item.actor} className="size-8" />
        ) : item.actor ? (
          <PersonAvatar person={item.actor} className="size-8" />
        ) : (
          <span className="size-8 rounded-full bg-muted" />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 cursor-pointer" onClick={open}>
        <ItemTitle className="w-full min-w-0 font-normal">
          <span className="min-w-0 truncate">
            <span className="font-medium">{item.actor?.name ?? t.someone}</span> {t.kind[item.kind]}
            {where && <span className="text-muted-foreground"> · {where}</span>}
          </span>
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">{sinceLabel(new Date(item.createdAt), t.justNow)}</span>
        </ItemTitle>
        {body && (
          <ItemDescription className={cn("line-clamp-2", onTask && item.task?.status === "done" && "line-through")}>
            <MentionText text={body} mentionables={mentionables} />
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions className="gap-1 self-center">
        {/* Always there, so times line up whether a row is read or not. */}
        <span className={cn("size-2 rounded-full bg-brand", item.read && "invisible")} aria-label={item.read ? undefined : t.unread} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} />}>
            <MoreIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRead.mutate(!item.read)}>{item.read ? t.markUnread : t.markRead}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

const noAgents: never[] = [];
