import { taskHref } from "@/lib/tasks";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { Avatar } from "heroui-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { Notched, PersonAvatar } from "@/components/conversation-avatar";
import { AtIcon, CheckIcon, ReplyIcon, UserIcon, type IconComponent } from "@/components/icons";
import { conversationTitle } from "@/components/participants";
import { useMe } from "@/components/server-scope";
import { defineMessages } from "@/lib/i18n";
import { useMarkInbox, type InboxItem, type InboxKind } from "@/lib/inbox";
import { conversationsQuery } from "@/lib/queries";

/* apps/web/src/screens/Inbox.tsx: what the list's rows and the opened item share. */

export const inboxMessages = defineMessages({
  en: {
    title: "Inbox",
    priority: "Priority",
    other: "Other",
    markAllRead: "Mark all as read",
    tasks: "My tasks",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    allMarkedRead: "Everything is marked as read.",
    markedRead: "Marked as read.",
    markedUnread: "Marked as unread.",
    markFailed: "Couldn't update the inbox.",
    someone: "Someone",
    unread: "Unread",
    actions: "Actions",
    openConversation: "Open the conversation",
    openTask: "Open the task",
    openTasks: "Open my tasks",
    action: {
      mention: (who: string) => `${who} mentioned you`,
      reply: (who: string) => `${who} replied to you`,
      "task.assigned": (who: string) => `${who} assigned you the task`,
      "task.done": (who: string) => `${who} completed the task`,
    } as Record<InboxKind, (who: string) => string>,
    activity: "Activity",
    created: (assigned: boolean): string => (assigned ? "created the task and assigned it to you" : "created the task"),
    properties: "Properties",
    status: "Status",
    assignees: "Assigned to",
    conversation: "Conversation",
    session: "Session",
    comment: "Leave a comment…",
    tooLarge: "File too large (2 GB max)",
    uploadFailed: "Couldn't attach the file.",
    send: "Send",
    sent: "Reply sent.",
    sendFailed: "Couldn't send the reply.",
    emptyTitle: "Nothing yet",
    empty: "Mentions, replies and tasks that concern you land here.",
    errorTitle: "Inbox unavailable",
    error: "Your inbox can't be reached right now.",
    missing: "This item is no longer in your inbox.",
  },
  fr: {
    title: "Boîte de réception",
    priority: "Prioritaire",
    other: "Autres",
    markAllRead: "Tout marquer comme lu",
    tasks: "Mes tâches",
    markRead: "Marquer comme lu",
    markUnread: "Marquer comme non lu",
    allMarkedRead: "Tout est marqué comme lu.",
    markedRead: "Marqué comme lu.",
    markedUnread: "Marqué comme non lu.",
    markFailed: "Mise à jour impossible.",
    someone: "Quelqu’un",
    unread: "Non lu",
    actions: "Actions",
    openConversation: "Ouvrir la conversation",
    openTask: "Ouvrir la tâche",
    openTasks: "Ouvrir les tâches",
    action: {
      mention: (who: string) => `${who} t’a mentionné`,
      reply: (who: string) => `${who} t’a répondu`,
      "task.assigned": (who: string) => `${who} t’a assigné la tâche`,
      "task.done": (who: string) => `${who} a terminé la tâche`,
    },
    activity: "Activité",
    created: (assigned: boolean) => (assigned ? "a créé la tâche et te l’a assignée" : "a créé la tâche"),
    properties: "Propriétés",
    status: "Statut",
    assignees: "Assignée à",
    conversation: "Conversation",
    session: "Session",
    comment: "Laisser un commentaire…",
    tooLarge: "Fichier trop lourd (2 Go max)",
    uploadFailed: "Fichier non joint.",
    send: "Envoyer",
    sent: "Réponse envoyée.",
    sendFailed: "Réponse non envoyée.",
    emptyTitle: "Rien pour l’instant",
    empty: "Les mentions, réponses et tâches qui te concernent arrivent ici.",
    errorTitle: "Boîte indisponible",
    error: "Ta boîte de réception est injoignable pour le moment.",
    missing: "Cet élément n’est plus dans ta boîte.",
  },
});

const t = inboxMessages;

export type InboxTab = "priority" | "other";
/** Linear's split: what asks for you (mentions, tasks given to you), then the rest. */
export const tabOf = (kind: InboxKind): InboxTab => (kind === "mention" || kind === "task.assigned" ? "priority" : "other");
export const onTaskKind = (kind: InboxKind) => kind === "task.assigned" || kind === "task.done";

const KIND_ICON: Record<InboxKind, IconComponent> = { mention: AtIcon, reply: ReplyIcon, "task.assigned": UserIcon, "task.done": CheckIcon };

export const inboxItemHref = (id: string) => `/inbox/${encodeURIComponent(id)}` as Href;

/** What an item is about and where it leads: its title, its place, and opening it (read on the way). */
export function useInboxItem(item: InboxItem) {
  const me = useMe();
  const mark = useMarkInbox();
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const onTask = onTaskKind(item.kind);
  const place = conv ? conversationTitle(conv, me.id) : null;
  const who = item.actor?.name ?? t.someone;
  // A task by its title; a message by where it was written, its words under it.
  const title = onTask ? (item.task?.title ?? item.text) : (place ?? item.text);
  const action = onTask ? t.action[item.kind](who) : `${who} : ${item.text.replace(/\s+/g, " ")}`;
  const setRead = (read: boolean) => mark.mutateAsync({ ids: [item.id], read });
  /** Where it was said: the task itself (the tasks when it is gone), or the conversation at its message. */
  const open = () => {
    if (!item.read) setRead(true).catch(() => {});
    if (onTask) router.push(item.task ? taskHref(item.task.id) : "/tasks");
    else if (item.conversationId)
      router.push({ pathname: "/c/[conversationId]", params: { conversationId: item.conversationId, ...(item.messageId ? { m: item.messageId } : {}) } });
  };
  return { onTask, place, who, title, action, setRead, open };
}

/** Who did it, what they did as a small mark cut into their avatar's corner. */
export function ActorAvatar({ item, size }: { item: InboxItem; size: number }) {
  const Mark = KIND_ICON[item.kind];
  const badge = Math.round(size * 0.45);
  return (
    <Notched size={size} dotPx={badge} dot={{ color: "text-default", mark: <Mark size={Math.round(badge * 0.62)} strokeWidth={2} className="text-foreground" /> }}>
      {item.actor?.kind === "agent" ? (
        <AgentAvatar agent={item.actor} size={size} />
      ) : item.actor ? (
        <PersonAvatar person={item.actor} size={size} />
      ) : (
        <Avatar alt="" variant="soft" color="default" animation="disable-all" style={{ width: size, height: size }} />
      )}
    </Notched>
  );
}

/** A face of 16 pt beside a name: who wrote, who created. */
export function Face({ author }: { author: InboxItem["actor"] }) {
  if (!author) return null;
  return author.kind === "agent" ? <AgentAvatar agent={author} size={16} /> : <PersonAvatar person={author} size={16} />;
}
