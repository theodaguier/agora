import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { ArrowUpIcon, PackageIcon, ClockIcon, PlugIcon, PlusIcon, CloseIcon } from "@/components/icons";
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { defineMessages, useT } from "@/i18n";
import { invocationKey, retryLast, sessionCommand, uploadAttachment, type AgentSummary, type Attachment, type Invocation, type ReplyTo } from "@/lib/api";
import { MentionText, splitMentions } from "@/lib/mentions";
import { personMentionables, usePeople } from "@/lib/people";
import { AwayNotice } from "@/components/AwayNotice";
import { commandsQuery, routinesQuery } from "@/lib/queries";
import { scheduleLabel } from "@/lib/routines";
import { openSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { confirmAction } from "@/lib/confirm";
import { ContextDialog } from "./ContextDialog";
import { PendingFiles, type PendingFile } from "./Attachments";
import { PersonAvatar } from "./ConversationAvatar";
import { QuoteBlock } from "./MessageParts";
import { ModelPicker } from "./ModelPicker";
import { SlashMenu, type SlashItem } from "./SlashMenu";

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
  },
});

export type ComposerHandle = {
  addFiles: (files: FileList | File[]) => void;
  /** Adds a skill, connector or routine chip to the message being written. */
  addInvocation: (invocation: Invocation) => void;
  focus: () => void;
};

const replyMessages = defineMessages({
  en: { cancelReply: "Cancel reply" },
  fr: { cancelReply: "Annuler la réponse" },
});

const MAX_FILE = 25 * 1024 * 1024;
const MAX_INVOCATIONS = 5;

type Props = {
  conversationId: string;
  placeholder: string;
  /** Direct conversation with a bot: "/" (skills, MCP, routines) and model choice. In a group, "/" offers the bots' skills. */
  botTools: boolean;
  /** Bots that can be called with "@" (group). */
  mentionables?: AgentSummary[];
  onSend: (text: string, attachments: (Attachment & { previewUrl?: string })[], invocations: Invocation[], mentions: string[]) => void;
  onTyping?: () => void;
  /** Message being answered, shown above the field until sent or cancelled. */
  replyTo?: ReplyTo | null;
  onCancelReply?: () => void;
  /** The colleague of a direct conversation: warned about if they can't be disturbed, like mentioned ones. */
  recipientId?: string;
  ref?: Ref<ComposerHandle>;
};

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

// Stable default, so the memos that depend on it don't recompute every render.
const noMentionables: AgentSummary[] = [];

/** The field grows with its text, up to 200 px. */
function useAutosize(area: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [area, text]);
}

/** "@" suggestions: the bots that can be called here, then colleagues, best handle matches first. */
function mentionItems(q: string, mentionables: AgentSummary[], people: ReturnType<typeof usePeople>, hint: string): SlashItem[] {
  const bots = mentionables
    .filter((a) => a.name.toLowerCase().startsWith(q) || (!q.includes(" ") && a.name.toLowerCase().includes(q)))
    .map((a) => ({
      key: `agent:${a.id}`,
      kind: "agent" as const,
      name: a.name,
      description: hint,
      media: <AgentAvatar agent={a} className="size-[18px]" />,
    }));
  const colleagues = people
    .filter((p) => p.handle.startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
    .sort((a, b) => Number(!a.handle.startsWith(q)) - Number(!b.handle.startsWith(q)) || a.handle.length - b.handle.length)
    .map((p) => ({
      key: `person:${p.id}`,
      kind: "person" as const,
      name: p.handle,
      description: p.name,
      media: <PersonAvatar person={p} className="size-[18px]" />,
    }));
  return [...bots, ...colleagues];
}

/** Names starting with the query first, then those containing it (in the name or the description). */
function rankByQuery(all: SlashItem[], q: string) {
  if (!q) return all;
  const starts = all.filter((i) => i.name.toLowerCase().startsWith(q));
  const started = new Set(starts);
  const contains = all.filter((i) => !started.has(i) && `${i.name} ${i.description}`.toLowerCase().includes(q));
  return [...starts, ...contains];
}

/** Files attached to the message being written, uploaded as soon as they're added. */
function usePendingFiles(conversationId: string, t: { tooLarge: string; uploadFailed: string }) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const addFiles = (list: FileList | File[]) => {
    for (const file of Array.from(list).slice(0, 10)) {
      const key = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (file.size > MAX_FILE) {
        setFiles((xs) => [...xs, { key, file, previewUrl, status: "error", error: t.tooLarge }]);
        continue;
      }
      setFiles((xs) => [...xs, { key, file, previewUrl, status: "uploading" }]);
      uploadAttachment(conversationId, file).then(
        (attachment) => setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, status: "done", attachment } : x))),
        () => setFiles((xs) => xs.map((x) => (x.key === key ? { ...x, status: "error", error: t.uploadFailed } : x))),
      );
    }
  };

  const removeFile = (key: string) => {
    const f = files.find((x) => x.key === key);
    if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
    setFiles((xs) => xs.filter((x) => x.key !== key));
  };
  return { files, setFiles, addFiles, removeFile };
}

