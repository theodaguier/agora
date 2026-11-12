import { defineMessages, useT } from "@/i18n";
import { PreviewUrls } from "@/lib/preview-urls";
import { useEventText } from "@/i18n/events";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import { BrowserIcon, ChevronLeftIcon, FilesIcon, PanelLeftIcon, PinIcon, SearchIcon, WarningIcon } from "@/components/icons";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { agentAccent } from "@/lib/agent-avatar";
import { DateDivider, FlatText, Lead, ToolLine, TypingBubble, TypingLine } from "@/components/Bubbles";
import { ApprovalCard, ApprovalLog } from "@/components/ApprovalCard";
import { ChoiceCard } from "@/components/ChoiceCard";
import { McpRequestCard } from "@/components/McpRequestCard";
import { QuestionsCard } from "@/components/QuestionsCard";
import { SkillRequestCard } from "@/components/SkillRequestCard";
import { BotRequestCard } from "@/components/BotRequestCard";
import { VaultRequestCard } from "@/components/VaultRequestCard";
import { GitHubMergeCard } from "@/components/github/GitHubMergeCard";
import { PullRequestLinks } from "@/components/github/PullRequestLinks";
import { ViewCard } from "@/components/views/ViewCard";
import { conversationTimeline, insertMessage, readPreviews, withoutMediaTags, withoutPreviews, type QueuedMessageDto, type ViewAction } from "@agora/core";
import { common, integrations } from "@agora/core/i18n";
import { Composer, type ComposerHandle } from "@/components/Composer";
import { ConversationAvatar, ParticipantAvatar, PersonAvatar, useStatus } from "@/components/ConversationAvatar";
import { conversationTitle, othersOf, type Participant } from "@/lib/participants";
import { ConversationPanel, PinnedBar, usePanelLabels, usePins, type PanelKind } from "@/components/ConversationPanels";
import { ForwardDialog } from "@/components/ForwardDialog";
import { MembersPanel } from "@/components/MembersPanel";
import { PersonPanel } from "@/components/PersonPanel";
import { SentAttachments } from "@/components/Attachments";
import { ChatMessage, MessageRow, PendingRow, useDeleteMessage } from "@/components/MessageParts";
import { RightPanel } from "@/components/RightPanel";
import {
  CodeSessionCard,
  CodeSessionPanel,
  CodeSessionsButton,
  isNewCodeSession,
  NEW_CODE_SESSION,
  newCodeSessionId,
  ReplyWithSessions,
  useConversationWide,
  useWide,
  WideProvider,
} from "@/components/CodeSession";
import { findPreview, PreviewCard, PreviewCards, PreviewPanel } from "@/components/Preview";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { playSound } from "@/lib/sounds";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyFigure } from "@/components/EmptyFigure";
import { agentMascot } from "@agora/core";
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
import { clockTime, dividerLabel, needsDivider } from "@/lib/dates";
import { ConversationFilesProvider } from "@/lib/conversation-files";
import { codeSessionsQuery } from "@/lib/code-sessions";
import { updateSide, useConversationSide, type ConversationSide } from "@/lib/conversation-side";
import { conversationQuery, conversationsQuery, messagesQuery, queueQuery } from "@/lib/queries";
import { QueueList } from "@/components/QueueList";
import { seedTurns, useTurns, useTyping } from "@/lib/realtime";
import { useOrgTitle } from "@/lib/org";
import { openAgentProfile, openProfile } from "@/lib/profile";
import type { Mentionable } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { shortcuts, useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { openBeside, readSize, tabPath, useTabPlace, writeSize, type TabPlace } from "@/lib/workspace";

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
    waitingYou: "Waits for your answer",
    showPanel: "Show panel",
    emptyHint: "Send a first message to get started.",
    unavailableHint: "It can't be reached right now.",
    messagesErrorTitle: "Messages unavailable",
    messagesError: "The messages of this conversation can't be reached right now.",
    theBot: "The bot",
    botTyping: (name: string) => `${name} is typing…`,
    stop: "Stop response",
    latest: "Latest messages",
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
    waitingYou: "Attend ta réponse",
    showPanel: "Afficher le panneau",
    emptyHint: "Envoie un premier message pour commencer.",
    unavailableHint: "Elle est injoignable pour le moment.",
    messagesErrorTitle: "Messages indisponibles",
    messagesError: "Les messages de cette conversation sont injoignables pour le moment.",
    theBot: "Le bot",
    botTyping: (name: string) => `${name} écrit…`,
    stop: "Arrêter la réponse",
    latest: "Derniers messages",
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

/**
 * Figma « Conversation — blocs riches »: a message from a bot or a colleague, flat in a column right
 * of a 36 px gutter; `avatar` (the first message of a run) sits in it, centred on the first line.
 */
function Post({ avatar, className, children }: { avatar?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-3 pl-12", className)}>
      {avatar && <span className="absolute top-0 left-0 -translate-y-2">{avatar}</span>}
      {children}
    </div>
  );
}

/** A reply being written: its tools, the streamed text or the typing dots, and a pending approval. */
function LiveTurn({
  turn,
  bot,
  conversationId,
  group,
  mentionables: mentions,
  onOpenCode,
  onOpenPreview,
  head,
  at,
  className,
}: {
  className?: string;
  /** When the reply started: on its first line. */
  at: Date;
  /** Starts a run: the bot's avatar in the gutter and who/when on the first line (see Post). */
  head: boolean;
  turn: ActiveTurn;
  bot: AgentSummary | undefined;
  conversationId: string;
  group: boolean;
  mentionables: Mentionable[];
  onOpenCode: (sessionId: string) => void;
  onOpenPreview: (key: string) => void;
}) {
  const t = useT(strings);
  const { user } = useRouteContext({ from: "/app" });
  const visible = hideBlocks(turn.text);
  const previews = readPreviews(turn.text);
  // A mockup being written says so on its card.
  const quiet = !!turn.approval || previews.some((p) => !p.done);
  const typing = <TypingBubble label={t.botTyping(bot?.name ?? t.theBot)} className="chat-arrive" />;
  const lead = head ? <Lead name={group ? bot?.name : undefined} time={clockTime(at)} /> : undefined;
  let first = true;
  const text = (value: string, streaming: boolean) => {
    const l = first ? lead : undefined;
    first = false;
    return <FlatText text={value} streaming={streaming} mentionables={mentions} lead={l} />;
  };
  return (
    <Post avatar={head && bot && <AgentAvatar agent={bot} className="size-9" />} className={className}>
      <ToolLine tools={turn.tools} running={!visible} className="chat-arrive" />
      {turn.codeSessions?.length ? (
        <div className="w-full">
          <ReplyWithSessions
            conversationId={conversationId}
            text={visible}
            sessions={turn.codeSessions}
            streaming
            typing={!quiet && typing}
            onOpen={onOpenCode}
            bubble={text}
          />
        </div>
      ) : visible ? (
        text(visible, true)
      ) : (
        !quiet && (
          <div className="flex items-center gap-2 text-sm">
            {lead}
            {typing}
          </div>
        )
      )}
      {previews.map((p, i) => (
        <PreviewCard key={i} title={p.title} writing={!p.done} onOpen={() => onOpenPreview(`${turn.turnId}:${i}`)} className="chat-arrive" />
      ))}
      {turn.approval && (
        <ApprovalCard
          conversationId={conversationId}
          turnId={turn.turnId}
          botName={bot?.name ?? t.theBot}
          bot={bot ?? undefined}
          approval={turn.approval}
          canAnswer={turn.requestedBy === user.id || user.role === "admin"}
        />
      )}
    </Post>
  );
}

/** Back button, avatar and title of the conversation; in a direct conversation, opens the other side's profile. */
function HeaderTitle({
  conv,
  me,
  title,
  directBot,
  directPerson,
  waiting,
  onOpenInfo,
}: {
  conv: ConversationDetail | undefined;
  me: string;
  title: string;
  directBot: AgentSummary | null;
  directPerson: Person | null;
  /** A bot waits for an approval: said instead of "working". */
  waiting: boolean;
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
      className="md:hidden"
    >
      <ChevronLeftIcon />
    </Button>
    {directPerson || directBot ? (
      <Button
        variant="ghost"
        onClick={() => (directPerson ? openProfile(directPerson.id) : openAgentProfile(directBot!.id))}
        aria-label={t.openProfile((directPerson ?? directBot)!.name)}
        className="h-auto min-w-0 py-1"
      >
        <TitleWithStatus title={title} p={othersOf(conv!, me)[0]} waiting={waiting} avatar={<ConversationAvatar conversation={conv!} me={me} className="size-8" />} />
      </Button>
    ) : (
      title && (
        <TitleWithStatus
          title={title}
          p={conv && !group ? othersOf(conv, me)[0] : undefined}
          // A group's members are the facepile beside it: no initials tile repeating them.
          avatar={conv && !group && <ConversationAvatar conversation={conv} me={me} className="size-8" />}
        />
      )
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
  sessions,
  className,
}: {
  panel: PanelKind | "info" | null;
  setPanel: Dispatch<SetStateAction<PanelKind | "info" | null>>;
  hasPanels: boolean;
  hasInfo: boolean;
  /** The Claude Code sessions button, first. */
  sessions?: ReactNode;
  className?: string;
}) {
  const t = useT(strings);
  const panelLabels = usePanelLabels();
  // Their panels open only beside the thread.
  const wide = useWide();
  return (
    <div className={cn("flex shrink-0 items-center justify-end", className)}>
      {sessions}
      {hasPanels &&
        wide &&
        (["screen", "search", "files", "pins"] as const).map((kind) => {
          const Icon = {
            screen: BrowserIcon,
            search: SearchIcon,
            files: FilesIcon,
            pins: PinIcon,
          }[kind];
          const button = (
            <Button
              variant={panel === kind ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={panelLabels[kind]}
              aria-pressed={panel === kind}
              onClick={() => setPanel((p) => (p === kind ? null : kind))}
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
      {wide && panel !== "info" && hasInfo && (
        <ShortcutTooltip label={t.showPanel} shortcut={shortcuts.togglePanel}>
          <Button variant="ghost" size="icon-sm" aria-label={t.showPanel} onClick={() => setPanel("info")}>
            <PanelLeftIcon />
          </Button>
        </ShortcutTooltip>
      )}
    </div>
  );
}

/**
 * Files can be dropped anywhere in the window, not only on the thread:
 * a drop elsewhere would otherwise make the browser open the file. True while files are dragged over it.
 * With several panes, the files go to the conversation in front in the pane they are dropped on;
 * dropped outside every pane (the sidebar), to the one the URL shows.
 */
function useWindowFileDrop(root: RefObject<HTMLElement | null>, place: TabPlace, onDrop: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const onFiles = useRef(onDrop);
  const where = useRef(place);
  useLayoutEffect(() => {
    onFiles.current = onDrop;
    where.current = place;
  });
  useEffect(() => {
    const mine = (e: DragEvent) => {
      const target = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
      // Over a field of its own (the Claude Code panel's), which takes them.
      if (target?.closest("[data-file-drop]")) return false;
      const pane = target?.closest("[data-pane]");
      if (pane) return where.current.visible && pane === root.current?.closest("[data-pane]");
      return where.current.current;
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(mine(e));
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
      setDragging(mine(e));
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
      if (mine(e) && e.dataTransfer!.files.length) onFiles.current(e.dataTransfer!.files);
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

/** Side panels' widths when first opened (then as last resized, per kind). */
const SIDE_WIDTHS = { info: 320, search: 320, files: 320, pins: 320, screen: 560, code: 600, preview: 520 } as const;
type SideKind = keyof typeof SIDE_WIDTHS;

/** The conversation route (mobile: one screen at a time; on desktop, the workspace shows it in a tab). */
export function Conversation() {
  const { conversationId } = useParams({ from: "/app/c/$conversationId" });
  const { m: focus } = useSearch({ from: "/app/c/$conversationId" });
  return <ConversationView conversationId={conversationId} focus={focus} />;
}

/** A conversation: its thread, and beside it a side panel whose width can be dragged. `focus`: a message to bring into view. */
export function ConversationView({ conversationId, focus }: { conversationId: string; focus?: string }) {
  const navigate = useNavigate();
  const place = useTabPlace();
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const eventText = useEventText();
  const t = useT(strings);
  const detail = useQuery(conversationQuery(conversationId));
  const c = useT(common);
  const messagesList = useQuery(messagesQuery(conversationId));
  const { data: messages = [], isPending } = messagesList;
  // Answers to the bots' drafts, by "<message id>:<view index>".
  const viewAnswers = new Map(messages.flatMap((m) => (m.data?.viewAction ? [[`${m.data.viewAction.messageId}:${m.data.viewAction.index}`, m.data.viewAction] as const] : [])));
  const { data: summaries } = useQuery(conversationsQuery);
  const turns = useTurns(conversationId);
  const { data: queue = [] } = useQuery(queueQuery(conversationId));
  const typing = useTyping(conversationId);
  const conv = detail.data;
  /** Bots of the conversation and every colleague: all their mentions are colored. */
  const mentions = useMentionables(conv?.agents ?? noAgents);

  const [sent, setSending] = useState<Sending[]>([]);
  const [pendingPreviews] = useState(() => new PreviewUrls());
  const sending = sent.filter((s) => !s.id || !messages.some((m) => m.id === s.id));
  useEffect(() => () => pendingPreviews.clear(), [pendingPreviews, conversationId]);
  // Once in the thread, a sent message is on its own: deleted later, it must not come back as a pending copy.
  useEffect(() => {
    const pending = sent.filter((s) => !s.id || !messages.some((m) => m.id === s.id));
    pendingPreviews.keep(pending.flatMap((s) => s.attachments.map((a) => a.previewUrl)));
    if (pending.length !== sent.length) setSending((xs) => xs.filter((s) => !s.id || !messages.some((m) => m.id === s.id)));
  }, [messages, sent, pendingPreviews]);
  const arrived = useArrivals(conversationId, messages, isPending);
  /**
   * Beside the thread, as this conversation was left (lib/conversation-side.ts). `panel`: the bot's or the
   * group's (`info`), search, files or pins; closed by default. `codeSession`, `codeTabs`: the Claude Code
   * panel (it takes the side panel's place), the session in front and the sessions opened in it as tabs;
   * closed, it keeps its tabs for the next time it opens. `previewKey`: an HTML mockup (`<turnId>:<index>`,
   * see findPreview), in the side panel's place too.
   */
  const { panel, codeSession, codeTabs, previewKey } = useConversationSide(user.id, conversationId);
  const sideSetter =
    <K extends keyof ConversationSide>(key: K) =>
    (action: SetStateAction<ConversationSide[K]>) =>
      updateSide(conversationId, (s) => ({ ...s, [key]: typeof action === "function" ? (action as (v: ConversationSide[K]) => ConversationSide[K])(s[key]) : action }));
  const setPanel = sideSetter("panel");
  const setCodeSession = sideSetter("codeSession");
  const setCodeTabs = sideSetter("codeTabs");
  const setPreviewKey = sideSetter("previewKey");
  useEffect(() => {
    if (panel) {
      setCodeSession(null);
      setPreviewKey(null);
    }
  }, [panel]);
  /** Brings a session to the front of the panel, in a tab of its own (a new one each time for `new`). */
  const openCodeSession = (id: string) => {
    const tab = id === NEW_CODE_SESSION ? newCodeSessionId() : id;
    setPanel(null);
    setPreviewKey(null);
    setCodeTabs((tabs) => (tabs.includes(tab) ? tabs : [...tabs, tab]));
    setCodeSession(tab);
  };
  const closeCodeTab = (id: string) => {
    const i = codeTabs.indexOf(id);
    const rest = codeTabs.filter((t) => t !== id);
    setCodeTabs(rest);
    if (codeSession === id) setCodeSession(rest[Math.min(i, rest.length - 1)] ?? null);
  };
  const openPreview = (key: string) => {
    setPanel(null);
    setCodeSession(null);
    setPreviewKey(key);
  };
  const preview = previewKey ? findPreview(previewKey, turns, messages) : null;
  // Room for a panel beside the thread: this conversation's width, the screen's until it is measured.
  const screenWide = useWide();
  const measured = useConversationWide();
  const wide = measured.wide ?? screenWide;
  // The mockup someone asked for opens beside the thread as soon as the bot starts writing it, unless something else is open there.
  const followed = useRef(new Set<string>());
  useEffect(() => {
    for (const turn of turns) {
      if (turn.requestedBy !== user.id || followed.current.has(turn.turnId) || !readPreviews(turn.text).length) continue;
      followed.current.add(turn.turnId);
      if (wide && !panel && !codeSession && !previewKey) setPreviewKey(`${turn.turnId}:0`);
    }
  }, [turns, user.id, wide, panel, codeSession, previewKey]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** Scrolled up: a button brings the reader back to the latest messages. */
  const [scrolledUp, setScrolledUp] = useState(false);
  const lastTyping = useRef(0);

  const root = useRef<HTMLDivElement>(null);
  const dragging = useWindowFileDrop(root, place, (files) => composer.current?.addFiles(files));
  const { isPinned, toggle: togglePin } = usePins(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  /** Every conversation has one: the bot, the group's members, or the colleague's profile. */
  const hasInfo = !!conv;

  // Beside another pane, only the conversation the URL shows answers the keyboard.
  useShortcut(shortcuts.togglePanel, () => setPanel((p) => (p ? null : hasInfo ? "info" : "files")), place.current);
  useShortcut(
    shortcuts.searchConversation,
    () => {
      // Reopening remounts the field so it takes the focus again.
      setPanel(null);
      requestAnimationFrame(() => setPanel("search"));
    },
    place.current,
  );

  useEffect(() => {
    setSending([]);
    setReplyTo(null);
  }, [conversationId]);

  // Sessions deleted since their tab was left: the tab goes too.
  const { data: sessions } = useQuery({ ...codeSessionsQuery(conversationId), enabled: codeTabs.length > 0 });
  // The PRs already on a session card, so a link to one in a message adds no second card.
  const { data: convSessions } = useQuery(codeSessionsQuery(conversationId));
  useEffect(() => {
    if (!sessions) return;
    const gone = codeTabs.filter((id) => !isNewCodeSession(id) && !sessions.some((s) => s.id === id));
    if (!gone.length) return;
    updateSide(conversationId, (s) => {
      const tabs = s.codeTabs.filter((id) => !gone.includes(id));
      return { ...s, codeTabs: tabs, codeSession: s.codeSession && gone.includes(s.codeSession) ? (tabs.at(-1) ?? null) : s.codeSession };
    });
  }, [sessions, codeTabs, conversationId]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1500);
    return () => clearTimeout(timer);
  }, [highlight]);

  // On every fetch, not only when `conv` changes: an unchanged refetch keeps its reference, and a resync that dropped the replies needs them back.
  useEffect(() => {
    if (conv) seedTurns(conv.id, conv.turns);
  }, [conv, detail.dataUpdatedAt]);

  // Read once on screen: a tab left behind another stays unread.
  const unread = summaries?.find((s) => s.id === conversationId)?.unread;
  useEffect(() => {
    if (!unread || !place.visible) return;
    api(conversationPath(conversationId, "/read"), { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }));
  }, [conversationId, unread, qc, place.visible]);

  // Follows the conversation only while it is read at the bottom: scrolled up, new messages don't pull the reader down.
  useLayoutEffect(() => {
    atBottom.current = true;
    setScrolledUp(false);
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

  /** Takes a side panel's content out of the conversation, into a pane beside it (workspace only). */
  const beside = place.paneId
    ? (path: string, close: () => void) => () => {
        close();
        openBeside(path, place.paneId!);
      }
    : null;

  const send = async (text: string, attachments: Sending["attachments"], invocations: Invocation[], mentions: string[], reply?: ReplyTo, viewAction?: ViewAction) => {
    for (const attachment of attachments) pendingPreviews.adopt(attachment.previewUrl);
    // A bot is replying: the message waits above the composer, and goes once the bots are done.
    if (turns.length && !viewAction) {
      const input = { text, attachmentIds: attachments.map((a) => a.id), invocations, mentions, replyTo: reply?.id };
      try {
        const res = await api<{ queued?: QueuedMessageDto[]; sent?: Message }>(conversationPath(conversationId, "/queue"), { method: "POST", body: JSON.stringify(input) });
        if (res.queued) qc.setQueryData(queueQuery(conversationId).queryKey, res.queued);
        if (res.sent) {
          const sent = res.sent;
          qc.setQueryData<Message[]>(messagesQuery(conversationId).queryKey, (old) => old && insertMessage(old, sent));
          void playSound("sent");
        }
        return;
      } catch {
        // Fall through: sent as before, its failure shown on its bubble.
      }
    }
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
      void playSound("sent");
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

  const queueAction = (path: string, init: RequestInit) =>
    api<QueuedMessageDto[] | Message>(conversationPath(conversationId, `/queue/${path}`), init).then((res) => {
      if (Array.isArray(res)) qc.setQueryData(queueQuery(conversationId).queryKey, res);
      else {
        qc.setQueryData<Message[]>(messagesQuery(conversationId).queryKey, (old) => old && insertMessage(old, res));
        void qc.invalidateQueries({ queryKey: queueQuery(conversationId).queryKey });
      }
    });

  const stop = (turnId: string) => api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/cancel`), { method: "POST" }).catch(() => {});

  if (detail.error) {
    const gone = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Empty className="h-full bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WarningIcon />
          </EmptyMedia>
          <EmptyTitle>{t.unavailable}</EmptyTitle>
          <EmptyDescription title={gone ? undefined : detail.error.message}>{gone ? t.gone : t.unavailableHint}</EmptyDescription>
        </EmptyHeader>
        {!gone && (
          <EmptyContent>
            <Button variant="secondary" onClick={() => void detail.refetch()}>
              {c.retry}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const agentById = (id: string) => conv?.agents.find((a) => a.id === id);
  const agents = conv?.agents ?? noAgents;
  const last = messages.at(-1);
  const question =
    !turns.length && !sending.length && last?.kind === "bot" && (last.data?.choices || last.data?.questions) && dismissed !== last.id ? last : null;
  const mine = turns.filter((t) => t.requestedBy === user.id);
  const placeholder = directBot ? t.messageTo(directBot.name) : group ? (conv.agents.length ? t.writeGroupMention : t.writeGroup) : t.messageTo(title);
  const timeline = conversationTimeline(messages, turns);
  // Sessions already shown in the reply that started them: their « started » event adds no second card.
  const sessionPulls = new Set((convSessions ?? []).flatMap((cs) => (cs.git?.repo && cs.git.pr ? [`${cs.git.repo.toLowerCase()}#${cs.git.pr.number}`] : [])));
  const shownSessions = new Set([...messages.flatMap((m) => m.data?.codeSessions ?? []), ...turns.flatMap((t) => t.codeSessions ?? [])].map((s) => s.id));

  const sideKind: SideKind | null = codeSession ? "code" : previewKey ? "preview" : panel && conv ? panel : null;
  const sideView =
    codeSession ? (
      <CodeSessionPanel
        conversationId={conversationId}
        tabs={codeTabs}
        active={codeSession}
        onSelect={setCodeSession}
        onOpen={openCodeSession}
        onCloseTab={closeCodeTab}
        onStarted={(tab, id) => {
          setCodeTabs((tabs) => tabs.map((t) => (t === tab ? id : t)));
          setCodeSession((current) => (current === tab ? id : current));
        }}
        onClose={() => setCodeSession(null)}
        onDetach={beside ? (id) => beside(tabPath.code(conversationId, id), () => closeCodeTab(id))() : undefined}
      />
    ) : previewKey ? (
      <PreviewPanel
        key={previewKey}
        source={preview}
        onClose={() => setPreviewKey(null)}
        onDetach={beside?.(tabPath.preview(conversationId, previewKey), () => setPreviewKey(null))}
      />
    ) : (panel === "info" || panel === "screen" || panel === "files") && directBot ? (
      // With one bot, its screen and its files are tabs of its own panel, as in Grok Bot.
      <RightPanel
        key={panel}
        initialTab={panel === "screen" ? "computer" : panel === "files" ? "library" : "details"}
        conversationId={conversationId}
        agent={directBot}
        onMention={(r) =>
          composer.current?.addInvocation({
            kind: "routine",
            id: r.id,
            name: r.name,
          })
        }
        onJump={jumpTo}
        onClose={() => setPanel(null)}
      />
    ) : panel === "info" && directPerson ? (
      <PersonPanel userId={directPerson.id} onClose={() => setPanel(null)} />
    ) : panel === "info" && group && conv ? (
      <MembersPanel conversation={conv} onClose={() => setPanel(null)} />
    ) : panel && panel !== "info" && conv ? (
      <ConversationPanel
        key={`${conversationId}:${panel}`}
        kind={panel}
        conversationId={conversationId}
        onJump={jumpTo}
        onClose={() => setPanel(null)}
        onDetach={panel === "screen" ? (beside?.(tabPath.screen(conversationId), () => setPanel(null)) ?? undefined) : undefined}
      />
    ) : null;

  const thread = (
    <section ref={root} className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      {dragging && conv && (
        <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-brand bg-background/80 text-sm font-medium">
          {directBot ? t.dropTo(directBot.name) : group ? t.dropToGroup : t.dropTo(title)}
        </div>
      )}
      <header className="@container/header grid h-16 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 border-b px-4 md:px-6">
        <div className="col-span-2 col-start-1 flex min-w-0 items-center gap-2">
          <HeaderTitle conv={conv} me={user.id} title={title} directBot={directBot} directPerson={directPerson} waiting={turns.some((x) => x.approval)} onOpenInfo={() => setPanel("info")} />
        </div>
        <PanelButtons
          className="col-start-3 justify-self-end"
          panel={panel}
          setPanel={setPanel}
          hasPanels={!!conv}
          hasInfo={hasInfo}
          sessions={
            conv && (
              <CodeSessionsButton
                conversationId={conversationId}
                current={codeSession}
                onOpen={openCodeSession}
                onDeleted={(id) => codeTabs.includes(id) && closeCodeTab(id)}
                onOpenBeside={place.paneId ? (id) => openBeside(tabPath.code(conversationId, id), place.paneId!) : undefined}
              />
            )
          }
        />
      </header>
      {conv && <PinnedBar conversationId={conversationId} onJump={jumpTo} onSeeAll={() => setPanel("pins")} />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
            setScrolledUp(!atBottom.current);
          }}
          // Positioned: an absolute element of a message (a hidden input, an sr-only label) is laid out
          // within the scroller. Otherwise it sits at the end of the messages, outside it, and the panel
          // gets a blank area to scroll under the composer.
          className="relative min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end gap-1 px-4 pt-6 pb-6 md:px-12">
            {isPending && (
              <div className="chat-loading flex flex-col gap-3" aria-busy>
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-10 w-1/2 self-end" />
                <Skeleton className="h-16 w-3/4" />
              </div>
            )}
            {messagesList.isError && !messages.length && !sending.length && (
              <Empty className="m-auto max-w-sm flex-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WarningIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t.messagesErrorTitle}</EmptyTitle>
                  <EmptyDescription title={messagesList.error.message}>{t.messagesError}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="secondary" onClick={() => void messagesList.refetch()}>
                    {c.retry}
                  </Button>
                </EmptyContent>
              </Empty>
            )}
            {!isPending && !messagesList.isError && messages.length === 0 && !sending.length && (
              <Empty className="m-auto max-w-sm flex-none">
                <EmptyHeader>
                  {/* Its portrait is already beside the thread when its panel is open. */}
                  {directBot && panel !== "info" && <EmptyFigure mascot={agentMascot(directBot.avatar.color)} />}
                  <EmptyTitle>{title}</EmptyTitle>
                  <EmptyDescription>{t.emptyHint}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {timeline.map((entry, i) => {
              const at = new Date(entry.createdAt);
              const previous = timeline[i - 1];
              const divider = needsDivider(previous && new Date(previous.createdAt), at);
              // A run (Figma « Conversation »): the same author within the same minute; it starts with an
              // avatar and who/when on its first line, 20 px under the previous one.
              const prevAuthor = previous?.kind === "message" ? authorKey(previous.message.author) : previous ? `agent:${previous.turn.agentId}` : null;
              const sameMinute = !!previous && clockTime(new Date(previous.createdAt)) === clockTime(at);
              if (entry.kind === "turn") {
                const head = divider || !sameMinute || prevAuthor !== `agent:${entry.turn.agentId}`;
                return (
                <Fragment key={entry.key}>
                  {divider && <DateDivider label={dividerLabel(at)} />}
                  <LiveTurn turn={entry.turn} bot={agentById(entry.turn.agentId)} conversationId={conversationId}
                    head={head} at={at} className={head && i > 0 && !divider ? "mt-5" : undefined}
                    group={group} mentionables={mentions} onOpenCode={openCodeSession} onOpenPreview={openPreview} />
                </Fragment>
                );
              }
              const m = entry.message;
              const prev = previous?.kind === "message" ? previous.message : undefined;
              const newAuthor = divider || !prev || authorKey(prev.author) !== authorKey(m.author);
              const fromMe = m.kind === "user" && m.author?.kind === "user" && m.author.id === user.id;
              // A bot's reply takes the place of its live turn and ours of its pending copy: only others' messages arrive.
              const arriving = m.kind === "user" && !fromMe && arrived(m.id);
              const head = !fromMe && m.kind !== "event" && (newAuthor || !sameMinute || prevAuthor !== authorKey(m.author));
              const lead = head ? <Lead name={group ? m.author?.name : undefined} time={clockTime(at)} /> : undefined;
              const avatar =
                head && m.author ? (
                  m.author.kind === "agent" ? <AgentAvatar agent={m.author} className="size-9" /> : <PersonAvatar person={m.author} className="size-9" />
                ) : undefined;
              const gap = i > 0 && !divider && (head || (fromMe && newAuthor)) && "mt-5";
              // A reply cut by its code sessions: who/when on its first piece of text only.
              let firstText = true;
              const flat = (text: string) => {
                const l = firstText ? lead : undefined;
                firstText = false;
                return <FlatText text={text} mentionables={mentions} lead={l} />;
              };
              /** A Claude Code session started here: its card instead of the event line. */
              const codeStarted = m.kind === "event" && m.data?.event?.type === "code.started" ? m.data.event : null;
              if (codeStarted && shownSessions.has(codeStarted.sessionId)) return null;
              /** A bot asking to use a login of the Coffre-fort: its card instead of the event line. */
              const vaultRequest = m.kind === "event" && m.data?.event?.type === "vault.request" ? m.data.event : null;
              /** A bot asking to merge a pull request: its card instead of the event line. */
              const githubMerge = m.kind === "event" && m.data?.event?.type === "github.merge" ? m.data.event : null;
              return (
                <Fragment key={entry.key}>
                  {divider && <DateDivider label={dividerLabel(at)} />}
                  {m.kind === "user" &&
                    (fromMe ? (
                    <MessageRow
                      className={fromMe ? gap || undefined : undefined}
                      wide={!fromMe}
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
                      onDelete={fromMe ? () => deleteMessage(m.id) : undefined}
                    >
                      <ChatMessage
                        mine={fromMe}
                        lead={lead}
                        text={m.text}
                        attachments={m.data?.attachments}
                        invocations={fromMe ? m.data?.invocations : undefined}
                        replyTo={m.data?.replyTo}
                        forwarded={m.data?.forwarded}
                        mentionables={mentions}
                        onQuote={jumpTo}
                      />
                    </MessageRow>
                    ) : (
                      <Post avatar={avatar} className={cn(gap || undefined, arriving && "chat-arrive")}>
                    <MessageRow
                      className={fromMe ? gap || undefined : undefined}
                      wide={!fromMe}
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
                      onDelete={fromMe ? () => deleteMessage(m.id) : undefined}
                    >
                      <ChatMessage
                        mine={fromMe}
                        lead={lead}
                        text={m.text}
                        attachments={m.data?.attachments}
                        invocations={fromMe ? m.data?.invocations : undefined}
                        replyTo={m.data?.replyTo}
                        forwarded={m.data?.forwarded}
                        mentionables={mentions}
                        onQuote={jumpTo}
                      />
                    </MessageRow>
                      </Post>
                    ))}
                  {m.kind === "user" && <PullRequestLinks text={m.text} shown={sessionPulls} align={fromMe ? "end" : "start"} className={cn("mt-1.5", fromMe && "pr-8")} />}
                  {m.kind === "bot" && (
                    <Post className={gap || undefined} avatar={avatar}>
                      {m.data?.approvals && <ApprovalLog approvals={m.data.approvals} />}
                      {lead && !m.text && !m.data?.codeSessions?.length && <p className="text-sm">{lead}</p>}
                      {(m.text || !!m.data?.codeSessions?.length) && (
                        <MessageRow
                          id={m.id}
                          wide
                          highlighted={highlight === m.id}
                          text={m.text}
                          onReply={() => setReplyTo(quoteOf(m))}
                          onForward={() => setForwarding(m)}
                          pinned={isPinned({ messageId: m.id })}
                          onTogglePin={() => togglePin({ messageId: m.id })}
                          onDelete={() => deleteMessage(m.id)}
                        >
                          {m.data?.codeSessions?.length ? (
                            <ReplyWithSessions
                              conversationId={conversationId}
                              text={m.text}
                              sessions={m.data.codeSessions}
                              onOpen={openCodeSession}
                              bubble={flat}
                            />
                          ) : (
                            <FlatText text={m.text} mentionables={mentions} lead={lead} />
                          )}
                        </MessageRow>
                      )}
                      {m.data?.tools && <ToolLine tools={m.data.tools} />}
                      {m.data?.views && <BotViews message={m} views={m.data.views} answers={viewAnswers} send={send} />}
                      {m.data?.previews && <PreviewCards previews={m.data.previews} onOpen={openPreview} />}
                      <BotFiles message={m} />
                      <PullRequestLinks text={m.text} shown={sessionPulls} />
                      {m.data?.mcpRequest && <McpRequestCard id={m.data.mcpRequest} />}
                      {m.data?.skillRequest && <SkillRequestCard id={m.data.skillRequest} />}
                      {m.data?.botRequest && <BotRequestCard id={m.data.botRequest} />}
                    </Post>
                  )}
                  {codeStarted && (
                    <div className="mt-3 pl-12">
                    <CodeSessionCard
                      conversationId={conversationId}
                      sessionId={codeStarted.sessionId}
                      title={codeStarted.title}
                      onOpen={() => openCodeSession(codeStarted.sessionId)}
                    />
                    </div>
                  )}
                  {vaultRequest && (
                    <div className="mt-3 pl-12">
                      <VaultRequestCard id={vaultRequest.requestId} />
                    </div>
                  )}
                  {githubMerge && (
                    <div className="mt-3 pl-12">
                      <GitHubMergeCard id={githubMerge.requestId} bot={githubMerge.bot} repo={githubMerge.repo} number={githubMerge.number} />
                    </div>
                  )}
                  {m.kind === "event" && !codeStarted && !vaultRequest && !githubMerge && (
                    <DateDivider
                      label={eventText(m.text, m.data?.event)}
                      conversationId={m.data?.event?.type === "relay.group" ? m.data.event.conversationId : undefined}
                    />
                  )}
                </Fragment>
              );
            })}
            {/* The bot's question: in its column (right of the avatar gutter), a block apart from its message. */}
            {question?.data?.questions && (
              <Post key={question.id} className="mt-3">
                <QuestionsCard
                  questions={question.data.questions}
                  onAnswer={(text) => send(text, [], [], question.author?.kind === "agent" ? [question.author.id] : [])}
                  onDismiss={() => setDismissed(question.id)}
                />
              </Post>
            )}
            {question?.data?.choices && (
              <Post key={question.id} className="mt-3">
                <ChoiceCard
                  choices={question.data.choices}
                  onAnswer={(text) => send(text, [], [], question.author?.kind === "agent" ? [question.author.id] : [])}
                  onDismiss={() => setDismissed(question.id)}
                />
              </Post>
            )}
            {sending.map((s) => (
              <Fragment key={s.key}>
                <PendingRow failed={s.failed}>
                  <ChatMessage mine text={s.text} attachments={s.attachments} invocations={s.invocations} replyTo={s.replyTo} mentionables={mentions} onQuote={jumpTo} />
                </PendingRow>
                {s.failed && (
                  <p role="alert" className="text-right text-xs text-destructive">
                    {t.sendFailed}
                  </p>
                )}
              </Fragment>
            ))}
            <TypingLine
              className="chat-arrive"
              entries={[
                ...typing.map((p) => ({ key: p.userId, name: p.name.split(" ")[0]! })),
              ]}
            />
          </div>
        </div>
        {scrolledUp && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-3 left-1/2 -translate-x-1/2"
            onClick={() => {
              atBottom.current = true;
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            }}
          >
            {t.latest}
          </Button>
        )}
      </div>

      <div className="mx-auto w-full max-w-5xl shrink-0 px-4 pb-4 md:px-12">
        {conv && (
          <QueueList
            items={queue}
            onEdit={(id, text) => queueAction(encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ text }) })}
            onSendNow={(id) => queueAction(`${encodeURIComponent(id)}/send`, { method: "POST" })}
            onRemove={(id) => queueAction(encodeURIComponent(id), { method: "DELETE" })}
          />
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
            onStop={mine.length ? () => mine.forEach((x) => stop(x.turnId)) : undefined}
            stopLabel={t.stop}
          />
        )}
        <ForwardDialog conversationId={conversationId} message={forwarding} onClose={() => setForwarding(null)} />
      </div>
    </section>
  );

  return (
    <ConversationFilesProvider messages={messages}>
      <WideProvider value={wide}>
        {/* A conversation with a bot is dressed in its colour (your bubbles, send, primary buttons). */}
        <div ref={measured.ref} className="flex h-full min-w-0 flex-1" style={directBot ? ({ "--bot": agentAccent(directBot.avatar.color), "--bot-foreground": "#fff" } as CSSProperties) : undefined}>
          {wide ? (
            // The thread and its side panel, the line between them dragged to share the width.
            <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
              {/* The panel's box scrolls (overflow: auto): anything overflowing let the whole thread slide up under the tab bar. Clipped, it can't scroll. */}
              <ResizablePanel id={`thread-${conversationId}`} minSize={320} style={NO_SCROLL}>
                {thread}
              </ResizablePanel>
              {sideKind && sideView && (
                <>
                  <ResizableHandle />
                  <ResizablePanel
                    key={sideKind}
                    id={`${sideKind}-${conversationId}`}
                    defaultSize={readSize(`side.${sideKind}`, SIDE_WIDTHS[sideKind])}
                    minSize={260}
                    maxSize="75%"
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(size, _, prev) => prev && writeSize(`side.${sideKind}`, size.inPixels)}
                  >
                    {sideView}
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          ) : (
            // Narrower: the session and the mockup open in a sheet over the thread; the other panels wait for the room.
            <>
              {thread}
              {(codeSession || previewKey) && sideView}
            </>
          )}
        </div>
      </WideProvider>
    </ConversationFilesProvider>
  );
}

/** A panel that never scrolls itself: what it holds has its own scroller. */
const NO_SCROLL = { overflow: "clip" } as const;

/** Answer of a bot choosing to stay silent (apps/api/src/group.ts). */
const NO_REPLY = "NO_REPLY";

/** While streaming, structured blocks (questions, profile) and a silent answer are not shown raw. */
const hideBlocks = (text: string) =>
  NO_REPLY.startsWith(text.trim().replace(/[.\s]+$/, ""))
    ? ""
    : withoutMediaTags(withoutPreviews(text))
        .replace(/```(choices|bot-profile|bot-name|mcp-request|questions|skill-request|skill-create|tasks|view)[ \t]*\n[\s\S]*?```/g, "")
        .replace(/```(choices|bot-profile|bot-name|mcp-request|questions|skill-request|skill-create|tasks|view)[\s\S]*$/, "")
        .replace(/\n{3,}/g, "\n\n")
        .trimEnd();

/** The files a bot sent with its reply (its mockups have their own cards). */
function BotFiles({ message }: { message: Message }) {
  const mockups = new Set(message.data?.previews?.map((p) => p.id));
  const files = (message.data?.attachments ?? []).filter((a) => !mockups.has(a.id));
  return files.length > 0 && <SentAttachments items={files} align="start" />;
}

/**
 * The conversation's title: avatar and name on one line; a status (the colleague's presence, the bot
 * waiting for you) follows the name in grey.
 */
function TitleWithStatus({ title, p, avatar, waiting, className }: { title: string; p?: Participant; avatar?: ReactNode; waiting?: boolean; className?: string }) {
  const t = useT(strings);
  return (
    // Figma « Conversation »: the name over what they are doing, left of the thread.
    <span className={cn("flex min-w-0 items-center gap-3 text-left", className)}>
      {avatar}
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium">{title}</span>
        {waiting ? <span className="truncate text-xs font-normal text-muted-foreground">{t.waitingYou}</span> : p && <HeaderStatus p={p} />}
      </span>
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
        "truncate text-xs font-normal",
        status.tone === "dnd" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status.label}
    </span>
  );
}

const FACEPILE_MAX = 8;
/** Faces of the pile while the header is narrow. */
const FACEPILE_NARROW = 3;

/** Group participants (bots first), up to 8 faces then "+N"; opens the members panel. */
/**
 * The members, beside the title. The header narrows with the panes beside it: the title keeps its
 * place, the pile shrinks to a few faces, then leaves (the side panel lists the members).
 */
function Facepile({ conversation: conv, onClick }: { conversation: ConversationDetail; onClick: () => void }) {
  const everyone = othersOf(conv, "");
  const fit = (max: number) => (everyone.length > max ? max - 1 : max);
  const shown = everyone.slice(0, fit(FACEPILE_MAX));
  const t = useT(strings);
  const count = (n: number, className: string) =>
    n > 0 && <span className={cn("pl-1 text-xs font-normal tabular-nums text-muted-foreground", className)}>+{n}</span>;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={t.seeMembers(everyone.length)}
      className="ml-1 hidden shrink-0 @lg/header:inline-flex"
    >
      {shown.map((p, i) => (
        <span
          key={p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`}
          title={p.kind === "agent" ? p.agent.name : p.person.name}
          className={cn(i >= fit(FACEPILE_NARROW) && "hidden @3xl/header:block")}
        >
          <ParticipantAvatar p={p} className="size-5" />
        </span>
      ))}
      {count(everyone.length - fit(FACEPILE_NARROW), "@3xl/header:hidden")}
      {count(everyone.length - shown.length, "hidden @3xl/header:inline")}
    </Button>
  );
}

const noAgents: AgentSummary[] = [];
