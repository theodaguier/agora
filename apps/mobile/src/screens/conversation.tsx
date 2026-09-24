import { renderEvent, type ViewAction } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { Alert, Button, Chip, Spinner, Surface, Typography, useToast } from "heroui-native";
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentAvatar } from "@/components/agent-avatar";
import { ApprovalCard, ApprovalLog } from "@/components/approval-card";
import { AuthorLine, BotBubble, DateDivider, SystemEvent, ToolLine, TypingBubble } from "@/components/bubbles";
import { ChoiceCard } from "@/components/choice-card";
import { Composer, type ComposerHandle } from "@/components/composer";
import { HeaderTitle } from "@/components/conversation/header";
import { infoHref } from "@/components/conversation/info-href";
import { ConversationAvatar, PersonAvatar } from "@/components/conversation-avatar";
import { conversationTitle, othersOf } from "@/components/participants";
import { ConversationPanel, PinnedBar, usePanelLabels, usePins, type PanelKind } from "@/components/conversation-panels";
import { ForwardDialog } from "@/components/forward-dialog";
import { McpRequestCard } from "@/components/mcp-request-card";
import { ChatMessage, MessageRow } from "@/components/message-parts";
import { QuestionsCard } from "@/components/questions-card";
import { useMe } from "@/components/server-scope";
import { SkillRequestCard } from "@/components/skill-request-card";
import { ViewCard } from "@/components/views/ViewCard";
import { api, ApiError, conversationPath, sendMessage } from "@/lib/api";
import { ConversationFilesProvider } from "@/lib/conversation-files";
import { dividerLabel, needsDivider } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { defineMessages, locale, tr } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { conversationQuery, conversationsQuery, messagesQuery } from "@/lib/queries";
import { seedTurns, useTurns, useTyping } from "@/lib/realtime";
import { useThreadHaptics } from "@/screens/conversation-haptics";
import type { AgentSummary, Attachment, Author, ConversationDetail, Invocation, Message, ReplyTo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MenuButton } from "@/components/menus";