export function Composer({ conversationId, placeholder, botTools, mentionables = noMentionables, onSend, onTyping, replyTo, onCancelReply, recipientId, ref }: Props) {
  const tr = useT(replyMessages);
  const [text, setText] = useState("");
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const { files, setFiles, addFiles, removeFile } = usePendingFiles(conversationId, t);
  // In a group, "/" lists the skills of the group's bots.
  const slash = botTools || mentionables.length > 0;
  const { data: commands } = useQuery({ ...commandsQuery(conversationId), enabled: slash });
  const { data: routines } = useQuery({ ...routinesQuery(conversationId), enabled: botTools });

  useAutosize(area, text);


  const addInvocation = (inv: Invocation) =>
    setInvocations((xs) => (xs.length >= MAX_INVOCATIONS || xs.some((x) => invocationKey(x) === invocationKey(inv)) ? xs : [...xs, inv]));

  useImperativeHandle(ref, () => ({
    addFiles,
    addInvocation: (inv) => {
      addInvocation(inv);
      area.current?.focus();
    },
    focus: () => area.current?.focus(),
  }));

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  // Colleagues can be mentioned everywhere; bots only where they can be called (group).
  const people = usePeople();
  const colored = useMemo(() => [...mentionables, ...personMentionables(people)], [mentionables, people]);
  const recipients = useMemo(
    () => people.filter((p) => p.id !== user.id && (p.id === recipientId || mentionPattern(p.handle).test(text))),
    [people, user.id, recipientId, text],
  );
  const token = dismissed ? null : currentToken(text, caret, slash, true);
  // The field's text becomes transparent and a colored copy is rendered underneath.
  const highlighted = splitMentions(text, colored).some((x) => typeof x !== "string");

  const items = useMemo<SlashItem[]>(() => {
    if (!token) return [];
    if (token.trigger === "@") return mentionItems(token.query.toLowerCase(), mentionables, people, t.mentionHint);
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
      { key: "action:files", kind: "action", name: t.attachFiles, description: t.attachHint, run: () => picker.current?.click() },
      ...(botTools ? [{ key: "action:model", kind: "action" as const, name: t.chooseModel, description: t.chooseModelHint, run: () => setModelOpen(true) }] : []),
      ...(botTools && user.role === "admin"
        ? [{ key: "action:admin", kind: "action" as const, name: t.agentSettings, description: t.administration, run: () => openSettings("agents") }]
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
            media: <AgentAvatar agent={bot} className="size-[18px]" />,
          },
        ];
      }),
      ...(commands?.mcp ?? []).map((m) => ({ key: `mcp:${m.name}`, kind: "mcp" as const, name: m.name, description: m.description })),
      ...(routines ?? []).map((r) => ({ key: `routine:${r.id}`, kind: "routine" as const, id: r.id, name: r.name, description: scheduleLabel(r) })),
      ...actions,
    ].filter((i) => !invocations.some((v) => invocationKey(v) === i.key));
    return rankByQuery(all, token.query.toLowerCase());
  }, [token?.trigger, token?.query, commands, routines, invocations, user.role, mentionables, people, t, conversationId, botTools]);

  const pick = (item: SlashItem) => {
    if (!token) return;
    if (item.kind === "agent" || item.kind === "person") {
      const mention = `@${item.name} `;
      const next = text.slice(0, token.start) + mention + text.slice(token.end);
      const at = token.start + mention.length;
      setText(next);
      setCaret(at);
      requestAnimationFrame(() => area.current?.setSelectionRange(at, at));
      return;
    }
    const next = text.slice(0, token.start) + text.slice(token.end);
    setText(next);
    setCaret(token.start);
    requestAnimationFrame(() => area.current?.setSelectionRange(token.start, token.start));
    if (item.kind === "action" || item.kind === "command") item.run?.();
    else if (item.kind === "routine") addInvocation({ kind: "routine", id: item.id!, name: item.name });
    else addInvocation({ kind: item.kind as "skill" | "mcp", name: item.name, ...(item.agentId && { agentId: item.agentId }) });
  };

  const uploading = files.some((f) => f.status === "uploading");
  const ready = files.filter((f) => f.status === "done" && f.attachment);
  const canSend = !uploading && (text.trim() !== "" || ready.length > 0 || invocations.length > 0);

  const send = () => {
    if (!canSend) return;
    const body = text.trim();
    // Bots still mentioned in the text at send time.
    const mentions = mentionables.filter((a) => mentionPattern(a.name).test(body)).map((a) => a.id);
    onSend(
      body,
      ready.map((f) => ({ ...f.attachment!, previewUrl: f.previewUrl })),
      invocations,
      mentions,
    );
    // The previews of files sent live on in the message; the others are dropped here.
    const sent = new Set(ready);
    for (const f of files) if (f.previewUrl && !sent.has(f)) URL.revokeObjectURL(f.previewUrl);
    setText("");
    setFiles([]);
    setInvocations([]);
  };


  return (
    <>
      <AwayNotice people={recipients} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="relative rounded-[22px] bg-secondary p-1.5"
      >
        {token && (token.trigger === "/" || items.length > 0) && <SlashMenu items={items.slice(0, 60)} active={Math.min(active, Math.max(items.length - 1, 0))} onHover={setActive} onPick={pick} />}

        {invocations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-1.5 pt-1">
            {invocations.map((v) => (
              <Badge
                key={invocationKey(v)}
                variant="secondary"
                size="lg"
                className="bg-accent pr-1"
              >
                {v.kind === "skill" ? <PackageIcon /> : v.kind === "routine" ? <ClockIcon /> : <PlugIcon />}
                {v.name}
                {v.kind !== "routine" && v.agentId && (
                  <span className="text-muted-foreground">{mentionables.find((a) => a.id === v.agentId)?.name}</span>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.remove(v.name)}
                  onClick={() => setInvocations((xs) => xs.filter((x) => x !== v))}
                  className="hover:bg-border"
                >
                  <CloseIcon />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        {replyTo && (
          // The height is set at once (the thread follows in the same frame); only the quote fades in, so nothing bounces.
          <div className="chat-arrive px-1 pb-1.5 pt-1">
            <QuoteBlock
              quote={replyTo}
              className="bg-accent"
              actions={
                <Button variant="ghost" size="icon-xs" aria-label={tr.cancelReply} onClick={onCancelReply} className="hover:bg-border">
                  <CloseIcon />
                </Button>
              }
            />
          </div>
        )}
        <PendingFiles items={files} onRemove={removeFile} />
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <InputGroup className="h-auto items-end border-0 bg-transparent">
          <InputGroupAddon align="inline-start" className="cursor-default py-0 pl-0 has-[>button]:ml-0">
            <InputGroupButton size="icon-sm" aria-label={t.attachFiles} onClick={() => picker.current?.click()}>
              <PlusIcon className="size-5" strokeWidth={1.75} />
            </InputGroupButton>
          </InputGroupAddon>
          <div className="relative flex min-w-0 flex-1">
            {highlighted && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-1 py-1 text-[15px] leading-6">
                <MentionText text={text} mentionables={colored} flat />
              </div>
            )}
            <InputGroupTextarea
              ref={area}
              rows={1}
              value={text}
              aria-expanded={!!token}
              aria-autocomplete="list"
              onChange={(e) => {
                if (e.target.value.length > text.length) onTyping?.();
                setText(e.target.value);
                setCaret(e.target.selectionStart);
                setActive(0);
                setDismissed(false);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  addFiles(e.clipboardData.files);
                }
              }}
              onKeyDown={(e) => {
                if (token && items.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const n = items.length;
                    setActive((a) => (Math.min(a, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    pick(items[Math.min(active, items.length - 1)]!);
                    return;
                  }
                }
                if (!token && replyTo && e.key === "Escape") {
                  e.preventDefault();
                  onCancelReply?.();
                  return;
                }
                if (token && e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(true);
                  return;
                }
                if (e.key === "Backspace" && text === "" && invocations.length) {
                  setInvocations((xs) => xs.slice(0, -1));
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              className={cn("min-h-0 min-w-0 px-1 py-1 text-[15px] leading-6 md:text-[15px]", highlighted && "text-transparent caret-foreground")}
            />
          </div>
          <InputGroupAddon align="inline-end" className="cursor-default gap-1 py-0 pr-0 has-[>button]:mr-0">
            {botTools && <ModelPicker conversationId={conversationId} open={modelOpen} onOpenChange={setModelOpen} />}
            {botTools && <ContextDialog conversationId={conversationId} open={contextOpen} onOpenChange={setContextOpen} />}
            <Button type="submit" size="icon" aria-label={t.send} disabled={!canSend} className="disabled:opacity-40">
              <ArrowUpIcon strokeWidth={2.25} />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </>
  );
}
