import { defineMessages, useT } from "@/i18n";
import { useEventText } from "@/i18n/events";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronsLeftIcon, FilesIcon, PinIcon, SearchIcon } from "@/components/icons";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AuthorLine, BotBubble, DateDivider, ToolLine, TypingBubble } from "@/components/Bubbles";
import { ApprovalCard, ApprovalLog } from "@/components/ApprovalCard";
import { ChoiceCard } from "@/components/ChoiceCard";
import { McpRequestCard } from "@/components/McpRequestCard";
import { QuestionsCard } from "@/components/QuestionsCard";
import { SkillRequestCard } from "@/components/SkillRequestCard";
import { ViewCard } from "@/components/views/ViewCard";
import { insertMessage, type ViewAction } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Composer, type ComposerHandle } from "@/components/Composer";
import { ConversationAvatar, ParticipantAvatar, PersonAvatar, useStatus } from "@/components/ConversationAvatar";
import { conversationTitle, othersOf, type Participant } from "@/lib/participants";
import { ConversationPanel, PinnedBar, usePanelLabels, usePins, type PanelKind } from "@/components/ConversationPanels";
import { ForwardDialog } from "@/components/ForwardDialog";
import { MembersPanel } from "@/components/MembersPanel";
import { PersonPanel } from "@/components/PersonPanel";
import { ChatMessage, MessageRow, PendingRow } from "@/components/MessageParts";
import { RightPanel } from "@/components/RightPanel";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  api,
  ApiError,
  conversationPath,
  sendMessage,
  type Attachment,
  type AgentSummary,
  type Author,
  type ActiveTurn,
  type ConversationDetail,
  type Invocation,
  type Message,
  type Person,
  type ReplyTo,
} from "@/lib/api";
import { dividerLabel, needsDivider } from "@/lib/dates";
import { ConversationFilesProvider } from "@/lib/conversation-files";
import { conversationQuery, conversationsQuery, messagesQuery } from "@/lib/queries";
import { seedTurns, useTurns, useTyping } from "@/lib/realtime";
import { useOrgTitle } from "@/lib/org";
import { openAgentProfile, openProfile } from "@/lib/profile";
import type { Mentionable } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { shortcuts, useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** Distance from the bottom under which the conversation still follows new messages. */
const STICK_PX = 80;
/** Minimum interval between two "is typing" signals. */
const TYPING_EVERY_MS = 3_000;

type Sending = {
  key: string;
  text: string;
  attachments: (Attachment & { previewUrl?: string })[];
  invocations: Invocation[];
  replyTo?: ReplyTo;
  failed?: boolean;
  /** Once sent: the message's id, kept until it is in the list so the swap doesn't blink. */
  id?: string;
};

/** Messages that came in after the conversation opened: only those rise into place. */
function useArrivals(conversationId: string, messages: Message[], loading: boolean) {
  const initial = useRef<{ conversationId: string; ids: Set<string> } | null>(null);
  if (!loading && initial.current?.conversationId !== conversationId) initial.current = { conversationId, ids: new Set(messages.map((m) => m.id)) };
  return (id: string) => initial.current?.conversationId === conversationId && !initial.current.ids.has(id);
}

/** What the composer shows of the message being answered (the API keeps its own snapshot). */
const quoteOf = (m: Message): ReplyTo => {
  const first = m.data?.attachments?.[0];
  return {
    id: m.id,
    authorName: m.author?.name ?? "?",
    text: m.text.replace(/\s+/g, " ").trim().slice(0, 280),
    ...(first && {
      attachment: { id: first.id, name: first.name, mime: first.mime },
    }),
  };
};

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");

const authorKey = (a: Author) => (a ? `${a.kind}:${a.id}` : "event");

const strings = defineMessages({
  en: {
    sendFailed: "Message not sent. Try again.",
    gone: "This conversation no longer exists or you're no longer part of it.",
    unavailable: "Conversation unavailable.",
    messageTo: (name: string) => `Message ${name}`,
    writeGroupMention: "Message the group (@ to call a bot)",
    writeGroup: "Message the group",
    dropTo: (name: string) => `Drop your files to send them to ${name}`,
    dropToGroup: "Drop your files to send them to the group",
    back: "Back",
    showPanel: "Show panel",
    emptyHint: "Send a first message to get started.",
    theBot: "The bot",
    botTyping: (name: string) => `${name} is typing…`,
    peopleTyping: (names: string, n: number) => `${names} ${n > 1 ? "are" : "is"} typing…`,
    stop: "Stop response",
    seeMembers: (n: number) => (n === 1 ? "See 1 member" : `See ${n} members`),
    openProfile: (name: string) => `See ${name}'s profile and tasks`,
  },
  fr: {
    sendFailed: "Message non envoyé. Réessaie.",
    gone: "Cette conversation n'existe plus ou tu n'en fais plus partie.",
    unavailable: "Conversation indisponible.",
    messageTo: (name: string) => `Envoyer un message à ${name}`,
    writeGroupMention: "Écrire au groupe (@ pour appeler un bot)",
    writeGroup: "Écrire au groupe",
    dropTo: (name: string) => `Dépose tes fichiers pour les envoyer à ${name}`,
    dropToGroup: "Dépose tes fichiers pour les envoyer au groupe",
    back: "Retour",
    showPanel: "Afficher le panneau",
    emptyHint: "Envoie un premier message pour commencer.",
    theBot: "Le bot",
    botTyping: (name: string) => `${name} écrit…`,
    peopleTyping: (names: string, n: number) => `${names} ${n > 1 ? "écrivent" : "écrit"}…`,
    stop: "Arrêter la réponse",
    seeMembers: (n: number) => `Voir les ${n} membres`,
    openProfile: (name: string) => `Voir le profil et les tâches de ${name}`,
  },
});

/** The drafts and lists a bot's message carries, each answerable in place. */
function BotViews({
  message: m,
  views,
  answers,
  send,
}: {
  message: Message;
  views: NonNullable<NonNullable<Message["data"]>["views"]>;
  answers: Map<string, ViewAction>;
  send: (text: string, attachments: Sending["attachments"], invocations: Invocation[], mentions: string[], reply?: ReplyTo, viewAction?: ViewAction) => void;
}) {
  const vt = useT(integrations);
  // A message's views never move: their position is their identity (and the answers' key).
  return views.map((view, index) => (
    <ViewCard
      key={index}
      view={view}
      answer={answers.get(`${m.id}:${index}`)}
      canAct
      onAsk={(text) => send(text, [], [], m.author?.kind === "agent" ? [m.author.id] : [])}
      onAnswer={(action, draft, label, note) =>
        send(
          { confirm: vt.confirmedText(label), cancel: vt.cancelledText(label), revise: vt.revisedText(label, note ?? "") }[action],
          [],
          [],
          [],
          undefined,
          { messageId: m.id, index, action, ...(action !== "cancel" && { draft }), ...(note && { note }) },
        )
      }
    />
  ));
}

/** A reply being written: its tools, the streamed text or the typing dots, and a pending approval. */
function LiveTurn({
  turn,
  bot,
  conversationId,
  group,
  mentionables: mentions,
}: {
  turn: ActiveTurn;
  bot: AgentSummary | undefined;
  conversationId: string;
  group: boolean;
  mentionables: Mentionable[];
}) {
  const t = useT(strings);
  const { user } = useRouteContext({ from: "/app" });
  const visible = hideBlocks(turn.text);
  return (
    <>
      {group && bot && <AuthorLine name={bot.name} avatar={<AgentAvatar agent={bot} className="size-5" />} className="chat-arrive" />}
      <ToolLine tools={turn.tools} running={!visible} className="chat-arrive" />
      {visible ? (
        <BotBubble text={visible} streaming mentionables={mentions} />
      ) : (
        !turn.approval && <TypingBubble label={t.botTyping(bot?.name ?? t.theBot)} className="chat-arrive" />
      )}
      {turn.approval && (
        <ApprovalCard
          conversationId={conversationId}
          turnId={turn.turnId}
          botName={bot?.name ?? t.theBot}
          approval={turn.approval}
          canAnswer={turn.requestedBy === user.id || user.role === "admin"}
        />
      )}
    </>
  );
}

/** Back button, avatar and title of the conversation; in a direct conversation, opens the other side's profile. */
function HeaderTitle({
  conv,
  me,
  title,
  directBot,
  directPerson,
  onOpenInfo,
}: {
  conv: ConversationDetail | undefined;
  me: string;
  title: string;
  directBot: AgentSummary | null;
  directPerson: Person | null;
  onOpenInfo: () => void;
}) {
  const t = useT(strings);
  const group = conv?.kind === "group";
  return (
    <>
    <Button
      variant="ghost"
      size="icon"
      nativeButton={false}
      render={<Link to="/" aria-label={t.back} />}
      className="-ml-1 rounded-lg hover:bg-transparent md:hidden"
    >
      <ChevronLeftIcon className="size-5" />
    </Button>
    {directPerson || directBot ? (
      <Button
        variant="ghost"
        onClick={() => (directPerson ? openProfile(directPerson.id) : openAgentProfile(directBot!.id))}
        aria-label={t.openProfile((directPerson ?? directBot)!.name)}
        className="h-8 min-w-0 gap-1.5 rounded-lg px-1.5 text-[15px] font-medium text-foreground hover:text-foreground"
      >
        <ConversationAvatar conversation={conv!} me={me} className="size-6" status="ring-background" />
        <TitleWithStatus title={title} p={othersOf(conv!, me)[0]} />
      </Button>
    ) : (
      <>
        {conv && !group && <ConversationAvatar conversation={conv} me={me} className="size-6" status="ring-background" />}
        <TitleWithStatus title={title} p={conv && !group ? othersOf(conv, me)[0] : undefined} className="text-[15px] font-medium" />
      </>
    )}
    {group && conv && <Facepile conversation={conv} onClick={onOpenInfo} />}
    </>
  );
}

/** Search, files and pins toggles of the header, and the button that reopens the side panel. */
function PanelButtons({
  panel,
  setPanel,
  hasPanels,
  hasInfo,
}: {
  panel: PanelKind | "info" | null;
  setPanel: Dispatch<SetStateAction<PanelKind | "info" | null>>;
  hasPanels: boolean;
  hasInfo: boolean;
}) {
  const t = useT(strings);
  const panelLabels = usePanelLabels();
  return (
    <div className="flex items-center justify-end gap-1">
      {hasPanels &&
        (["search", "files", "pins"] as const).map((kind) => {
          const Icon = {
            search: SearchIcon,
            files: FilesIcon,
            pins: PinIcon,
          }[kind];
          const button = (
            <Button
              variant="ghost"
              size="icon"
              aria-label={panelLabels[kind]}
              aria-pressed={panel === kind}
              onClick={() => setPanel((p) => (p === kind ? null : kind))}
              className="hidden rounded-lg aria-pressed:bg-muted lg:inline-flex"
            >
              <Icon />
            </Button>
          );
          return kind === "search" ? (
            <ShortcutTooltip key={kind} label={panelLabels[kind]} shortcut={shortcuts.searchConversation}>
              {button}
            </ShortcutTooltip>
          ) : (
            <Tooltip key={kind}>
              <TooltipTrigger render={button} />
              <TooltipContent>{panelLabels[kind]}</TooltipContent>
            </Tooltip>
          );
        })}
      {panel !== "info" && hasInfo && (
        <ShortcutTooltip label={t.showPanel} shortcut={shortcuts.togglePanel}>
          <Button variant="ghost" size="icon" aria-label={t.showPanel} onClick={() => setPanel("info")} className="hidden rounded-lg lg:inline-flex">
            <ChevronsLeftIcon />
          </Button>
        </ShortcutTooltip>
      )}
    </div>
  );
}

/**
 * Files can be dropped anywhere in the window, not only on the thread:
 * a drop elsewhere would otherwise make the browser open the file. True while files are dragged over it.
 */
function useWindowFileDrop(onDrop: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const onFiles = useRef(onDrop);
  useLayoutEffect(() => {
    onFiles.current = onDrop;
  });
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer!.files.length) onFiles.current(e.dataTransfer!.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return dragging;
}

export function Conversation() {
  const { conversationId } = useParams({ from: "/app/c/$conversationId" });
  const { m: focus } = useSearch({ from: "/app/c/$conversationId" });
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const eventText = useEventText();
  const t = useT(strings);
  const detail = useQuery(conversationQuery(conversationId));
  const { data: messages = [], isPending } = useQuery(messagesQuery(conversationId));
  // Answers to the bots' drafts, by "<message id>:<view index>".
  const viewAnswers = new Map(messages.flatMap((m) => (m.data?.viewAction ? [[`${m.data.viewAction.messageId}:${m.data.viewAction.index}`, m.data.viewAction] as const] : [])));
  const { data: summaries } = useQuery(conversationsQuery);
  const turns = useTurns(conversationId);
  const typing = useTyping(conversationId);
  const conv = detail.data;
  /** Bots of the conversation and every colleague: all their mentions are colored. */
  const mentions = useMentionables(conv?.agents ?? noAgents);

  const [sent, setSending] = useState<Sending[]>([]);
  const sending = sent.filter((s) => !s.id || !messages.some((m) => m.id === s.id));
  const arrived = useArrivals(conversationId, messages, isPending);
  /** Side panel: the bot's or the group's (`info`), search, files or pins; closed by default. */
  const [panel, setPanel] = useState<PanelKind | "info" | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastTyping = useRef(0);

  const dragging = useWindowFileDrop((files) => composer.current?.addFiles(files));
  const { isPinned, toggle: togglePin } = usePins(conversationId);
  /** Every conversation has one: the bot, the group's members, or the colleague's profile. */
  const hasInfo = !!conv;

  useShortcut(shortcuts.togglePanel, () => setPanel((p) => (p ? null : hasInfo ? "info" : "files")));
  useShortcut(shortcuts.searchConversation, () => {
    // Reopening remounts the field so it takes the focus again.
    setPanel(null);
    requestAnimationFrame(() => setPanel("search"));
  });

  useEffect(() => {
    setSending([]);
    setReplyTo(null);
  }, [conversationId]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1500);
    return () => clearTimeout(timer);
  }, [highlight]);

  // On every fetch, not only when `conv` changes: an unchanged refetch keeps its reference, and a resync that dropped the replies needs them back.
  useEffect(() => {
    if (conv) seedTurns(conv.id, conv.turns);
  }, [conv, detail.dataUpdatedAt]);

  const unread = summaries?.find((s) => s.id === conversationId)?.unread;
  useEffect(() => {
    if (!unread) return;
    api(conversationPath(conversationId, "/read"), { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }));
  }, [conversationId, unread, qc]);

  // Follows the conversation only while it is read at the bottom: scrolled up, new messages don't pull the reader down.
  useLayoutEffect(() => {
    atBottom.current = true;
  }, [conversationId]);
  useLayoutEffect(() => {
    if (atBottom.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, sending.length, turns, typing]);
  // The composer growing (a quote, several lines, files) shortens the thread: its last message stays in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTo({ top: el.scrollHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const directBot = conv?.kind === "direct" && conv.agents.length === 1 ? conv.agents[0]! : null;
  const group = conv?.kind === "group";
  /** Direct conversation with a colleague: the header opens their profile. */
  const directPerson = conv?.kind === "direct" && !conv.agents.length ? (conv.members.find((m) => m.id !== user.id) ?? null) : null;
  const title = conv ? conversationTitle(conv, user.id) : "";
  useOrgTitle(title || undefined);

  const send = async (text: string, attachments: Sending["attachments"], invocations: Invocation[], mentions: string[], reply?: ReplyTo, viewAction?: ViewAction) => {
    const key = crypto.randomUUID();
    // Sending brings the reader back to the bottom, where their message and the reply appear.
    atBottom.current = true;
    setSending((xs) => [...xs, { key, text, attachments, invocations, replyTo: reply }]);
    try {
      const message = await sendMessage(conversationId, {
        text,
        attachmentIds: attachments.map((a) => a.id),
        invocations,
        mentions,
        replyTo: reply?.id,
        viewAction,
      });
      qc.setQueryData<Message[]>(messagesQuery(conversationId).queryKey, (old) => old && insertMessage(old, message));
      setSending((xs) => xs.map((x) => (x.key === key ? { ...x, id: message.id } : x)));
    } catch {
      setSending((xs) => xs.map((x) => (x.key === key ? { ...x, failed: true } : x)));
    }
  };

  const onTyping = () => {
    if (directBot || Date.now() - lastTyping.current < TYPING_EVERY_MS) return;
    lastTyping.current = Date.now();
    api(conversationPath(conversationId, "/typing"), { method: "POST" }).catch(() => {});
  };

  /** Brings the quoted message into view and flashes it. */
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setHighlight(id);
  };

  // Opened on a message (inbox): once it's there, bring it into view, then drop it from the URL.
  const focusLoaded = !!focus && messages.some((m) => m.id === focus);
  useEffect(() => {
    if (!focus || isPending) return;
    if (focusLoaded) requestAnimationFrame(() => jumpTo(focus));
    navigate({ to: "/c/$conversationId", params: { conversationId }, search: {}, replace: true });
  }, [focus, focusLoaded, isPending]);

  const stop = (turnId: string) => api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/cancel`), { method: "POST" }).catch(() => {});

  if (detail.error) {
    const gone = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="grid h-full flex-1 place-items-center bg-background">
        <p className="text-sm text-muted-foreground">{gone ? t.gone : t.unavailable}</p>
      </div>
    );
  }

  const agentById = (id: string) => conv?.agents.find((a) => a.id === id);
  const agents = conv?.agents ?? noAgents;
  const last = messages.at(-1);
  const question =
    !turns.length && !sending.length && last?.kind === "bot" && (last.data?.choices || last.data?.questions) && dismissed !== last.id ? last : null;
  const mine = turns.filter((t) => t.requestedBy === user.id);
  const placeholder = directBot ? t.messageTo(directBot.name) : group ? (conv.agents.length ? t.writeGroupMention : t.writeGroup) : t.messageTo(title);

  return (
    <ConversationFilesProvider messages={messages}>
      <div className="flex h-full min-w-0 flex-1">
        <section className="relative flex min-w-0 flex-1 flex-col bg-background">
          {dragging && conv && (
            <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-brand bg-background/80 text-sm font-medium">
              {directBot ? t.dropTo(directBot.name) : group ? t.dropToGroup : t.dropTo(title)}
            </div>
          )}
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <HeaderTitle conv={conv} me={user.id} title={title} directBot={directBot} directPerson={directPerson} onOpenInfo={() => setPanel("info")} />
            </div>
            <PanelButtons panel={panel} setPanel={setPanel} hasPanels={!!conv} hasInfo={hasInfo} />
          </header>
          {conv && <PinnedBar conversationId={conversationId} onJump={jumpTo} onSeeAll={() => setPanel("pins")} />}

          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
            }}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="flex flex-col gap-1.5 px-4 pb-6 pt-4">
              {isPending && <Spinner className="chat-loading mx-auto mt-[20vh] size-5 text-muted-foreground" />}
              {!isPending && messages.length === 0 && !sending.length && (
                <Empty className="mx-auto mt-[20vh] max-w-sm flex-none p-0">
                  <EmptyHeader className="gap-1">
                    <EmptyTitle className="text-[15px] tracking-normal">{title}</EmptyTitle>
                    <EmptyDescription>{t.emptyHint}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {messages.map((m, i) => {
                const at = new Date(m.createdAt);
                const prev = messages[i - 1];
                const divider = needsDivider(prev && new Date(prev.createdAt), at);
                const newAuthor = divider || !prev || authorKey(prev.author) !== authorKey(m.author);
                const fromMe = m.kind === "user" && m.author?.kind === "user" && m.author.id === user.id;
                const showAuthor = newAuthor && !fromMe && m.kind !== "event" && (group || (m.kind === "user" && !directBot)) && !!m.author;
                // A bot's reply takes the place of its live turn and ours of its pending copy: only others' messages arrive.
                const arriving = m.kind === "user" && !fromMe && arrived(m.id);
                return (
                  <Fragment key={m.id}>
                    {divider && <DateDivider label={dividerLabel(at)} />}
                    {showAuthor && m.author && group && (
                      <AuthorLine
                        className={arriving ? "chat-arrive" : undefined}
                        name={m.author.name}
                        avatar={
                          m.author.kind === "agent" ? (
                            <AgentAvatar agent={m.author} className="size-5" />
                          ) : (
                            <PersonAvatar person={m.author} className="size-5" />
                          )
                        }
                      />
                    )}
                    {m.kind === "user" && (
                      <MessageRow
                        id={m.id}
                        mine={fromMe}
                        arriving={arriving}
                        highlighted={highlight === m.id}
                        text={m.text}
                        attachments={m.data?.attachments}
                        onReply={() => setReplyTo(quoteOf(m))}
                        onForward={() => setForwarding(m)}
                        pinned={isPinned({ messageId: m.id })}
                        onTogglePin={() => togglePin({ messageId: m.id })}
                      >
                        <ChatMessage
                          mine={fromMe}
                          text={m.text}
                          attachments={m.data?.attachments}
                          invocations={fromMe ? m.data?.invocations : undefined}
                          replyTo={m.data?.replyTo}
                          forwarded={m.data?.forwarded}
                          mentionables={mentions}
                          onQuote={jumpTo}
                        />
                      </MessageRow>
                    )}
                    {m.kind === "bot" && (
                      <>
                        {m.data?.tools && <ToolLine tools={m.data.tools} />}
                        {m.data?.approvals && <ApprovalLog approvals={m.data.approvals} />}
                        {m.text && (
                          <MessageRow
                            id={m.id}
                            wide
                            highlighted={highlight === m.id}
                            text={m.text}
                            onReply={() => setReplyTo(quoteOf(m))}
                            onForward={() => setForwarding(m)}
                            pinned={isPinned({ messageId: m.id })}
                            onTogglePin={() => togglePin({ messageId: m.id })}
                          >
                            <BotBubble text={m.text} mentionables={mentions} className="max-w-full" />
                          </MessageRow>
                        )}
                        {m.data?.views && <BotViews message={m} views={m.data.views} answers={viewAnswers} send={send} />}
                        {m.data?.mcpRequest && <McpRequestCard id={m.data.mcpRequest} />}
                        {m.data?.skillRequest && <SkillRequestCard id={m.data.skillRequest} />}
                      </>
                    )}
                    {m.kind === "event" && (
                      <DateDivider
                        label={eventText(m.text, m.data?.event)}
                        conversationId={m.data?.event?.type === "relay.group" ? m.data.event.conversationId : undefined}
                      />
                    )}
                  </Fragment>
                );
              })}
              {question?.data?.questions && (
                <QuestionsCard
                  key={question.id}
                  questions={question.data.questions}
                  onAnswer={(text) => send(text, [], [], question.author?.kind === "agent" ? [question.author.id] : [])}
                  onDismiss={() => setDismissed(question.id)}
                />
              )}
              {question?.data?.choices && (
                <ChoiceCard
                  key={question.id}
                  choices={question.data.choices}
                  onAnswer={(text) => send(text, [], [], question.author?.kind === "agent" ? [question.author.id] : [])}
                  onDismiss={() => setDismissed(question.id)}
                />
              )}
              {sending.map((s) => (
                <Fragment key={s.key}>
                  <PendingRow failed={s.failed}>
                    <ChatMessage mine text={s.text} attachments={s.attachments} invocations={s.invocations} replyTo={s.replyTo} mentionables={mentions} onQuote={jumpTo} />
                  </PendingRow>
                  {s.failed && (
                    <p role="alert" className="text-right text-[13px] text-destructive">
                      {t.sendFailed}
                    </p>
                  )}
                </Fragment>
              ))}
              {turns.map((turn) => (
                <LiveTurn key={turn.turnId} turn={turn} bot={agentById(turn.agentId)} conversationId={conversationId} group={group} mentionables={mentions} />
              ))}
              {typing.length > 0 && (
                <p className="chat-arrive mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                  <TypingBubble label="" />
                  {t.peopleTyping(typing.map((p) => p.name.split(" ")[0]).join(", "), typing.length)}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 px-4 pb-3">
            {mine.length > 0 && (
              <div className="mb-2 flex justify-center">
                <Button variant="outline" size="sm" onClick={() => mine.forEach((t) => stop(t.turnId))} className="text-muted-foreground hover:text-foreground">
                  {t.stop}
                </Button>
              </div>
            )}
            {conv && (
              <Composer
                key={conversationId}
                ref={composer}
                conversationId={conversationId}
                placeholder={placeholder}
                botTools={!!directBot}
                mentionables={group ? conv.agents : []}
                recipientId={directPerson?.id}
                onSend={(text, attachments, invocations, mentions) => {
                  send(text, attachments, invocations, mentions, replyTo ?? undefined);
                  setReplyTo(null);
                }}
                onTyping={onTyping}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            )}
            <ForwardDialog conversationId={conversationId} message={forwarding} onClose={() => setForwarding(null)} />
          </div>
        </section>

        {panel === "info" && directBot && (
          <div className="hidden border-l border-border/60 lg:block">
            <RightPanel
              conversationId={conversationId}
              agentId={directBot.id}
              agentName={directBot.name}
              onMention={(r) =>
                composer.current?.addInvocation({
                  kind: "routine",
                  id: r.id,
                  name: r.name,
                })
              }
              onClose={() => setPanel(null)}
            />
          </div>
        )}
        {panel === "info" && directPerson && (
          <div className="hidden border-l border-border/60 lg:block">
            <PersonPanel userId={directPerson.id} onClose={() => setPanel(null)} />
          </div>
        )}
        {panel === "info" && group && conv && (
          <div className="hidden border-l border-border/60 lg:block">
            <MembersPanel conversation={conv} onClose={() => setPanel(null)} />
          </div>
        )}
        {panel && panel !== "info" && conv && (
          <div className="hidden border-l border-border/60 lg:block">
            <ConversationPanel key={`${conversationId}:${panel}`} kind={panel} conversationId={conversationId} onJump={jumpTo} onClose={() => setPanel(null)} />
          </div>
        )}
      </div>
    </ConversationFilesProvider>
  );
}

/** Answer of a bot choosing to stay silent (apps/api/src/group.ts). */
const NO_REPLY = "NO_REPLY";

/** While streaming, structured blocks (questions, profile) and a silent answer are not shown raw. */
const hideBlocks = (text: string) =>
  NO_REPLY.startsWith(text.trim().replace(/[.\s]+$/, ""))
    ? ""
    : text
        .replace(/```(choices|bot-profile|bot-name|mcp-request|questions|skill-request|skill-create|tasks|view)[ \t]*\n[\s\S]*?```/g, "")
        .replace(/```(choices|bot-profile|bot-name|mcp-request|questions|skill-request|skill-create|tasks|view)[\s\S]*$/, "")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();

