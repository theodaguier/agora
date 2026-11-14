import { agentAccentColor, agentMascot, insertMessage, renderEvent, withoutMediaTags, withoutPreviews, type ViewAction } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, Button, LinkButton, Spinner, Surface, Typography, useToast } from "heroui-native";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { ScopedVariables } from "uniwind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentAvatar } from "@/components/agent-avatar";
import { ApprovalCard } from "@/components/approval-card";
import { FileCard, SentAttachments } from "@/components/attachments";
import { DayDivider, FlatText, Post, ThreadEvent, ToolLine, TypingBubble, TypingLine, type PostHead } from "@/components/bubbles";
import { ChoiceCard } from "@/components/choice-card";
import { CodeSessionCard, ReplyWithSessions, useCanStartCodeSession, useCodeSessions } from "@/components/code-session";
import { Composer, type ComposerHandle } from "@/components/composer";
import { HeaderTitle } from "@/components/conversation/header";
import { infoHref } from "@/components/conversation/info-href";
import { ConversationAvatar, PersonAvatar } from "@/components/conversation-avatar";
import { headerIcon } from "@/components/header-button";
import { conversationTitle, othersOf } from "@/components/participants";
import { ConversationPanel, PinnedBar, usePanelLabels, usePins, type PanelKind } from "@/components/conversation-panels";
import { ForwardDialog } from "@/components/forward-dialog";
import { McpRequestCard } from "@/components/mcp-request-card";
import { GitHubMergeCard, PullRequestLinks } from "@/components/github-merge-card";
import { VaultRequestCard } from "@/components/vault-request-card";
import { ChatMessage, MessageRow, PendingRow, useDeleteMessage } from "@/components/message-parts";
import { QuestionsCard } from "@/components/questions-card";
import { useMe } from "@/components/server-scope";
import { SkillRequestCard } from "@/components/skill-request-card";
import { BotRequestCard } from "@/components/bot-request-card";
import { ViewCard } from "@/components/views/ViewCard";
import { api, ApiError, conversationPath, retryLast, sendMessage } from "@/lib/api";
import { ConversationFilesProvider } from "@/lib/conversation-files";
import { clockTime, dayLabel } from "@/lib/dates";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";
import { integrations } from "@agora/core/i18n";
import type { Mentionable } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { conversationQuery, conversationsQuery, messagesQuery } from "@/lib/queries";
import { seedTurns, useTurns, useTyping } from "@/lib/realtime";
import { useThreadHaptics } from "@/screens/conversation-haptics";
import type { ActiveTurn, AgentSummary, Attachment, Author, ConversationDetail, Invocation, Message, ReplyTo } from "@/lib/types";
import { MenuButton } from "@/components/menus";
import { EmptyState } from "@/components/empty-state";

/*
 * apps/web/src/screens/Conversation.tsx (the Geist redesign) as an iOS screen: the native header (face,
 * name, status, the sessions' count; search and "…"), the thread scrolling under it (day dividers, runs
 * opening on their author, others flat and yours in grey bubbles) and under the composer's card.
 */

/** Minimum interval between two "is typing" signals. */
const TYPING_EVERY_MS = 3_000;

type Sending = {
  key: string;
  text: string;
  attachments: (Attachment & { previewUri?: string })[];
  invocations: Invocation[];
  replyTo?: ReplyTo;
  failed?: boolean;
};

/** What the composer shows of the message being answered (the API keeps its own snapshot). */
const quoteOf = (m: Message): ReplyTo => {
  const first = m.data?.attachments?.[0];
  return {
    id: m.id,
    authorName: m.author?.name ?? "?",
    text: m.text.replace(/\s+/g, " ").trim().slice(0, 280),
    ...(first && { attachment: { id: first.id, name: first.name, mime: first.mime } }),
  };
};

/** Key of a message being sent, until the server gives it an id. */
const sendingKey = () => `${Date.now()}-${Math.random()}`;

const authorKey = (a: Author) => (a ? `${a.kind}:${a.id}` : "event");

