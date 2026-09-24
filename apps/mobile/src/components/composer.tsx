import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, Chip, Input, Surface, Typography, type InputRef } from "heroui-native";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { AgentAvatar } from "@/components/agent-avatar";
import { subscribeMentions } from "@/components/agents/routine-mention";
import { AwayNotice } from "@/components/away-notice";
import { AttachMenu, type LocalFile } from "@/components/composer/attach-menu";
import { isImage } from "@/components/attachment-files";
import { PendingFiles, type PendingFile } from "@/components/composer/pending-files";
import { ReplyStrip } from "@/components/composer/reply-strip";
import { useDictation } from "@/components/composer/dictation";
import { confirmAction } from "@/components/confirm-action";
import { ContextDialog } from "@/components/context-dialog";
import { PersonAvatar } from "@/components/conversation-avatar";
import { ArrowUpIcon, ClockIcon, CloseIcon, MicIcon, PackageIcon, PlugIcon } from "@/components/icons";
import { MentionText } from "@/components/mention";
import { ModelButton, ModelMenu } from "@/components/model-picker";
import { useMe } from "@/components/server-scope";
import { SlashMenu, type SlashItem } from "@/components/slash-menu";
import { retryLast, sessionCommand, uploadAttachment } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { useMentionables, usePeople } from "@/lib/people";
import { commandsQuery, routinesQuery } from "@/lib/queries";
import { scheduleLabel } from "@/lib/routines";
import { invocationKey, type AgentSummary, type Attachment, type Invocation, type ReplyTo } from "@/lib/types";

/*
 * apps/web/src/components/Composer.tsx, shaped like ChatGPT's: one card with the message being answered,
 * the pending files and a field that grows up to six lines, over a toolbar: "+" (menu: photo library,
 * camera, Files), the invocation chips, the model for a bot, the microphone (dictation), the send arrow.
 * Return adds a line, the arrow sends.
 */

const messages = defineMessages({
  en: {
    tooLarge: "File too large (25 MB max)",
    uploadFailed: "Upload failed",
    mentionHint: "Ask it to reply",
    attachFiles: "Attach files",
    attachHint: "Images, PDFs, spreadsheets…",
    chooseModel: "Choose model",
    chooseModelHint: "For this thread",
    agentSettings: "Agent settings",
    administration: "Administration",
    cmdNew: "Fresh context: the bot forgets this thread, messages stay visible",
    cmdClear: "Same as /new",
    cmdCompact: "Summarize the thread, then go on with a fresh context",
    cmdRetry: "Answer my last message again",
    cmdContext: "How full the bot's context is",
    newTitle: "Start a fresh context?",
    newBody: "The bot will forget everything said in this thread. Messages stay visible.",
    newAction: "Start over",
    remove: (name: string) => `Remove ${name}`,
    send: "Send",
    dictate: "Dictate",
    stopDictation: "Stop dictation",
  },
  fr: {
    tooLarge: "Fichier trop lourd (25 Mo max)",
    uploadFailed: "Envoi impossible",
    mentionHint: "Le faire répondre",
    attachFiles: "Joindre des fichiers",
    attachHint: "Images, PDF, tableurs…",
    chooseModel: "Choisir le modèle",
    chooseModelHint: "Pour ce fil",
    agentSettings: "Paramètres de l'agent",
    administration: "Administration",
    cmdNew: "Nouveau contexte : le bot oublie ce fil, les messages restent affichés",
    cmdClear: "Comme /new",
    cmdCompact: "Résume le fil, puis continue sur un contexte neuf",
    cmdRetry: "Relancer la réponse à mon dernier message",
    cmdContext: "Remplissage du contexte du bot",
    newTitle: "Démarrer un nouveau contexte ?",
    newBody: "Le bot oubliera tout ce qui s'est dit dans ce fil. Les messages restent affichés.",
    newAction: "Recommencer",
    remove: (name: string) => `Retirer ${name}`,
    send: "Envoyer",
    dictate: "Dicter",
    stopDictation: "Arrêter la dictée",
  },
});