/** Conversation name, followed in a direct conversation by the colleague's presence or the bot's activity, on the same baseline. */
function TitleWithStatus({ title, p, className }: { title: string; p?: Participant; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-baseline gap-2", className)}>
      <span className="truncate">{title}</span>
      {p && <HeaderStatus p={p} />}
    </span>
  );
}

/** Colored like the avatar's dot: green when online, brand while a bot works, muted for "Seen…". */
function HeaderStatus({ p }: { p: Participant }) {
  const status = useStatus(p);
  if (!status) return null;
  return (
    <span
      className={cn(
        "shrink-0 text-[13px] font-normal",
        {
          online: "text-success",
          working: "text-brand",
          away: "text-muted-foreground",
          dnd: "text-destructive",
        }[status.tone],
      )}
    >
      {status.label}
    </span>
  );
}

const FACEPILE_MAX = 8;

/** Group participants (bots first), up to 8 faces then "+N"; opens the members panel. */
function Facepile({ conversation: conv, onClick }: { conversation: ConversationDetail; onClick: () => void }) {
  const everyone = othersOf(conv, "");
  const shown = everyone.slice(0, everyone.length > FACEPILE_MAX ? FACEPILE_MAX - 1 : FACEPILE_MAX);
  const rest = everyone.length - shown.length;
  const t = useT(strings);
  return (
    <Button variant="ghost" onClick={onClick} aria-label={t.seeMembers(everyone.length)} className="ml-1 h-7 shrink-0 gap-0.5 rounded-full px-1.5">
      {shown.map((p) => (
        <span key={p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`} title={p.kind === "agent" ? p.agent.name : p.person.name}>
          <ParticipantAvatar p={p} className="size-5" />
        </span>
      ))}
      {rest > 0 && <span className="pl-1 text-[13px] font-normal tabular-nums text-muted-foreground">+{rest}</span>}
    </Button>
  );
}

const noAgents: AgentSummary[] = [];