const strings = defineMessages({
  en: {
    sendFailed: "Message not sent. Try again.",
    retry: "Retry",
    retryFailed: "Couldn't retry.",
    gone: "This conversation no longer exists or you're no longer part of it.",
    unavailable: "Conversation unavailable.",
    messageTo: (name: string) => `Message ${name}`,
    writeGroup: "Message the group",
    back: "Back",
    emptyHint: "Send a first message to get started.",
    theBot: "The bot",
    botTyping: (name: string) => `${name} is typing…`,
    stop: "Stop response",
    latest: "Latest messages",
    seeMembers: (n: number) => (n === 1 ? "See 1 member" : `See ${n} members`),
    openProfile: (name: string) => `See ${name}'s profile and tasks`,
    more: "More",
  },
  fr: {
    sendFailed: "Message non envoyé. Réessaie.",
    retry: "Réessayer",
    retryFailed: "Relance impossible.",
    gone: "Cette conversation n'existe plus ou tu n'en fais plus partie.",
    unavailable: "Conversation indisponible.",
    messageTo: (name: string) => `Message à ${name}`,
    writeGroup: "Écrire au groupe",
    back: "Retour",
    emptyHint: "Envoie un premier message pour commencer.",
    theBot: "Le bot",
    botTyping: (name: string) => `${name} écrit…`,
    stop: "Arrêter la réponse",
    latest: "Derniers messages",
    seeMembers: (n: number) => `Voir les ${n} membres`,
    openProfile: (name: string) => `Voir le profil et les tâches de ${name}`,
    more: "Plus",
  },
});


/**
 * Messages laid out when the thread opens, and added each time it's scrolled back near its top:
 * the API sends up to 500, and laying them all out (their markdown with it) delayed the opening.
 */
const PAGE = 40;
/** Messages laid out while the screen slides in; the rest of the first PAGE come right after. */
const FIRST = 12;
/** How close to its top the thread must be scrolled back to lay out older messages. */
const OLDER_WITHIN = 600;
/** How far from its end the thread must be scrolled for the "latest messages" button to show. */
const SCROLLED_UP = 400;