export type ComposerHandle = {
  /** Adds a skill, connector or routine chip to the message being written. */
  addInvocation: (invocation: Invocation) => void;
  focus: () => void;
};

const MAX_FILE = 25 * 1024 * 1024;
const MAX_INVOCATIONS = 5;

type Props = {
  conversationId: string;
  placeholder: string;
  /** Direct conversation with a bot: "/" (skills, MCP, routines) and model choice. In a group, "/" offers the bots' skills. */
  botTools: boolean;
  /** Bots that can be called with "@" (group). */
  mentionables?: AgentSummary[];
  onSend: (text: string, attachments: (Attachment & { previewUri?: string })[], invocations: Invocation[], mentions: string[]) => void;
  onTyping: () => void;
  /** Message being answered, shown above the field until sent or cancelled. */
  replyTo: ReplyTo | null;
  onCancelReply: () => void;
  /** The colleague of a direct conversation: warned about if they can't be disturbed, like mentioned ones. */
  recipientId?: string;
  ref?: Ref<ComposerHandle>;
};

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const mentionPattern = (name: string) => new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu");

type Token = { trigger: "/" | "@"; query: string; start: number; end: number };

/** "/xxx" or "@xxx" word being typed just before the caret. */
function currentToken(text: string, caret: number, withSlash: boolean, withMention: boolean): Token | null {
  const before = text.slice(0, caret);
  const slash = withSlash ? before.match(/(^|\s)\/([\w.-]*)$/) : null;
  if (slash) return { trigger: "/", query: slash[2]!, start: caret - slash[2]!.length - 1, end: caret };
  // Bot names can contain spaces ("@Agent Immobilier").
  const at = withMention ? before.match(/(^|\s)@([^@\n]{0,40})$/) : null;
  if (at) return { trigger: "@", query: at[2]!, start: caret - at[2]!.length - 1, end: caret };
  return null;
}