/*
 * apps/web/src/screens/Conversation.tsx as an iOS chat: the native header (avatar, name, status,
 * "…" menu), the thread scrolling under it and under the composer's bar.
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
    notSent: "Not sent",
    gone: "This conversation no longer exists or you're no longer part of it.",
    unavailable: "Conversation unavailable.",
    messageTo: (name: string) => `Message ${name}`,
    writeGroup: "Message the group",
    back: "Back",
    emptyHint: "Send a first message to get started.",
    theBot: "The bot",
    botTyping: (name: string) => `${name} is typing…`,
    peopleTyping: (names: string, n: number) => `${names} ${n > 1 ? "are" : "is"} typing…`,
    stop: "Stop response",
    seeMembers: (n: number) => (n === 1 ? "See 1 member" : `See ${n} members`),
    openProfile: (name: string) => `See ${name}'s profile and tasks`,
    more: "More",
  },
  fr: {
    sendFailed: "Message non envoyé. Réessaie.",
    notSent: "Non envoyé",
    gone: "Cette conversation n'existe plus ou tu n'en fais plus partie.",
    unavailable: "Conversation indisponible.",
    messageTo: (name: string) => `Message à ${name}`,
    writeGroup: "Écrire au groupe",
    back: "Retour",
    emptyHint: "Envoie un premier message pour commencer.",
    theBot: "Le bot",
    botTyping: (name: string) => `${name} écrit…`,
    peopleTyping: (names: string, n: number) => `${names} ${n > 1 ? "écrivent" : "écrit"}…`,
    stop: "Arrêter la réponse",
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
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<ComponentRef<typeof KeyboardChatScrollView>>(null);
  /** Position of each message in the thread, to jump to a quoted one. */
  const offsets = useRef(new Map<string, number>());
  /** Heights of the thread's content and of what it shows, to turn a message's position into a scroll offset. */
  const threadHeight = useRef(0);
  const viewportHeight = useRef(0);
  /** Older messages are laid out only when the user scrolls back, never on their own. */
  const dragged = useRef(false);
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

  useEffect(() => {
    if (conv) seedTurns(conv.id, conv.turns);
  }, [conv]);

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
      qc.setQueryData<Message[]>(messagesQuery(conversationId).queryKey, (old) => (old && !old.some((m) => m.id === message.id) ? [...old, message] : old));
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
    quote: (id) => latestRow.current.quote(id),
    send: (text, mentioned, viewAction) => latestRow.current.send(text, mentioned, viewAction),
    laidOut: (id, y) => latestRow.current.laidOut(id, y),
  }));

  const stop = (turnId: string) => api(conversationPath(conversationId, `/turns/${encodeURIComponent(turnId)}/cancel`), { method: "POST" }).catch(() => {});

  const toEnd = () => scroller.current?.scrollTo({ y: 0, animated: true });

  const header = <ConversationHeader conv={conv} me={user.id} title={title} counterpart={(directPerson ?? directBot)?.name} onPanel={setPanel} />;

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

  return (
    <>
      {header}
      <Surface className="flex-1 p-0">
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
                <View className="flex-1 items-center justify-center gap-3 px-8">
                  <ConversationAvatar conversation={conv} me={user.id} className="size-20" />
                  <Typography.Heading type="h4" align="center">
                    {title}
                  </Typography.Heading>
                  <Typography.Paragraph type="body-sm" color="muted" align="center">
                    {t.emptyHint}
                  </Typography.Paragraph>
                </View>
              )}
              {messages.slice(hidden).map((m, i) => (
                <ThreadMessage
                  key={m.id}
                  m={m}
                  prev={messages[hidden + i - 1]}
                  me={user.id}
                  group={group}
                  directBot={!!directBot}
                  highlighted={highlight === m.id}
                  pinned={isPinned({ messageId: m.id })}
                  mentions={mentions}
                  viewAnswers={viewAnswers}
                  actions={rowActions}
 />
              ))}
              {question?.data?.questions && (
                <QuestionsCard
                  key={question.id}
                  questions={question.data.questions}
                  onAnswer={(text) => send(text, [], [], answerAs(question))}
                  onDismiss={() => setDismissed(question.id)}
   />
              )}
              {question?.data?.choices && (
                <ChoiceCard key={question.id} choices={question.data.choices} onAnswer={(text) => send(text, [], [], answerAs(question))} onDismiss={() => setDismissed(question.id)} />
              )}
              {sending.map((s) => (
                <Fragment key={s.key}>
                  <View className={cn("mt-1 ml-auto max-w-[80%]", !s.failed && "opacity-60")}>
                    <ChatMessage mine text={s.text} attachments={s.attachments} invocations={s.invocations} replyTo={s.replyTo} mentionables={mentions} />
                  </View>
                  {s.failed && (
                    <Chip size="sm" variant="soft" color="danger" className="self-end">
                      <Chip.Label>{t.notSent}</Chip.Label>
                    </Chip>
                  )}
                </Fragment>
              ))}
              {turns.map((turn) => {
                const bot = agentById(turn.agentId);
                const visible = hideBlocks(turn.text);
                return (
                  <Fragment key={turn.turnId}>
                    {group && bot && <AuthorLine name={bot.name} avatar={<AgentAvatar agent={bot} className="size-5" />} />}
                    <ToolLine tools={turn.tools} running={!visible} />
                    {visible ? (
                      <View className="max-w-[88%] self-start">
                        <BotBubble text={visible} streaming mentionables={mentions} />
                      </View>
                    ) : (
                      !turn.approval && <TypingBubble label={t.botTyping(bot?.name ?? t.theBot)} />
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
                  </Fragment>
                );
              })}
              {typing.length > 0 && (
                <View className="mt-1 flex-row items-center gap-2">
                  <TypingBubble label="" />
                  <Typography type="body-sm" color="muted">
                    {t.peopleTyping(typing.map((p) => p.name.split(" ")[0]).join(", "), typing.length)}
                  </Typography>
                </View>
              )}
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
          {/* overflow-visible: the composer's "/" and "@" menu floats above the bar, over the thread. */}
          <Surface className="gap-2 overflow-visible px-3 pt-2" style={{ paddingBottom: Math.max(8, insets.bottom) }}>
            {mine.length > 0 && (
              <Button size="sm" variant="secondary" className="self-center" onPress={withTap(() => mine.forEach((turn) => stop(turn.turnId)))}>
                {t.stop}
              </Button>
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
                onSend={(text, attachments, invocations, mentioned) => {
                  send(text, attachments, invocations, mentioned, replyTo ?? undefined);
                  setReplyTo(null);
                }}
                onTyping={onTyping}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
 />
            )}
          </Surface>
        </KeyboardStickyView>
      </Surface>
      <ForwardDialog conversationId={conversationId} message={forwarding} onClose={() => setForwarding(null)} />
      <ConversationPanel kind={panel} conversationId={conversationId} onJump={jumpTo} onClose={() => setPanel(null)} />
    </>
  );
}