/** `focus`: a message to open the thread on (a notification, the inbox), like the web's `?m=`. */
export function Conversation({ conversationId, focus }: { conversationId: string; focus?: string }) {
  const user = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = strings;
  const insets = useSafeAreaInsets();
  /** The home-indicator margin the composer bar no longer needs above the keyboard. */
  const keyboardOffset = Math.max(0, insets.bottom - 8);
  const headerHeight = useHeaderHeight();
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

  const [sending, setSending] = useState<Sending[]>([]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  /** Search, files or pins, as a bottom sheet (the web's side panel); closed by default. */
  const [panel, setPanel] = useState<PanelKind | null>(null);
  /** Heights of what floats over the thread, so its first and last messages stay visible. */
  const [pinsHeight, setPinsHeight] = useState(0);
  const [barHeight, setBarHeight] = useState(0);
  const { isPinned, toggle: togglePin } = usePins(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<ComponentRef<typeof KeyboardChatScrollView>>(null);
  /** Position of each message in the thread, to jump to a quoted one. */
  const offsets = useRef(new Map<string, number>());
  /** Heights of the thread's content and of what it shows, to turn a message's position into a scroll offset. */
  const threadHeight = useRef(0);
  const viewportHeight = useRef(0);
  /** Older messages are laid out only when the user scrolls back, never on their own. */
  const dragged = useRef(false);
  /** Scrolled up: a button over the composer brings the reader back to the latest messages. */
  const [scrolledUp, setScrolledUp] = useState(false);
  const lastTyping = useRef(0);
  /** A message to bring into view once it's laid out: the one to open on, or a quoted one not laid out yet. */
  const pendingJump = useRef(focus ?? null);
  /** Older messages not laid out; until the thread is scrolled back, the last PAGE ones (and the one to open on). */
  const [hiddenState, setHidden] = useState<number | null>(null);
  /** The screen has finished sliding in: until then, a few messages only, so the push isn't held back. */
  const [settled, setSettled] = useState(false);
  const navigation = useNavigation();
  useEffect(() => {
    const done = () => setSettled(true);
    // A native stack event, which expo-router's useNavigation doesn't type (its native-stack types aren't exported).
    const off = navigation.addListener("transitionEnd" as never, done);
    // No transition (opened from a notification at launch): don't wait for one.
    const timer = setTimeout(done, 600);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [navigation]);
  const focusAt = focus ? messages.findIndex((m) => m.id === focus) : -1;
  const hidden = Math.min(
    hiddenState ?? Math.max(0, Math.min(messages.length - (settled ? PAGE : FIRST), focusAt < 0 ? Infinity : focusAt - 5)),
    messages.length,
  );

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1500);
    return () => clearTimeout(timer);
  }, [highlight]);

  // On every fetch, not only when `conv` changes: an unchanged refetch keeps its reference, and a resync that dropped the replies needs them back.
  useEffect(() => {
    if (conv) seedTurns(conv.id, conv.turns);
  }, [conv, detail.dataUpdatedAt]);

  useThreadHaptics(conversationId, messages, turns.length > 0, user.id);

  const unread = summaries?.find((s) => s.id === conversationId)?.unread;
  useEffect(() => {
    if (!unread) return;
    api(conversationPath(conversationId, "/read"), { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }));
  }, [conversationId, unread, qc]);

  const directBot = conv?.kind === "direct" && conv.agents.length === 1 ? conv.agents[0]! : null;
  const group = conv?.kind === "group";
  /** Direct conversation with a colleague. */
  const directPerson = conv?.kind === "direct" && !conv.agents.length ? (conv.members.find((m) => m.id !== user.id) ?? null) : null;
  const title = conv ? conversationTitle(conv, user.id) : "";

  const send = async (text: string, attachments: Sending["attachments"], invocations: Invocation[], mentioned: string[], reply?: ReplyTo, viewAction?: ViewAction) => {
    const key = sendingKey();
    toEnd();
    setSending((xs) => [...xs, { key, text, attachments, invocations, replyTo: reply }]);
    const body = { text, attachmentIds: attachments.map((a) => a.id), invocations, mentions: mentioned, replyTo: reply?.id, viewAction };
    try {
      const message = await sendMessage(conversationId, body);
      qc.setQueryData<Message[]>(messagesQuery(conversationId).queryKey, (old) => old && insertMessage(old, message));
      setSending((xs) => xs.filter((x) => x.key !== key));
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      toast.show({ variant: "danger", label: t.sendFailed });
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
    const y = offsets.current.get(id);
    if (y === undefined) {
      // Older than what's laid out: lay out down to it, and jump once it's there (its onLayout).
      const at = messages.findIndex((m) => m.id === id);
      if (at < 0) return;
      pendingJump.current = id;
      setHidden(Math.max(0, at - 5));
      return;
    }
    // The thread is flipped (see below): offset 0 is its end, and a message's top is `threadHeight - y` above the
    // thread's bottom padding. Its top goes under the header and the pins.
    const top = barHeight + 12 + threadHeight.current - y;
    scroller.current?.scrollTo({ y: Math.max(0, top - viewportHeight.current + headerHeight + pinsHeight + 24), animated: true });
    setHighlight(id);
  };

  // Opened on a message: once it's laid out, bring it into view (its onLayout below); if it isn't
  // in the thread, follow the end as usual.
  const focusMissing = !!focus && !isPending && !messages.some((m) => m.id === focus);
  useEffect(() => {
    if (!focusMissing || pendingJump.current !== focus) return;
    pendingJump.current = null;
  }, [focusMissing, focus]);

  // What a message row does, behind functions that never change: a row re-renders only when its message does,
  // not at each token of a bot's answer or each "is typing".
  const rowHandlers: RowActions = {
    reply: (m) => setReplyTo(quoteOf(m)),
    forward: setForwarding,
    togglePin: (messageId) => togglePin({ messageId }),
    delete: deleteMessage,
    quote: jumpTo,
    send: (text, mentioned, viewAction) => send(text, [], [], mentioned, undefined, viewAction),
    laidOut: (id, y) => {
      offsets.current.set(id, y);
      if (id !== pendingJump.current) return;
      pendingJump.current = null;
      requestAnimationFrame(() => jumpTo(id));
    },
  };
  const latestRow = useRef(rowHandlers);
  useLayoutEffect(() => {
    latestRow.current = rowHandlers;
  });
  const [rowActions] = useState<RowActions>(() => ({
    reply: (m) => latestRow.current.reply(m),
    forward: (m) => latestRow.current.forward(m),
    togglePin: (id) => latestRow.current.togglePin(id),
    delete: (id) => latestRow.current.delete(id),
    quote: (id) => latestRow.current.quote(id),
    send: (text, mentioned, viewAction) => latestRow.current.send(text, mentioned, viewAction),
    laidOut: (id, y) => latestRow.current.laidOut(id, y),
  }));

  const stop = (turnId: string) => api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/cancel`), { method: "POST" }).catch(() => {});

  const toEnd = () => scroller.current?.scrollTo({ y: 0, animated: true });

  // Its sessions, or the way to start one for the owner of the subscription.
  const canStartCode = useCanStartCodeSession(conversationId);
  const codeSessions = useCodeSessions(conversationId);
  const header = (
    <ConversationHeader
      conv={conv}
      me={user.id}
      title={title}
      counterpart={(directPerson ?? directBot)?.name}
      waiting={turns.some((turn) => !!turn.approval)}
      // The menu opens the sessions started here, or offers the first one (the title has no room for their count).
      startCode={canStartCode || !!codeSessions?.length}
      onPanel={setPanel}
    />
  );

  if (detail.error) {
    const gone = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <View className="flex-1 px-4" style={{ paddingTop: headerHeight + 16 }}>
        {header}
        <Alert status={gone ? "warning" : "danger"}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{gone ? t.gone : t.unavailable}</Alert.Title>
          </Alert.Content>
        </Alert>
        <Button variant="secondary" className="mt-4 self-center" onPress={withTap(() => router.back())}>
          {t.back}
        </Button>
      </View>
    );
  }

  const agentById = (id: string) => conv?.agents.find((a) => a.id === id);
  const last = messages.at(-1);
  const question =
    !turns.length && !sending.length && last?.kind === "bot" && (last.data?.choices || last.data?.questions) && dismissed !== last.id ? last : null;
  const mine = turns.filter((turn) => turn.requestedBy === user.id);
  const placeholder = directBot ? t.messageTo(directBot.name) : group ? t.writeGroup : t.messageTo(title);
  // Sessions already shown in the reply that started them: their « started » event adds no second card.
  const shownSessions = new Set([...messages.flatMap((m) => m.data?.codeSessions ?? []), ...turns.flatMap((turn) => turn.codeSessions ?? [])].map((x) => x.id));

  // A conversation with a bot is dressed in its colour (`--bot`, as on the web); your bubbles stay grey and buttons neutral.
  const accent = accentVariables(directBot?.avatar.color);

  return (
    <ScopedVariables variables={accent}>
      {header}
      {/* Figma « Conversation » (mobile): the thread and the composer on the white page. */}
      <Surface variant="transparent" className="flex-1 bg-background p-0">
        <ConversationFilesProvider messages={messages}>
          {/* The thread follows the keyboard frame by frame, and only lifts when at its end (reading back stays put).
              It is flipped, as an inverted FlatList: its end is offset 0, so it opens there without scrolling, and what
              grows above (an image loading, older messages laid out) doesn't move what's on screen. Its content is
              flipped back; top and bottom paddings and insets are swapped. */}
          <KeyboardChatScrollView
            ref={scroller}
            inverted
            keyboardLiftBehavior="whenAtEnd"
            offset={keyboardOffset}
            className="flex-1"
            style={FLIPPED}
            contentContainerClassName="grow"
            contentContainerStyle={{ paddingTop: barHeight + 12, paddingBottom: headerHeight + pinsHeight + 8 }}
            scrollIndicatorInsets={{ top: barHeight, bottom: headerHeight + pinsHeight }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            // A tap on the header's "…" (a React view in the bar, which UIKit doesn't see as a button)
            // reaches the navigation bar too, and iOS scrolls the thread to its top. A chat never wants that.
            scrollsToTop={false}
            scrollEventThrottle={64}
            onScrollBeginDrag={() => (dragged.current = true)}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              setScrolledUp(contentOffset.y > SCROLLED_UP);
              if (dragged.current && hidden > 0 && contentSize.height - contentOffset.y - layoutMeasurement.height < OLDER_WITHIN) setHidden(Math.max(0, hidden - PAGE));
            }}
            onLayout={(e) => (viewportHeight.current = e.nativeEvent.layout.height)}
 >
            <View className="grow gap-1 px-4" style={FLIPPED} onLayout={(e) => (threadHeight.current = e.nativeEvent.layout.height)}>
              {(isPending || !conv) && (
                <View className="flex-1 items-center justify-center">
                  <Spinner />
                </View>
              )}
              {!isPending && messages.length === 0 && !sending.length && conv && (
                // Figma « État vide », conversation neuve: the bot's figurine; a colleague or a group, their avatar.
                <View className="flex-1 justify-center">
                  {directBot ? (
                    <EmptyState mascot={agentMascot(directBot.avatar.color)} title={title} description={t.emptyHint} />
                  ) : (
                    <View className="items-center gap-3 px-8">
                      <ConversationAvatar conversation={conv} me={user.id} className="size-20" />
                      <EmptyState title={title} description={t.emptyHint} className="py-0" />
                    </View>
                  )}
                </View>
              )}
              {messages.slice(hidden).map((m, i) => {
                const at = hidden + i;
                return (
                  <ThreadMessage
                    key={m.id}
                    conversationId={conversationId}
                    m={m}
                    prev={messages[at - 1]}
                    next={messages[at + 1]}
                    me={user.id}
                    last={at === messages.length - 1 && !turns.length}
                    sessionShown={m.data?.event?.type === "code.started" && shownSessions.has(m.data.event.sessionId)}
                    highlighted={highlight === m.id}
                    pinned={isPinned({ messageId: m.id })}
                    mentions={mentions}
                    viewAnswers={viewAnswers}
                    actions={rowActions}
                  />
                );
              })}
              {/* The bot's question: in its column (right of the avatar gutter), a block apart from its message. */}
              {question?.data?.questions && (
                <Post key={question.id} className="mt-3">
                  <QuestionsCard questions={question.data.questions} onAnswer={(text) => send(text, [], [], answerAs(question))} onDismiss={() => setDismissed(question.id)} />
                </Post>
              )}
              {question?.data?.choices && (
                <Post key={question.id} className="mt-3">
                  <ChoiceCard choices={question.data.choices} onAnswer={(text) => send(text, [], [], answerAs(question))} onDismiss={() => setDismissed(question.id)} />
                </Post>
              )}
              {sending.map((s) => (
                <Fragment key={s.key}>
                  <PendingRow failed={s.failed}>
                    <ChatMessage mine text={s.text} attachments={s.attachments} invocations={s.invocations} replyTo={s.replyTo} mentionables={mentions} />
                  </PendingRow>
                  {s.failed && (
                    <Typography accessibilityRole="alert" type="body-xs" align="end" className="text-danger">
                      {t.sendFailed}
                    </Typography>
                  )}
                </Fragment>
              ))}
              {turns.map((turn, i) => {
                const bot = agentById(turn.agentId);
                const start = turnStart(turn.turnId);
                // A run: the same author within the same minute; it opens on who and when, 22 pt under the previous one.
                const before = i > 0 ? { author: `agent:${turns[i - 1]!.agentId}`, at: turnStart(turns[i - 1]!.turnId) } : last && { author: authorKey(last.author), at: entryTime(last) };
                const head = !before || before.author !== `agent:${turn.agentId}` || clockTime(before.at) !== clockTime(start) || dayOf(before.at) !== dayOf(start);
                return (
                  <Fragment key={turn.turnId}>
                    {(!before || dayOf(before.at) !== dayOf(start)) && <DayDivider label={dayLabel(start)} />}
                    <LiveTurn
                      turn={turn}
                      bot={bot}
                      at={start}
                      head={head}
                      className={head && (before || i > 0) ? "mt-5.5" : undefined}
                      conversationId={conversationId}
                      mentions={mentions}
                      canAnswer={turn.requestedBy === user.id || user.role === "admin"}
                    />
                  </Fragment>
                );
              })}
              <TypingLine entries={typing.map((p) => ({ key: p.userId, name: p.name.split(" ")[0]! }))} />
            </View>
          </KeyboardChatScrollView>
        </ConversationFilesProvider>

        {/* Pins, floating under the header (their bar is a surface of its own). */}
        {conv && (
          <View pointerEvents="box-none" className="absolute inset-x-0" style={{ top: headerHeight }} onLayout={(e) => setPinsHeight(e.nativeEvent.layout.height)}>
            <PinnedBar conversationId={conversationId} onJump={jumpTo} onSeeAll={() => setPanel("pins")} />
          </View>
        )}

        {/* The composer, on the thread's background riding on the keyboard, as the web lays it under the thread. Above the
            keyboard it drops its home-indicator margin (the offset takes it back). */}
        <KeyboardStickyView
          pointerEvents="box-none"
          offset={{ opened: keyboardOffset }}
          className="absolute inset-x-0 bottom-0"
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
 >
          {scrolledUp && (
            <View pointerEvents="box-none" className="absolute inset-x-0 bottom-full mb-2 items-center">
              {/* The tap inline, not withTap(toEnd): handing a function that reads a ref to a call made during render is what the compiler forbids. */}
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  haptic.tap();
                  toEnd();
                }}
              >
                {t.latest}
              </Button>
            </View>
          )}
          {/* overflow-visible: the composer's "/" and "@" menu floats above the bar, over the thread. */}
          <Surface variant="transparent" className="gap-2 overflow-visible bg-background px-3 pt-2" style={{ paddingBottom: Math.max(8, insets.bottom) }}>
            {conv && (
              <Composer
                key={conversationId}
                ref={composer}
                conversationId={conversationId}
                placeholder={placeholder}
                botTools={!!directBot}
                mentionables={group ? conv.agents : []}
                recipientId={directPerson?.id}
                onSend={(text, attachments, invocations, mentioned) => {
                  send(text, attachments, invocations, mentioned, replyTo ?? undefined);
                  setReplyTo(null);
                }}
                onTyping={onTyping}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onStop={mine.length ? () => mine.forEach((turn) => stop(turn.turnId)) : undefined}
                stopLabel={t.stop}
              />
            )}
          </Surface>
        </KeyboardStickyView>
      </Surface>
      <ForwardDialog conversationId={conversationId} message={forwarding} onClose={() => setForwarding(null)} />
      <ConversationPanel kind={panel} conversationId={conversationId} onJump={jumpTo} onClose={() => setPanel(null)} />
    </ScopedVariables>
  );
}

const NO_ACCENT = {};
const accents = new Map<string, Record<string, string>>();
/** The scoped variables of a bot's accent, one stable object per colour (ScopedVariables memoizes on it). */
function accentVariables(color: string | undefined) {
  if (!color) return NO_ACCENT;
  const accent = agentAccentColor(color);
  let vars = accents.get(accent);
  if (!vars) accents.set(accent, (vars = { "--bot": accent, "--bot-foreground": "#ffffff" }));
  return vars;
}

/**
 * The thread's native header (web: Figma « Conversation · Dev »): the face, the name, its sessions in
 * grey in the title; search, then the other panels and the info screen under « … ».
 */
function ConversationHeader({
  conv,
  me,
  title,
  counterpart,
  waiting,
  startCode,
  onPanel,
}: {
  conv?: ConversationDetail;
  me: string;
  title: string;
  counterpart?: string;
  waiting: boolean;
  /** No session yet, but its owner may start one: the menu offers it (started ones are in the title). */
  startCode: boolean;
  onPanel: (panel: PanelKind) => void;
}) {
  const t = strings;
  const panelLabels = usePanelLabels();
  const group = conv?.kind === "group";
  const info = conv && infoHref(conv, me);
  const infoLabel = conv && (group ? t.seeMembers(othersOf(conv, "").length) : t.openProfile(counterpart ?? title));
  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerTransparent: true,
          // The thread scrolls under the header: a material keeps it readable.
          headerBlurEffect: "systemChromeMaterial",
          // iOS 26 gives the screen's scroll view an edge effect, and the thread is flipped (scaleY -1): its bottom
          // edge, as tall as the keyboard and the composer, was drawn over the top of the thread, blurring every message.
          scrollEdgeEffects: { top: "hidden", bottom: "hidden", left: "hidden", right: "hidden" },
          headerTitle: () => <HeaderTitle conversation={conv} me={me} title={title} label={infoLabel || undefined} waiting={waiting} />,
        }}
      />
      {conv && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.search} iconRenderingMode="template" accessibilityLabel={panelLabels.search} onPress={withTap(() => onPanel("search"))} />
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.more}
              actions={[
                { label: panelLabels.files, icon: "folder", onPress: () => onPanel("files") },
                { label: panelLabels.pins, icon: "pin", onPress: () => onPanel("pins") },
                startCode && { label: panelLabels.code, icon: "chevron.left.forwardslash.chevron.right", onPress: () => onPanel("code") },
                !!info && !!infoLabel && { label: infoLabel, icon: group ? "person.2" : "info.circle", onPress: () => router.push(info) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
    </>
  );
}

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

const noAgents: AgentSummary[] = [];

const answerAs = (m: Message) => (m.author?.kind === "agent" ? [m.author.id] : []);

type RowActions = {
  reply: (m: Message) => void;
  forward: (m: Message) => void;
  togglePin: (messageId: string) => void;
  delete: (messageId: string) => void;
  quote: (id: string) => void;
  send: (text: string, mentioned: string[], viewAction?: ViewAction) => void;
  laidOut: (id: string, y: number) => void;
};

/** When a message's reply started (its turn), else when it was written: its place and its time in the thread. */
const entryTime = (m: Message) => new Date(m.data?.turn?.startedAt ?? m.createdAt);

const dayOf = (d: Date) => new Date(d).setHours(0, 0, 0, 0);

/** When each live reply was first seen: its time on its first line, stable while it streams. */
const turnStarts = new Map<string, Date>();
function turnStart(turnId: string) {
  let at = turnStarts.get(turnId);
  if (!at) turnStarts.set(turnId, (at = new Date()));
  return at;
}

/**
 * A message of the thread (web: the timeline of screens/Conversation.tsx), with the day before it
 * when it is the day's first. Others' messages are flat under their author, the first of a run (same
 * author, same minute) opening on their face, name and time; yours are grey bubbles on the right,
 * the time under the last of a run.
 */
const ThreadMessage = memo(function ThreadMessage({
  conversationId,
  m,
  prev,
  next,
  me,
  last,
  sessionShown,
  highlighted,
  pinned,
  mentions,
  viewAnswers,
  actions,
}: {
  conversationId: string;
  m: Message;
  prev?: Message;
  next?: Message;
  me: string;
  /** The thread's last word, no reply under way: a failure there can be retried. */
  last: boolean;
  /** A session started here already has its card in the reply that started it. */
  sessionShown: boolean;
  highlighted: boolean;
  pinned: boolean;
  mentions: Mentionable[];
  viewAnswers: ReadonlyMap<string, ViewAction>;
  actions: RowActions;
}) {
  const vt = tr(integrations);
  const at = entryTime(m);
  const before = prev && entryTime(prev);
  const divider = !before || dayOf(before) !== dayOf(at);
  const sameMinute = !!before && clockTime(before) === clockTime(at);
  const newAuthor = divider || !prev || authorKey(prev.author) !== authorKey(m.author);
  const fromMe = m.kind === "user" && m.author?.kind === "user" && m.author.id === me;
  const head = !fromMe && m.kind !== "event" && (newAuthor || !sameMinute);
  const postHead: PostHead | undefined =
    head && m.author
      ? {
          avatar: m.author.kind === "agent" ? <AgentAvatar agent={m.author} size={20} /> : <PersonAvatar person={m.author} size={20} />,
          name: m.author.name,
          time: clockTime(at),
        }
      : undefined;
  const gap = !!prev && (head || (fromMe && newAuthor)) ? "mt-5.5" : undefined;
  // Your messages carry their time under the bubble, once per run within the minute.
  const lastOfMine = fromMe && !(next && authorKey(next.author) === authorKey(m.author) && clockTime(entryTime(next)) === clockTime(at));
  const event = m.kind === "event" ? m.data?.event : undefined;
  const codeStarted = event?.type === "code.started" ? event : null;
  /** A bot asking to use a login of the vault, or to merge a pull request: its card instead of the event line. */
  const vaultRequest = event?.type === "vault.request" ? event : null;
  const githubMerge = event?.type === "github.merge" ? event : null;
  if (codeStarted && sessionShown && !divider) return null;
  const row = (wide: boolean, children: ReactNode, onDelete?: () => void) => (
    <MessageRow
      id={m.id}
      mine={fromMe}
      wide={wide}
      highlighted={highlighted}
      text={m.text}
      attachments={m.kind === "user" ? m.data?.attachments : undefined}
      onReply={() => actions.reply(m)}
      onForward={() => actions.forward(m)}
      pinned={pinned}
      onTogglePin={() => actions.togglePin(m.id)}
      onDelete={onDelete}
    >
      {children}
    </MessageRow>
  );
  const chat = (
    <ChatMessage
      mine={fromMe}
      text={m.text}
      attachments={m.data?.attachments}
      invocations={fromMe ? m.data?.invocations : undefined}
      replyTo={m.data?.replyTo}
      forwarded={m.data?.forwarded}
      mentionables={mentions}
      onQuote={actions.quote}
    />
  );
  const flat = (text: string) => <FlatText text={text} mentionables={mentions} />;
  return (
    <View className="gap-1" onLayout={(e) => actions.laidOut(m.id, e.nativeEvent.layout.y)}>
      {divider && <DayDivider label={dayLabel(at)} />}
      {m.kind === "user" &&
        (fromMe ? (
          <View className={gap}>
            {row(false, chat, () => actions.delete(m.id))}
            {lastOfMine && (
              <Typography type="body-xs" align="end" className="mt-1 text-subtle tabular-nums">
                {clockTime(at)}
              </Typography>
            )}
            <PullRequestLinks text={m.text} conversationId={conversationId} align="end" className="mt-1.5" />
          </View>
        ) : (
          <Post head={postHead} className={gap}>
            {row(true, chat)}
            <PullRequestLinks text={m.text} conversationId={conversationId} />
          </Post>
        ))}
      {m.kind === "bot" && (
        <Post head={postHead} className={gap}>
          {/* What it used, before what it says: as while it works (the live reply starts with it). */}
          {(m.data?.tools || m.data?.approvals) && <ToolLine tools={m.data.tools ?? []} approvals={m.data.approvals} />}
          {(!!m.text || !!m.data?.codeSessions?.length) &&
            row(
              true,
              m.data?.codeSessions?.length ? <ReplyWithSessions conversationId={conversationId} text={m.text} sessions={m.data.codeSessions} bubble={flat} /> : flat(m.text),
              () => actions.delete(m.id),
            )}
          {m.data?.views?.map((view, index) => (
            <ViewCard
              key={index}
              view={view}
              answer={viewAnswers.get(`${m.id}:${index}`)}
              canAct
              onAsk={(text) => actions.send(text, answerAs(m))}
              onAnswer={(action, draft, label, note) =>
                actions.send({ confirm: vt.confirmedText(label), cancel: vt.cancelledText(label), revise: vt.revisedText(label, note ?? "") }[action], [], {
                  messageId: m.id,
                  index,
                  action,
                  ...(action !== "cancel" && { draft }),
                  ...(note && { note }),
                })
              }
            />
          ))}
          {m.data?.previews?.map((p) => {
            // Opened from the share sheet, which previews the page.
            const file = m.data?.attachments?.find((a) => a.id === p.id);
            return file && <FileCard key={p.key} a={file} className="self-start" />;
          })}
          {/* The other files it sent: videos played here, the rest downloaded. */}
          {(() => {
            const files = (m.data?.attachments ?? []).filter((a) => !m.data?.previews?.some((p) => p.id === a.id));
            return files.length > 0 && <SentAttachments items={files} align="start" />;
          })()}
          <PullRequestLinks text={m.text} conversationId={conversationId} />
          {m.data?.mcpRequest && <McpRequestCard id={m.data.mcpRequest} />}
          {m.data?.skillRequest && <SkillRequestCard id={m.data.skillRequest} />}
          {m.data?.botRequest && <BotRequestCard id={m.data.botRequest} />}
        </Post>
      )}
      {codeStarted && !sessionShown && (
        <View className="mt-3 pl-7">
          <CodeSessionCard conversationId={conversationId} sessionId={codeStarted.sessionId} title={codeStarted.title} />
        </View>
      )}
      {event?.type === "bot.failed" && <FailureLine conversationId={conversationId} label={renderEvent(event, locale)} retry={last} />}
      {vaultRequest && (
        <View className="mt-3 pl-7">
          <VaultRequestCard id={vaultRequest.requestId} />
        </View>
      )}
      {githubMerge && (
        <View className="mt-3 pl-7">
          <GitHubMergeCard id={githubMerge.requestId} bot={githubMerge.bot} repo={githubMerge.repo} number={githubMerge.number} />
        </View>
      )}
      {m.kind === "event" && !codeStarted && !vaultRequest && !githubMerge && event?.type !== "bot.failed" && (
        <ThreadEvent label={event ? renderEvent(event, locale) : m.text} conversationId={event?.type === "relay.group" ? event.conversationId : undefined} />
      )}
    </View>
  );
});

const FLIPPED = { transform: [{ scaleY: -1 }] };

/** A bot that couldn't answer, on one line with its red dot, and the retry when it is the last word (web: FailureLine). */
function FailureLine({ conversationId, label, retry }: { conversationId: string; label: string; retry: boolean }) {
  const t = strings;
  const { toast } = useToast();
  const again = useMutation({
    mutationFn: () => retryLast(conversationId),
    onError: () => toast.show({ variant: "danger", label: t.retryFailed }),
  });
  return (
    <View accessibilityRole="summary" className="mt-5.5 flex-row items-center gap-2">
      <View className="size-1.5 rounded-full bg-danger" />
      <Typography type="body-sm" color="muted" className="shrink">
        {label}
      </Typography>
      {retry && (
        <LinkButton size="sm" isDisabled={again.isPending} onPress={withTap(() => again.mutate())}>
          <LinkButton.Label className="font-medium text-foreground">{t.retry}</LinkButton.Label>
        </LinkButton>
      )}
    </View>
  );
}

/** A reply being written (web: LiveTurn): its tools, the streamed text or the typing dots, and a pending approval. */
function LiveTurn({
  turn,
  bot,
  at,
  head,
  className,
  conversationId,
  mentions,
  canAnswer,
}: {
  turn: ActiveTurn;
  bot: AgentSummary | undefined;
  /** When the reply started: on its first line. */
  at: Date;
  /** Starts a run: the bot's face, name and time on its first line. */
  head: boolean;
  className?: string;
  conversationId: string;
  mentions: Mentionable[];
  canAnswer: boolean;
}) {
  const t = strings;
  const visible = hideBlocks(turn.text);
  const typing = <TypingBubble label={t.botTyping(bot?.name ?? t.theBot)} />;
  const text = (value: string, streaming: boolean) => <FlatText text={value} streaming={streaming} mentionables={mentions} />;
  return (
    <Post head={head && bot ? { avatar: <AgentAvatar agent={bot} size={20} />, name: bot.name, time: clockTime(at) } : undefined} className={className}>
      <ToolLine tools={turn.tools} running={!visible} />
      {turn.codeSessions?.length ? (
        <ReplyWithSessions conversationId={conversationId} text={visible} sessions={turn.codeSessions} streaming typing={!turn.approval && typing} bubble={text} />
      ) : visible ? (
        text(visible, true)
      ) : (
        !turn.approval && typing
      )}
      {turn.approval && <ApprovalCard conversationId={conversationId} turnId={turn.turnId} botName={bot?.name ?? t.theBot} approval={turn.approval} canAnswer={canAnswer} />}
    </Post>
  );
}