export function Composer({ conversationId, placeholder, botTools, mentionables = [], onSend, onTyping, replyTo, onCancelReply, recipientId, ref }: Props) {
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [caret, setCaret] = useState(0);
  const [modelOpen, setModelOpen] = useState(false);
  // In a group, the bot whose model is shown; the palette's tabs switch it.
  const [modelBotId, setModelBotId] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const area = useRef<InputRef>(null);
  /** Puts the caret after `at` once the new text is in the field. */
  const moveCaret = (at: number) => {
    setCaret(at);
    requestAnimationFrame(() => area.current?.setSelection(at, at));
  };

  const dictation = useDictation((spoken) => {
    setText(spoken);
    moveCaret(spoken.length);
  });
  const user = useMe();
  const t = messages;
  // In a group, "/" lists the skills of the group's bots.
  const slash = botTools || mentionables.length > 0;
  // A bot answers here: the model can be chosen.
  const models = slash;
  const { data: commands } = useQuery({ ...commandsQuery(conversationId), enabled: slash });
  const { data: routines } = useQuery({ ...routinesQuery(conversationId), enabled: botTools });

  const addFiles = (list: LocalFile[]) => {
    for (const file of list.slice(0, 10)) {
      const key = newKey();
      const pending = { key, name: file.name, mime: file.mime, size: file.size ?? 0, uri: file.uri };
      if (file.size && file.size > MAX_FILE) {
        haptic.error();
        setFiles((xs) => [...xs, { ...pending, status: "error", error: t.tooLarge }]);
        continue;
      }
      setFiles((xs) => [...xs, { ...pending, status: "uploading" }]);
      uploadAttachment(conversationId, file).then(
        (attachment) => setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, status: "ready", attachment } : x))),
        () => {
          haptic.error();
          setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, status: "error", error: t.uploadFailed } : x)));
        },
      );
    }
  };

  const addInvocation = (inv: Invocation) =>
    setInvocations((xs) => (xs.length >= MAX_INVOCATIONS || xs.some((x) => invocationKey(x) === invocationKey(inv)) ? xs : [...xs, inv]));

  useImperativeHandle(ref, () => ({
    addInvocation: (inv) => {
      addInvocation(inv);
      area.current?.focus();
    },
    focus: () => area.current?.focus(),
  }));

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  // A routine mentioned from the bot's profile (components/agents/routine-row.tsx).
  useEffect(
    () =>
      subscribeMentions(conversationId, (inv) => {
        addInvocation(inv);
        area.current?.focus();
      }),
    [conversationId],
  );

  // Colleagues can be mentioned everywhere; bots only where they can be called (group).
  const people = usePeople();
  // Every mention typed is highlighted: the conversation's bots first, then every visible bot and colleague.
  const colored = useMentionables(mentionables);
  const recipients = useMemo(
    () => people.filter((p) => p.id !== user.id && (p.id === recipientId || mentionPattern(p.handle).test(text))),
    [people, user.id, recipientId, text],
  );
  const token = currentToken(text, caret, slash, true);

  // What the slash / @ menu offers for the token being typed. Memoized by the React Compiler.
  const slashItems = (): SlashItem[] => {
    if (!token) return [];
    if (token.trigger === "@") {
      const q = token.query.toLowerCase();
      const bots = mentionables
        .filter((a) => a.name.toLowerCase().startsWith(q) || (!q.includes(" ") && a.name.toLowerCase().includes(q)))
        .map((a) => ({
          key: `agent:${a.id}`,
          kind: "agent" as const,
          name: a.name,
          description: t.mentionHint,
          media: <AgentAvatar agent={a} className="size-6" />,
        }));
      const colleagues = people
        .filter((p) => p.handle.startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
        .sort((a, b) => Number(!a.handle.startsWith(q)) - Number(!b.handle.startsWith(q)) || a.handle.length - b.handle.length)
        .map((p) => ({
          key: `person:${p.id}`,
          kind: "person" as const,
          name: p.handle,
          description: p.name,
          media: <PersonAvatar person={p} className="size-6" />,
        }));
      return [...bots, ...colleagues];
    }
    const fail = (err: unknown) => console.error("session command", err);
    const reset = async () => {
      if (await confirmAction({ title: t.newTitle, description: t.newBody, action: t.newAction })) sessionCommand(conversationId, "new").catch(fail);
    };
    // Hermes session commands, direct conversation only (in a group, each bot has its own session).
    const sessionCommands: SlashItem[] = botTools
      ? [
          { key: "command:new", kind: "command", name: "new", description: t.cmdNew, run: reset },
          { key: "command:clear", kind: "command", name: "clear", description: t.cmdClear, run: reset },
          { key: "command:compact", kind: "command", name: "compact", description: t.cmdCompact, run: () => sessionCommand(conversationId, "compact").catch(fail) },
          { key: "command:retry", kind: "command", name: "retry", description: t.cmdRetry, run: () => retryLast(conversationId).catch(fail) },
          { key: "command:context", kind: "command", name: "context", description: t.cmdContext, run: () => setContextOpen(true) },
        ]
      : [];
    const actions: SlashItem[] = [
      { key: "action:files", kind: "action", name: t.attachFiles, description: t.attachHint, run: () => setAttachOpen(true) },
      ...(models ? [{ key: "action:model", kind: "action" as const, name: t.chooseModel, description: t.chooseModelHint, run: () => setModelOpen(true) }] : []),
      ...(botTools && user.role === "admin"
        ? [{ key: "action:admin", kind: "action" as const, name: t.agentSettings, description: t.administration, run: () => router.push("/profile/admin/agents") }]
        : []),
    ];
    const all: SlashItem[] = [
      ...sessionCommands,
      ...(commands?.skills ?? []).flatMap((s): SlashItem[] => {
        if (!s.agentId) return [{ key: `skill:${s.name}`, kind: "skill", name: s.name, description: s.description }];
        const bot = mentionables.find((a) => a.id === s.agentId);
        if (!bot) return [];
        return [
          {
            key: invocationKey({ kind: "skill", name: s.name, agentId: bot.id }),
            kind: "skill",
            agentId: bot.id,
            name: s.name,
            description: `${bot.name} · ${s.description}`,
            media: <AgentAvatar agent={bot} className="size-6" />,
          },
        ];
      }),
      ...(commands?.mcp ?? []).map((m) => ({ key: `mcp:${m.name}`, kind: "mcp" as const, name: m.name, description: m.description })),
      ...(routines ?? []).map((r) => ({ key: `routine:${r.id}`, kind: "routine" as const, id: r.id, name: r.name, description: scheduleLabel(r) })),
      ...actions,
    ].filter((i) => !invocations.some((v) => invocationKey(v) === i.key));
    const q = token.query.toLowerCase();
    if (!q) return all;
    const starts = all.filter((i) => i.name.toLowerCase().startsWith(q));
    const first = new Set(starts);
    const contains = all.filter((i) => !first.has(i) && `${i.name} ${i.description}`.toLowerCase().includes(q));
    return [...starts, ...contains];
  };
  const items = slashItems();

  const pick = (item: SlashItem) => {
    if (!token) return;
    Haptics.selectionAsync().catch(() => {});
    if (item.kind === "agent" || item.kind === "person") {
      const mention = `@${item.name} `;
      setText(text.slice(0, token.start) + mention + text.slice(token.end));
      moveCaret(token.start + mention.length);
      return;
    }
    setText(text.slice(0, token.start) + text.slice(token.end));
    moveCaret(token.start);
    if (item.kind === "action" || item.kind === "command") item.run?.();
    else if (item.kind === "routine") addInvocation({ kind: "routine", id: item.id!, name: item.name });
    else addInvocation({ kind: item.kind as "skill" | "mcp", name: item.name, ...(item.agentId && { agentId: item.agentId }) });
  };

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "ready" && f.attachment);
  const canSend = !uploading && (text.trim() !== "" || ready.length > 0 || invocations.length > 0);

  const send = () => {
    if (!canSend) return;
    const body = text.trim();
    // Bots still mentioned in the text at send time.
    const mentions = mentionables.filter((a) => mentionPattern(a.name).test(body)).map((a) => a.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // What is still being said would land in the emptied field.
    dictation.abort();
    onSend(
      body,
      ready.map((f) => ({ ...f.attachment!, previewUri: isImage(f.mime) ? f.uri : undefined })),
      invocations,
      mentions,
    );
    setText("");
    setCaret(0);
    setFiles([]);
    setInvocations([]);
    setModelOpen(false);
  };

  const menu = token && (token.trigger === "/" || items.length > 0);
  // In a group, each bot has its own model.
  const modelBots = botTools ? [] : mentionables;
  const modelBot = modelBots.find((b) => b.id === modelBotId) ?? modelBots[0];

  return (
    <View className="gap-2">
      <AwayNotice people={recipients} />
      {/*
       * Floats over the thread, above the bar, so its liquid glass shows the messages through (in the flow it
       * only had the bar's plain background behind it). The bar lets it overflow (screens/conversation.tsx).
       */}
      {(menu || (models && modelOpen)) && (
        <View pointerEvents="box-none" className="absolute inset-x-0 bottom-full mb-2">
          {menu ? (
            <SlashMenu items={items.slice(0, 60)} onPick={pick} />
          ) : (
            <ModelMenu conversationId={conversationId} bots={modelBots} bot={modelBot} onBot={(b) => setModelBotId(b.id)} onClose={() => setModelOpen(false)} />
          )}
        </View>
      )}
      {/*
       * ChatGPT's composer: one card, the field on top (the quote and the files above it), the
       * skills/connectors/routines called with the message, then a toolbar: "+", the model, the send arrow.
       */}
      <Surface variant="secondary" className="gap-1 p-2">
        {replyTo && <ReplyStrip quote={replyTo} onCancel={onCancelReply} />}
        <PendingFiles items={files} onRemove={(key) => setFiles((xs) => xs.filter((x) => x.key !== key))} />
        {/*
         * The web lays a colored copy under a transparent field; a native field takes styled
         * text as children instead (no `value`), so mentions are colored in the field itself.
         */}
        <Input
          ref={area}
          multiline
          placeholder={placeholder}
          aria-expanded={!!menu}
          onChangeText={(value) => {
            if (value.length > text.length) onTyping();
            // Typing takes over from dictation (the text it writes itself is not an edit).
            if (dictation.listening && value !== text) dictation.stop();
            // Typing goes back to the message: the model palette gives way.
            setModelOpen(false);
            setText(value);
          }}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === "Backspace" && text === "" && invocations.length) setInvocations((xs) => xs.slice(0, -1));
          }}
          // Part of the card rather than a field inside it: no fill, no shadow, no focus outline (it is always
          // the one being typed in). The messages' size (text-body), placeholder included. Six lines, then it scrolls.
          className="max-h-[152px] bg-transparent px-2 pt-2.5 pb-1.5 text-body shadow-none ios:focus:outline-transparent android:focus:border-transparent"
        >
          <MentionText text={text} mentionables={colored} flat />
        </Input>
        {invocations.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-1.5 px-1">
            {invocations.map((v) => (
              <InvocationChip
                key={invocationKey(v)}
                invocation={v}
                bot={v.kind !== "routine" && v.agentId ? mentionables.find((a) => a.id === v.agentId)?.name : undefined}
                onRemove={() => setInvocations((xs) => xs.filter((x) => x !== v))}
              />
            ))}
          </ScrollView>
        )}
        <View className="flex-row items-center gap-2">
          <AttachMenu open={attachOpen} onOpenChange={setAttachOpen} onFiles={addFiles} />
          {models && <ModelButton conversationId={conversationId} bot={modelBot} several={modelBots.length > 1} open={modelOpen} onOpenChange={setModelOpen} />}
          <View className="flex-1" />
          <Button
            isIconOnly
            size="sm"
            variant={dictation.listening ? "danger-soft" : "ghost"}
            accessibilityLabel={dictation.listening ? t.stopDictation : t.dictate}
            onPress={() => (dictation.listening ? dictation.stop() : dictation.start(text))}
          >
            <MicIcon size={20} className={dictation.listening ? "text-danger" : "text-foreground"} />
          </Button>
          <Button isIconOnly size="sm" variant="primary" accessibilityLabel={t.send} isDisabled={!canSend} onPress={send}>
            <ArrowUpIcon className="size-[18px] text-accent-foreground" strokeWidth={2.25} />
          </Button>
        </View>
      </Surface>
      {botTools && <ContextDialog conversationId={conversationId} open={contextOpen} onOpenChange={setContextOpen} />}
    </View>
  );
}

/** A skill, connector or routine called with the message; a tap on it takes it back. */
function InvocationChip({ invocation: v, bot, onRemove }: { invocation: Invocation; bot?: string; onRemove: () => void }) {
  const t = messages;
  const Icon = v.kind === "skill" ? PackageIcon : v.kind === "routine" ? ClockIcon : PlugIcon;
  return (
    <Chip size="sm" variant="soft" color="accent" accessibilityRole="button" accessibilityLabel={t.remove(v.name)} onPress={withTap(onRemove)} className="gap-1.5">
      <Icon className="size-4 text-accent" />
      <Chip.Label numberOfLines={1} className="shrink">
        {v.name}
      </Chip.Label>
      {!!bot && (
        <Typography type="body-sm" color="muted">
          {bot}
        </Typography>
      )}
      <CloseIcon className="size-3.5 text-accent" />
    </Chip>
  );
}