/** Answer of a bot choosing to stay silent (apps/api/src/group.ts). */
/** The thread's native header: its title, and the menu of its panels and of its info screen. */
function ConversationHeader({ conv, me, title, counterpart, onPanel }: { conv?: ConversationDetail; me: string; title: string; counterpart?: string; onPanel: (panel: PanelKind) => void }) {
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
          // The thread scrolls under the header: a material keeps it readable (a React Native
          // scroll view doesn't get iOS 26's scroll edge effect).
          headerBlurEffect: "systemChromeMaterial",
          headerTitle: () => <HeaderTitle conversation={conv} me={me} title={title} label={infoLabel || undefined} />,
        }}
 />
      {conv && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="ellipsis"
              label={t.more}
              actions={[
                { label: panelLabels.search, icon: "magnifyingglass", onPress: () => onPanel("search") },
                { label: panelLabels.files, icon: "folder", onPress: () => onPanel("files") },
                { label: panelLabels.pins, icon: "pin", onPress: () => onPanel("pins") },
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
    : text
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
  quote: (id: string) => void;
  send: (text: string, mentioned: string[], viewAction?: ViewAction) => void;
  laidOut: (id: string, y: number) => void;
};

/** A message of the thread, with its date divider and author line. */
const ThreadMessage = memo(function ThreadMessage({
  m,
  prev,
  me,
  group,
  directBot,
  highlighted,
  pinned,
  mentions,
  viewAnswers,
  actions,
}: {
  m: Message;
  prev?: Message;
  me: string;
  group: boolean;
  directBot: boolean;
  highlighted: boolean;
  pinned: boolean;
  mentions: Mentionable[];
  viewAnswers: ReadonlyMap<string, ViewAction>;
  actions: RowActions;
}) {
  const vt = tr(integrations);
  const at = new Date(m.createdAt);
  const divider = needsDivider(prev && new Date(prev.createdAt), at);
  const newAuthor = divider || !prev || authorKey(prev.author) !== authorKey(m.author);
  const fromMe = m.kind === "user" && m.author?.kind === "user" && m.author.id === me;
  const showAuthor = newAuthor && !fromMe && m.kind !== "event" && (group || (m.kind === "user" && !directBot)) && !!m.author;
  return (
    <View className={cn("gap-1", newAuthor && "mt-1.5")} onLayout={(e) => actions.laidOut(m.id, e.nativeEvent.layout.y)}>
      {divider && <DateDivider label={dividerLabel(at)} />}
      {showAuthor && m.author && group && (
        <AuthorLine
          name={m.author.name}
          avatar={m.author.kind === "agent" ? <AgentAvatar agent={m.author} className="size-5" /> : <PersonAvatar person={m.author} className="size-5" />}
        />
      )}
      {m.kind === "user" && (
        <MessageRow
          id={m.id}
          mine={fromMe}
          highlighted={highlighted}
          text={m.text}
          attachments={m.data?.attachments}
          onReply={() => actions.reply(m)}
          onForward={() => actions.forward(m)}
          pinned={pinned}
          onTogglePin={() => actions.togglePin(m.id)}
        >
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
        </MessageRow>
      )}
      {m.kind === "bot" && (
        <>
          {m.data?.tools && <ToolLine tools={m.data.tools} />}
          {m.data?.approvals && <ApprovalLog approvals={m.data.approvals} />}
          {!!m.text && (
            <MessageRow
              id={m.id}
              wide
              highlighted={highlighted}
              text={m.text}
              onReply={() => actions.reply(m)}
              onForward={() => actions.forward(m)}
              pinned={pinned}
              onTogglePin={() => actions.togglePin(m.id)}
            >
              <BotBubble text={m.text} mentionables={mentions} />
            </MessageRow>
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
          {m.data?.mcpRequest && <McpRequestCard id={m.data.mcpRequest} />}
          {m.data?.skillRequest && <SkillRequestCard id={m.data.skillRequest} />}
        </>
      )}
      {m.kind === "event" && <SystemEvent label={m.data?.event ? renderEvent(m.data.event, locale) : m.text} />}
    </View>
  );
});

const FLIPPED = { transform: [{ scaleY: -1 }] };
