import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { TaskStatusIcon } from "@/components/Marks";
import { MessageText } from "@/components/MessageText";
import { conversationTitle } from "@/lib/participants";
import { ArrowUpIcon, AtIcon, CheckIcon, ChevronLeftIcon, CloseIcon, InboxIcon, MailIcon, MoreIcon, PanelRightIcon, PaperclipIcon, ReplyIcon, SlidersIcon, TerminalIcon, UserIcon, WarningIcon } from "@/components/icons";
import { useWide } from "@/components/CodeSession";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { useOrgTitle } from "@/lib/org";
import { api, sendMessage, uploadAttachment, type Attachment, type InboxItem, type InboxKind, type Message, type TaskStatus } from "@/lib/api";
import { ageLabel } from "@/lib/dates";
import { conversationsQuery, inboxQuery, messagesQuery, tasksQuery } from "@/lib/queries";
import { codeSessionsQuery } from "@/lib/code-sessions";
import { ModelLogo } from "@/components/ProviderLogo";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    title: "Inbox",
    back: "Back",
    priority: "Priority",
    other: "Other",
    display: "Display",
    markAllRead: "Mark all as read",
    tasks: "My tasks",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    allMarkedRead: "Everything is marked as read.",
    markedRead: "Marked as read.",
    markedUnread: "Marked as unread.",
    markFailed: "Couldn't update the inbox.",
    actions: "Actions",
    someone: "Someone",
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
    toggleProperties: "Show or hide the properties",
    comment: "Leave a comment…",
    removeFile: (name: string) => `Remove ${name}`,
    uploadFailed: "Couldn't attach the file.",
    statusLabel: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    attach: "Attach a file",
    send: "Send",
    sent: "Reply sent.",
    sendFailed: "Couldn't send the reply.",
    emptyTitle: "Nothing yet",
    empty: "Mentions, replies and tasks that concern you land here.",
    errorTitle: "Inbox unavailable",
    error: "Your inbox can't be reached right now.",
    openConversation: "Open the conversation",
    openTasks: "Open my tasks",
    pick: "Pick an item to see it here.",
  },
  fr: {
    title: "Boîte de réception",
    back: "Retour",
    priority: "Prioritaire",
    other: "Autres",
    display: "Affichage",
    markAllRead: "Tout marquer comme lu",
    tasks: "Mes tâches",
    markRead: "Marquer comme lu",
    markUnread: "Marquer comme non lu",
    allMarkedRead: "Tout est marqué comme lu.",
    markedRead: "Marqué comme lu.",
    markedUnread: "Marqué comme non lu.",
    markFailed: "Mise à jour impossible.",
    actions: "Actions",
    someone: "Quelqu’un",
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
    toggleProperties: "Afficher ou masquer les propriétés",
    comment: "Laisser un commentaire…",
    removeFile: (name: string) => `Retirer ${name}`,
    uploadFailed: "Fichier non joint.",
    statusLabel: { todo: "À faire", in_progress: "En cours", done: "Terminée" },
    attach: "Joindre un fichier",
    send: "Envoyer",
    sent: "Réponse envoyée.",
    sendFailed: "Réponse non envoyée.",
    emptyTitle: "Rien pour l’instant",
    empty: "Les mentions, réponses et tâches qui te concernent arrivent ici.",
    errorTitle: "Boîte indisponible",
    error: "Ta boîte de réception est injoignable pour le moment.",
    openConversation: "Ouvrir la conversation",
    openTasks: "Ouvrir les tâches",
    pick: "Choisis un élément pour le voir ici.",
  },
});

type Tab = "priority" | "other";
/** Linear's split: what asks for you (mentions, tasks given to you), then the rest. */
const tabOf = (kind: InboxKind): Tab => (kind === "mention" || kind === "task.assigned" ? "priority" : "other");
const onTaskKind = (kind: InboxKind) => kind === "task.assigned" || kind === "task.done";
const KIND_ICON: Record<InboxKind, typeof AtIcon> = { mention: AtIcon, reply: ReplyIcon, "task.assigned": UserIcon, "task.done": CheckIcon };

/**
 * Figma « Boîte de réception · 1440 » (Atelier · Théo, section 5): the list beside the item it opens,
 * as Linear's inbox. Narrow screens show the list and open items directly.
 */
export function Inbox() {
  const t = useT(messages);
  useOrgTitle(t.title);
  const qc = useQueryClient();
  const c = useT(common);
  const { data, isPending, isError, error, refetch } = useQuery(inboxQuery());
  const items = data?.items ?? [];
  const [tab, setTab] = useState<Tab>("priority");
  const shown = items.filter((i) => tabOf(i.kind) === tab);
  const wide = useWide();
  const [picked, setPicked] = useState<string | null>(null);
  const selected = shown.find((i) => i.id === picked) ?? (wide ? shown[0] : undefined);
  const markAll = useMutation({
    mutationFn: () => api("/inbox/read", { method: "POST", body: JSON.stringify({}) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
    meta: { success: t.allMarkedRead, error: t.markFailed },
  });

  return (
    <section className="flex h-full min-w-0 flex-1 bg-background">
      <div className={cn("flex min-h-0 min-w-0 flex-col", wide ? "w-96 shrink-0 border-r" : "flex-1")}>
        <header className="flex h-11.5 shrink-0 items-center gap-2 border-b pr-3.5 pl-4.5">
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="-ml-2 md:hidden">
            <ChevronLeftIcon />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-ui font-medium">{t.title}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.display} />}>
              <SlidersIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={!data?.unread || markAll.isPending} onClick={() => markAll.mutate()}>
                  <CheckIcon /> {t.markAllRead}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="flex gap-1.5 px-4.5 pt-3 pb-2.5" role="tablist">
          {(["priority", "other"] as const).map((key) => (
            <Button
              key={key}
              role="tab"
              aria-selected={tab === key}
              variant="outline"
              size="sm"
              onClick={() => setTab(key)}
              className={cn("h-6.5 gap-1.5 rounded-full px-2.75 text-ui font-normal", tab === key ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground")}
            >
              {t[key]}
              <span className="text-subtle-foreground tabular-nums">{items.filter((i) => tabOf(i.kind) === key).length}</span>
            </Button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {isPending ? (
            <div className="flex flex-col gap-2 px-2.5 pt-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
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
          ) : !shown.length ? (
            <Empty className="mt-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                <EmptyDescription>{t.empty}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {shown.map((n) => (
                <InboxRow key={n.id} item={n} selected={wide && selected?.id === n.id} onPick={wide ? () => setPicked(n.id) : undefined} />
              ))}
            </ul>
          )}
        </div>
      </div>
      {wide &&
        (selected ? (
          <InboxItemView key={selected.id} item={selected} />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyDescription>{t.pick}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ))}
    </section>
  );
}

/** What an item is about and where it leads: its title, its place, and opening it (read on the way). */
function useInboxItem(item: InboxItem) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = item.conversationId ? conversations?.find((c) => c.id === item.conversationId) : undefined;
  const onTask = onTaskKind(item.kind);
  const place = conv ? conversationTitle(conv, user.id) : null;
  const who = item.actor?.name ?? t.someone;
  // A task by its title; a message by where it was written, its words under it.
  const title = onTask ? (item.task?.title ?? item.text) : (place ?? item.text);
  const action = onTask ? t.action[item.kind](who) : `${who} : ${item.text.replace(/\s+/g, " ")}`;
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
  return { onTask, place, who, title, action, setRead, open };
}

/** Who did it, what they did as a small mark cut into their avatar's corner. */
function ActorAvatar({ item, size, ring }: { item: InboxItem; size: string; ring: string }) {
  const Mark = KIND_ICON[item.kind];
  return (
    <span className="relative shrink-0">
      {item.actor?.kind === "agent" ? (
        <AgentAvatar agent={item.actor} className={size} />
      ) : item.actor ? (
        <PersonAvatar person={item.actor} className={size} />
      ) : (
        <Avatar className={size}>
          <AvatarFallback />
        </Avatar>
      )}
      <span className={cn("absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full p-0.5", ring)}>
        <span className="flex size-full items-center justify-center rounded-full bg-accent text-foreground">
          <Mark className="size-2.5" />
        </span>
      </span>
    </span>
  );
}

/** A row: the avatar, the title over what happened, the task's state and the age on the right. */
function InboxRow({ item, selected, onPick }: { item: InboxItem; selected?: boolean; onPick?: () => void }) {
  const { title, action, setRead, open } = useInboxItem(item);
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (!onPick) return open();
          onPick();
          if (!item.read) setRead.mutate({ read: true });
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg py-2.25 pr-3 pl-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          selected ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        <ActorAvatar item={item} size="size-8" ring={selected ? "bg-muted" : "bg-background"} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {!item.read && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
            <span className={cn("truncate text-ui", item.read ? "text-muted-foreground" : "font-medium")}>{title}</span>
          </span>
          <span className={cn("truncate text-ui", item.read ? "text-subtle-foreground" : "text-muted-foreground")}>{action}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 self-stretch">
          {item.task ? <TaskStatusIcon status={item.task.status} /> : <span className="size-3.5" />}
          <span className="text-xs text-subtle-foreground tabular-nums">{ageLabel(new Date(item.createdAt))}</span>
        </span>
      </button>
    </li>
  );
}

/** The item opened beside the list (Figma): where it comes from, its title, the activity, then its properties. */
function InboxItemView({ item }: { item: InboxItem }) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  const { onTask, place, title, setRead, open } = useInboxItem(item);
  const { data: tasks } = useQuery({ ...tasksQuery(user.id), enabled: onTask });
  const task = item.task ? tasks?.find((x) => x.id === item.task!.id) : undefined;
  // A task's notification may not say where it came from; the task does.
  const conversationId = item.conversationId ?? task?.conversationId ?? null;
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = conversationId ? conversations?.find((c) => c.id === conversationId) : undefined;
  const convName = conv ? conversationTitle(conv, user.id) : place;
  const { data: thread = [] } = useQuery({ ...messagesQuery(conversationId ?? ""), enabled: !!conversationId });
  // The words behind the item: the message itself, or for a task the last thing its author said there.
  const said: Message | undefined = item.messageId
    ? thread.find((m) => m.id === item.messageId)
    : [...thread].reverse().find((m) => m.kind === "bot" && m.author?.id === item.actor?.id && m.text);
  const replyTo = conversationId ? (item.actor?.name ?? convName) : null;
  // The code session it is about: the last one its author started in that conversation.
  const session = [...thread].reverse().find((m) => m.author?.id === item.actor?.id && m.data?.codeSessions?.length)?.data?.codeSessions?.at(-1);
  // Who codes it (Claude Code, Codex): its logo beside its title, as everywhere a session shows.
  const { data: sessions } = useQuery({ ...codeSessionsQuery(conversationId ?? ""), enabled: !!session && !!conversationId });
  const engine = session ? sessions?.find((x) => x.id === session.id)?.engine : undefined;
  const [properties, setProperties] = useState(true);
  // Only what the page doesn't already say: who wrote it is on its card, a message's conversation is its title.
  const showConversation = onTask && !!convName && !!conversationId;
  const hasProperties = !!item.task || (!!task && task.assignees.length > 0) || (!!session && !!conversationId) || showConversation;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-11.5 shrink-0 items-center gap-2 border-b pr-3.5 pl-12">
        <button type="button" onClick={open} className="truncate text-ui text-muted-foreground hover:text-foreground">
          {onTask ? t.tasks : place}
        </button>
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} className="text-muted-foreground" />}>
            <MoreIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={open}>
                {onTask ? <CheckIcon /> : <ReplyIcon />} {onTask ? t.openTasks : t.openConversation}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRead.mutate({ read: !item.read, menu: true })}>
                {item.read ? <MailIcon /> : <CheckIcon />} {item.read ? t.markUnread : t.markRead}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasProperties && (
          <Button variant="ghost" size="icon-sm" aria-label={t.toggleProperties} aria-pressed={properties} onClick={() => setProperties((v) => !v)} className="hidden text-muted-foreground xl:inline-flex">
            <PanelRightIcon />
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-12 pt-11 pb-10">
          <div className="flex max-w-2xl flex-col gap-7">
            <h2 className="max-w-xs text-title font-semibold tracking-tight">{title}</h2>
            <section className="flex flex-col gap-3.5" aria-label={t.activity}>
              <h3 className="text-ui font-medium">{t.activity}</h3>
              {onTask && (
                <p className="flex items-center gap-1.5 text-ui">
                  <Face author={item.actor} />
                  <span className="font-medium">{item.actor?.name ?? t.someone}</span>
                  <span className="text-muted-foreground">{t.created(item.kind === "task.assigned")}</span>
                  <span className="text-subtle-foreground">· {ageLabel(new Date(item.createdAt))}</span>
                </p>
              )}
              {said && (
                <article className="flex flex-col gap-3 rounded-lg border bg-card px-4 pt-3.5 pb-4">
                  <p className="flex items-center gap-2 text-ui">
                    <Face author={said.author} />
                    <span className="font-medium">{said.author?.name ?? t.someone}</span>
                    <span className="text-subtle-foreground">{ageLabel(new Date(said.createdAt))}</span>
                  </p>
                  <MessageText text={said.text} plain={said.kind === "user"} className="text-sm" />
                </article>
              )}
              {replyTo && conversationId && <Reply conversationId={conversationId} mention={item.actor?.kind === "agent" ? item.actor.id : undefined} />}
            </section>
          </div>
        </div>
        {hasProperties && (
          <aside className={cn("hidden w-68 shrink-0 flex-col border-l px-5 pt-11.5", properties && "xl:flex")} aria-label={t.properties}>
            <h3 className="pb-2 text-xs font-medium text-subtle-foreground">{t.properties}</h3>
            {item.task && (
              <Property label={t.status}>
                <Mark>
                  <TaskStatusIcon status={item.task.status} />
                </Mark>
                <span className="truncate">{t.statusLabel[item.task.status]}</span>
              </Property>
            )}
            {task && task.assignees.length > 0 && (
              <Property label={t.assignees}>
                <span className="flex min-w-0 flex-col">
                  {task.assignees.map((a) => (
                    <span key={a.id} className="flex h-8 min-w-0 items-center gap-2">
                      <Mark>
                        <PersonAvatar person={{ id: a.id, name: a.name, image: a.image }} className="size-4" />
                      </Mark>
                      <span className="truncate">{a.name}</span>
                    </span>
                  ))}
                </span>
              </Property>
            )}
            {session && conversationId ? (
              <Property label={t.session}>
                <Mark>{engine ? <ModelLogo provider={engine} className="size-3.5" /> : <TerminalIcon className="size-3.5 text-muted-foreground" />}</Mark>
                <Link to="/c/$conversationId/code/$sessionId" params={{ conversationId, sessionId: session.id }} title={session.title} className="truncate hover:underline">
                  {session.title}
                </Link>
              </Property>
            ) : showConversation && (
              <Property label={t.conversation}>
                <Link to="/c/$conversationId" params={{ conversationId: conversationId! }} className="truncate hover:underline">
                  {convName}
                </Link>
              </Property>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** A property on one line, as Linear's: its name in grey, then its value after a 16 px mark, cut if long. */
function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start text-ui">
      <span className="flex h-8 w-23 shrink-0 items-center text-muted-foreground">{label}</span>
      <span className="flex min-h-8 min-w-0 flex-1 items-center gap-2">{children}</span>
    </div>
  );
}

/** The slot of a value's mark: 16 px, whatever it holds (a state, a face, a logo), so the words line up. */
function Mark({ children }: { children: React.ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

function Face({ author }: { author: Message["author"] | InboxItem["actor"] }) {
  if (!author) return null;
  return author.kind === "agent" ? <AgentAvatar agent={author} className="size-4" /> : <PersonAvatar person={author} className="size-4" />;
}

/** Answering where it was said, from here: the conversation gets the reply (files too), the bot is called when it's one. */
function Reply({ conversationId, mention }: { conversationId: string; mention?: string }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (list: File[]) => Promise.all(list.map((f) => uploadAttachment(conversationId, f))),
    onSuccess: (added) => setFiles((prev) => [...prev, ...added]),
    meta: { error: t.uploadFailed },
  });
  const send = useMutation({
    mutationFn: () => sendMessage(conversationId, { text: text.trim(), attachmentIds: files.map((f) => f.id), invocations: [], mentions: mention ? [mention] : [] }),
    onSuccess: () => {
      setText("");
      setFiles([]);
      void qc.invalidateQueries({ queryKey: messagesQuery(conversationId).queryKey });
    },
    meta: { success: t.sent, error: t.sendFailed },
  });
  const ready = (text.trim() || files.length > 0) && !upload.isPending && !send.isPending;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) send.mutate();
      }}
    >
      <InputGroup className="rounded-lg bg-transparent dark:bg-transparent">
        {files.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
            {files.map((f) => (
              <span key={f.id} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                <span className="max-w-40 truncate">{f.name}</span>
                <InputGroupButton size="icon-xs" aria-label={t.removeFile(f.name)} onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}>
                  <CloseIcon />
                </InputGroupButton>
              </span>
            ))}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (ready) send.mutate();
            }
          }}
          placeholder={t.comment}
          rows={1}
          className="min-h-11 py-3 pl-4"
        />
        <InputGroupAddon align="inline-end" className="gap-2.5 self-center pr-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = "";
              if (list.length) upload.mutate(list);
            }}
          />
          <InputGroupButton size="icon-xs" aria-label={t.attach} onClick={() => picker.current?.click()} className="text-muted-foreground">
            <PaperclipIcon />
          </InputGroupButton>
          <InputGroupButton type="submit" variant={ready ? "default" : "secondary"} size="icon-sm" className="rounded-full disabled:opacity-100 disabled:text-subtle-foreground" aria-label={t.send} disabled={!ready}>
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
