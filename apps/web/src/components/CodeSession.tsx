import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { createContext, Fragment, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent, type ReactNode, type Ref } from "react";
import {
  CODE_ENGINE_NAMES,
  codeDetailLine,
  codeEngineModes,
  codeStatusText,
  nextCodeMode,
  OTHER_ANSWER,
  placeCodeSessions,
  questionAnswer,
  rankByQuery,
  type CodeApproval,
  type CodeBotQuestion,
  type CodeEngine,
  type CodeGit,
  type CodePermissionMode,
  type CodeQuestion,
  type CodeSession,
  type CodeSessionRef,
  type CodeSessionStatus,
  type CodeStep,
  type CodeTodo,
} from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import {
  ArrowUpIcon,
  BranchIcon,
  ChatQuestionIcon,
  CheckCircleIcon,
  CircleIcon,
  CloseIcon,
  ChevronDownIcon,
  ClockIcon,
  ChevronRightIcon,
  ChevronsRightIcon,
  CloseCircleIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  MoreIcon,
  PlusIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StopIcon,
  ToolIcon,
  WarningIcon,
} from "@/components/icons";
import { PendingFiles, SentAttachments } from "@/components/Attachments";
import { BesideButton, besideMessages } from "@/components/BesideButton";
import { PaneHeader } from "@/components/PaneHeader";
import { UserBubble } from "@/components/Bubbles";
import { TabChip } from "@/components/TabChip";
import { usePendingFiles } from "@/components/Composer";
import { MessageText } from "@/components/MessageText";
import { GroupHeading, ModelOption } from "@/components/ModelPicker";
import { ModelLogo } from "@/components/ProviderLogo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/FormLabel";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlashMenu, type SlashItem } from "@/components/SlashMenu";
import { useT } from "@/i18n";
import {
  answerCodeApproval,
  applyCodeSession,
  codeAccountsQuery,
  codeEnginesQuery,
  codeModelsQuery,
  codeReposQuery,
  runCodeGit,
  switchCodeSessionAccount,
  type CodeGitRequest,
  codeSessionQuery,
  codeSessionsQuery,
  deleteCodeSession,
  dropCodeSession,
  sendToCodeSession,
  setCodeSessionMode,
  setCodeSessionModel,
  startCodeSession,
  refreshCodeSessionGit,
  removeCodeSessionWorktree,
  repoEnvQuery,
  saveRepoEnv,
  stopCodeSession,
  writeCommitMessage,
} from "@/lib/code-sessions";
import { confirmAction } from "@/lib/confirm";
import { copyText } from "@/lib/feedback";
import { playSound } from "@/lib/sounds";
import { dividerLabel } from "@/lib/dates";
import { useDraft } from "@/lib/drafts";
import { useFormat } from "@/lib/usage-format";
import { cn } from "@/lib/utils";

const messages = codeSessions;

const active = (s: CodeSessionStatus) => s === "running" || s === "waiting";

/** A status's color, for its icon and its name: working in blue, waiting on someone in amber, done in green, failed in red. */
const statusTone: Record<CodeSessionStatus, string> = {
  running: "text-brand",
  waiting: "text-warning",
  idle: "text-foreground",
  done: "text-success",
  stopped: "text-muted-foreground",
  failed: "text-destructive",
};

/** `asking`: it waits on its question to its bot, not on an approval. */
function StatusIcon({ status, asking, className }: { status: CodeSessionStatus; asking?: boolean; className?: string }) {
  const tone = cn("size-4", statusTone[status], className);
  if (status === "running") return <Spinner className={tone} />;
  if (status === "waiting" && asking) return <ChatQuestionIcon className={tone} />;
  if (status === "waiting") return <ShieldAlertIcon className={tone} />;
  if (status === "idle") return <ClockIcon className={tone} />;
  if (status === "done") return <CheckCircleIcon className={tone} />;
  return <CloseCircleIcon className={tone} />;
}

/** Its status in words, in its color. */
const StatusText = ({ session }: { session: CodeSession }) => <span className={cn(session.status !== "idle" && statusTone[session.status])}>{codeStatusText(useT(messages), session)}</span>;

/* ---------- in the thread ---------- */

/** Card of a Claude Code session, where it was started in the conversation: where it stands, and the way into its steps. */
export function CodeSessionCard({
  conversationId,
  sessionId,
  title,
  onOpen,
  className,
}: {
  conversationId: string;
  sessionId: string;
  title: string;
  onOpen: () => void;
  className?: string;
}) {
  const t = useT(messages);
  const { data } = useQuery(codeSessionsQuery(conversationId));
  const session = data?.find((s) => s.id === sessionId);
  // Deleted by its owner: the card stays, without the way into it.
  const gone = !!data && !session;
  const status = session?.status ?? "running";
  const detail = session && codeDetailLine(session);
  return (
    <Item variant="outline" className={cn("my-1 w-full max-w-[min(680px,88%)]", className)}>
      <ItemMedia variant="icon">{session ? <StatusIcon status={status} asking={!!session.question} /> : <CodeIcon />}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{session?.title ?? title}</ItemTitle>
        <ItemDescription className="truncate">
          {session ? CODE_ENGINE_NAMES[session.engine] : t.claudeCode} · {session ? <StatusText session={session} /> : gone ? t.gone : t.status[status]}
          {detail ? ` · ${detail}` : ""}
        </ItemDescription>
      </ItemContent>
      {!gone && (
        <ItemActions>
          <Button variant="outline" size="sm" onClick={onOpen}>
            {active(status) ? t.follow : t.open}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

/**
 * A bot's reply with the Claude Code sessions it started: each card where the bot was in its text
 * when it started it. `typing`: the reply is still being written after its last card.
 */
export function ReplyWithSessions({
  conversationId,
  text,
  sessions,
  streaming,
  typing,
  onOpen,
  bubble,
}: {
  conversationId: string;
  text: string;
  sessions: CodeSessionRef[];
  streaming?: boolean;
  typing?: ReactNode;
  onOpen: (sessionId: string) => void;
  bubble: (text: string, streaming: boolean) => ReactNode;
}) {
  const parts = placeCodeSessions(text, sessions);
  const last = parts.at(-1);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {parts.map((p) =>
        p.kind === "text" ? (
          <Fragment key={`text:${p.text.slice(0, 40)}:${p.text.length}`}>{bubble(p.text, !!streaming && p === last)}</Fragment>
        ) : (
          <CodeSessionCard
            key={p.session.id}
            conversationId={conversationId}
            sessionId={p.session.id}
            title={p.session.title}
            onOpen={() => onOpen(p.session.id)}
            className="my-0 max-w-full"
          />
        ),
      )}
      {last?.kind === "code" && typing}
    </div>
  );
}

/**
 * Header button of the conversation: every Claude Code session started in it, the latest first,
 * each opening its panel. The owner of the subscription starts one from there too (an empty panel
 * whose first instruction starts it); for everyone else it is hidden while there are none. It hops
 * while one works.
 */
export function CodeSessionsButton({
  conversationId,
  current,
  onOpen,
  onOpenBeside,
  onDeleted,
}: {
  conversationId: string;
  current: string | null;
  onOpen: (sessionId: string) => void;
  /** Opens a session in a pane of its own, beside the conversation. */
  onOpenBeside?: (sessionId: string) => void;
  /** Its owner deleted it: its tab closes. */
  onDeleted?: (sessionId: string) => void;
}) {
  const t = useT(messages);
  const beside = useT(besideMessages);
  const qc = useQueryClient();
  const { user } = useRouteContext({ from: "/app" });
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => deleteCodeSession(conversationId, id),
    onSuccess: (_, id) => {
      dropCodeSession(qc, conversationId, id);
      onDeleted?.(id);
    },
    meta: { loading: t.deleting, success: t.deleted },
  });
  const confirmDelete = async (s: CodeSession) => {
    if (await confirmAction({ title: t.deleteTitle(s.title), description: t.deleteHelp, action: t.deleteSession })) remove.mutate(s.id);
  };
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  // The engines that are theirs and installed: none, they cannot start a session.
  const { data: engines = [] } = useQuery({ ...codeEnginesQuery(conversationId), retry: false });
  const canStart = engines.length > 0;
  // Opened: the pull requests still open, and the branches pushed, as they are on GitHub now.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    for (const s of sessions) {
      if (s.git?.pr?.state === "open" || (s.git?.pushed && !s.git.pr)) {
        refreshCodeSessionGit(conversationId, s.id).then(
          (fresh) => applyCodeSession(qc, fresh),
          () => {},
        );
      }
    }
  };
  if (!sessions.length && !canStart) return null;
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const working = sessions.some((s) => active(s.status));
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={<Button variant="ghost" size="icon" aria-label={working ? t.sessionsWorking : t.sessions} aria-pressed={!!current} className="relative hidden aria-pressed:bg-muted lg:inline-flex" />}
            />
          }
        >
          {/* It hops while a session works: that is the sign, no badge. */}
          <ModelLogo provider="claude-code" className={cn("size-[18px]", working && "code-working")} />
        </TooltipTrigger>
        <TooltipContent>{working ? t.sessionsWorking : t.sessions}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} className="w-80 gap-1 p-1.5">
        <PopoverHeader className="px-2 pt-1">
          <PopoverTitle className="text-xs text-subtle">{t.sessions}</PopoverTitle>
          {!sorted.length && <PopoverDescription>{t.none}</PopoverDescription>}
        </PopoverHeader>
        <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto">
          {sorted.map((s) => {
            const deletable = canStart && s.requestedBy === user.id;
            const row = (
              <Item
                key={s.id}
                size="xs"
                aria-current={s.id === current || undefined}
                render={
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpen(s.id);
                    }}
                  />
                }
                className="flex-nowrap items-start text-left hover:bg-muted/60 aria-[current]:bg-muted"
              >
                <ItemMedia className="mt-0.5">
                  <StatusIcon status={s.status} asking={!!s.question} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate font-normal">{s.title}</ItemTitle>
                  <ItemDescription className="truncate text-xs">
                    <StatusText session={s} />
                    {s.git?.pr ? ` · PR #${s.git.pr.number}` : s.git?.branch ? ` · ${s.git.branch}` : ""}
                    {s.worktree?.removedAt ? ` · ${t.worktree.listGone}` : ""} · {dividerLabel(new Date(s.updatedAt))}
                  </ItemDescription>
                  {s.instruction && (
                    <ItemDescription className="text-xs">
                      {s.instruction.by ? t.instructedBy(s.instruction.by, s.instruction.text) : s.instruction.text}
                    </ItemDescription>
                  )}
                </ItemContent>
              </Item>
            );
            // A right click opens it beside the conversation, and lets its owner delete it.
            if (!onOpenBeside && !deletable) return row;
            return (
              <ContextMenu key={s.id}>
                <ContextMenuTrigger render={row} />
                <ContextMenuContent className="w-48">
                  {onOpenBeside && (
                    <ContextMenuItem
                      onClick={() => {
                        setOpen(false);
                        onOpenBeside(s.id);
                      }}
                    >
                      {beside.beside}
                    </ContextMenuItem>
                  )}
                  {onOpenBeside && deletable && <ContextMenuSeparator />}
                  {deletable && (
                    <ContextMenuItem variant="destructive" disabled={remove.isPending} onClick={() => void confirmDelete(s)}>
                      {t.deleteSession}
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
        {canStart && (
          <>
            <Separator />
            <Item
              size="xs"
              render={
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpen(NEW_CODE_SESSION);
                  }}
                />
              }
              className="text-left hover:bg-muted/60"
            >
              <ItemContent>
                <ItemTitle className="font-normal">{t.newSession}</ItemTitle>
              </ItemContent>
            </Item>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- side panel ---------- */

const WIDE = "(min-width: 1024px)";
const subscribeWide = (cb: () => void) => {
  const mql = window.matchMedia(WIDE);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
/** Room a conversation needs for a panel beside its thread: the thread's minimum, the panel's, and some to spare. */
const WIDE_CONVERSATION = 640;
const WideContext = createContext<boolean | null>(null);
export const WideProvider = WideContext.Provider;

/**
 * Whether a panel fits beside the thread; otherwise the session or the mockup opens in a sheet over it.
 * In a conversation, its own width decides (a narrow pane of the workspace has no room, even on a large
 * screen); elsewhere, the screen's.
 */
export function useWide() {
  const conversation = useContext(WideContext);
  const screen = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);
  return conversation ?? screen;
}

/**
 * Measures the conversation for useWide (`ref` on the element it fills): before the first paint, then
 * as it is resized. A tab behind another measures 0 and keeps what it had, so its panel stays out of sight.
 */
export function useConversationWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const measure = (width: number) => width > 0 && setWide(width >= WIDE_CONVERSATION);
    measure(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => entry && measure(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { wide, ref };
}

/** The panel's id for a session not started yet: the owner's first instruction starts it. */
export const NEW_CODE_SESSION = "new";
/** Sessions not started yet, each in a tab of its own: `new-<random>`, so several can wait side by side. */
export const newCodeSessionId = () => `${NEW_CODE_SESSION}-${crypto.randomUUID().slice(0, 8)}`;
export const isNewCodeSession = (id: string) => id === NEW_CODE_SESSION || id.startsWith(`${NEW_CODE_SESSION}-`);

/**
 * The Claude Code panel: the sessions opened in it, as tabs (the "+" opens another one, new or
 * existing), each kept as it was while another is in front. Large screens show it beside the thread; smaller ones in a sheet over it.
 */
export function CodeSessionPanel({
  conversationId,
  tabs,
  active,
  onSelect,
  onOpen,
  onCloseTab,
  onStarted,
  onClose,
  onDetach,
}: {
  conversationId: string;
  /** Session ids, and `new-…` ones not started yet. */
  tabs: string[];
  active: string;
  onSelect: (sessionId: string) => void;
  /** Opens a session in a new tab: an existing one, or NEW_CODE_SESSION. */
  onOpen: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  /** A new tab's first instruction started this session. */
  onStarted: (tab: string, sessionId: string) => void;
  onClose: () => void;
  /** Moves a tab into a pane of its own, beside the conversation. */
  onDetach?: (sessionId: string) => void;
}) {
  const t = useT(messages);
  const wide = useWide();
  const view = (
    <div className="flex min-h-0 flex-1 flex-col">
      <CodeSessionTabs conversationId={conversationId} tabs={tabs} active={active} onSelect={onSelect} onOpen={onOpen} onCloseTab={onCloseTab} />
      {tabs.map((id) => {
        const detach = wide && onDetach ? () => onDetach(id) : undefined;
        return (
          <div key={id} className={cn("flex min-h-0 flex-1 flex-col", id !== active && "hidden")}>
            {isNewCodeSession(id) ? (
              <NewSessionView conversationId={conversationId} onStarted={(sessionId) => onStarted(id, sessionId)} onClose={onClose} onDetach={detach} />
            ) : (
              <CodeSessionView conversationId={conversationId} sessionId={id} onClose={onClose} onDetach={detach} />
            )}
          </div>
        );
      })}
    </div>
  );
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
          <SheetTitle className="sr-only">{t.claudeCode}</SheetTitle>
          {view}
        </SheetContent>
      </Sheet>
    );
  }
  return <aside className="flex h-full w-full flex-col bg-sidebar">{view}</aside>;
}

/**
 * The panel's tabs: one per session opened in it. "+" opens another: a new session (its owner only)
 * or one of the conversation's sessions not in a tab yet, the latest first.
 */
function CodeSessionTabs({
  conversationId,
  tabs,
  active,
  onSelect,
  onOpen,
  onCloseTab,
}: {
  conversationId: string;
  tabs: string[];
  active: string;
  onSelect: (sessionId: string) => void;
  onOpen: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
}) {
  const t = useT(messages);
  const c = useT(common);
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  const { data: engines = [] } = useQuery({ ...codeEnginesQuery(conversationId), retry: false });
  const canStart = engines.length > 0;
  const others = sessions.filter((s) => !tabs.includes(s.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div role="tablist" aria-label={t.sessions} className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-1.5">
      {tabs.map((id) => {
        const session = sessions.find((s) => s.id === id);
        const title = session?.title ?? t.newSession;
        return (
          <TabChip
            key={id}
            title={title}
            icon={session ? <StatusIcon status={session.status} /> : <CodeIcon />}
            active={id === active}
            closeLabel={`${c.close} ${title}`}
            onSelect={() => onSelect(id)}
            onClose={() => onCloseTab(id)}
          />
        );
      })}
      {(canStart || others.length > 0) && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.openSession} className="shrink-0" />} />}
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>{t.openSession}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-80">
            {canStart && <DropdownMenuItem onClick={() => onOpen(NEW_CODE_SESSION)}>{t.newSession}</DropdownMenuItem>}
            {canStart && others.length > 0 && <DropdownMenuSeparator />}
            {others.length > 0 && (
              <DropdownMenuGroup className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel>{t.sessions}</DropdownMenuLabel>
                {others.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onOpen(s.id)} className="items-start">
                    <StatusIcon status={s.status} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <StatusText session={s} /> · {dividerLabel(new Date(s.updatedAt))}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** A session as a workspace tab: the whole pane for its steps. A new one becomes the session its first instruction starts (`onStarted`). */
export function CodeSessionPage({
  conversationId,
  sessionId,
  onClose,
  onStarted,
}: {
  conversationId: string;
  sessionId: string;
  onClose?: () => void;
  onStarted: (sessionId: string) => void;
}) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {isNewCodeSession(sessionId) ? (
        <NewSessionView conversationId={conversationId} onStarted={onStarted} onClose={onClose} page />
      ) : (
        <CodeSessionView conversationId={conversationId} sessionId={sessionId} onClose={onClose} page />
      )}
    </section>
  );
}

/**
 * A session not started yet: the same panel, empty, with the field. Its first instruction starts it,
 * in the repository and with the model chosen beside the field, and Claude Code names it from there.
 */
function NewSessionView({
  conversationId,
  onStarted,
  onClose,
  onDetach,
  page,
}: {
  conversationId: string;
  onStarted: (sessionId: string) => void;
  onClose?: () => void;
  onDetach?: () => void;
  /** A tab of its own: the close button closes it. */
  page?: boolean;
}) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  // The conversation's repositories, the latest session's first: usually the one to work on again.
  const recent = [...new Set([...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap((s) => (s.git?.repo ? [s.git.repo] : [])))];
  const [repo, setRepo] = useState<string | null>(recent[0] ?? null);
  const { data: engines = [] } = useQuery({ ...codeEnginesQuery(conversationId), retry: false });
  // Claude Code unless picked otherwise, or not available to them.
  const [picked, setPicked] = useState<CodeEngine | null>(null);
  const engine = (picked && engines.some((e) => e.id === picked) ? picked : (engines.find((e) => e.id === "claude") ?? engines[0])?.id) ?? "claude";
  const [model, setModel] = useState<string | null>(null);
  const [mode, setMode] = useState<CodePermissionMode>("bypassPermissions");
  const pickEngine = (next: CodeEngine) => {
    setPicked(next);
    // Each engine has its own models, and the headless ones only act on their own or plan.
    setModel(null);
    if (!codeEngineModes(next).includes(mode)) setMode("bypassPermissions");
  };
  const { user } = useRouteContext({ from: "/app" });
  const [text, setText] = useDraft(`${user.id}:code:${conversationId}:new`);
  const files = useInstructionFiles(conversationId);
  const start = useMutation({
    mutationFn: ({ task, attachmentIds }: { task: string; attachmentIds: string[] }) =>
      startCodeSession(conversationId, { task, attachmentIds, mode, engine, ...(repo && { repo }), ...(model && { model }) }),
    onSuccess: (s) => {
      setText("");
      files.clear();
      applyCodeSession(qc, s);
      onStarted(s.id);
    },
  });
  const canSend = !files.uploading && !start.isPending && (!!text.trim() || files.ids.length > 0);
  const submit = () => {
    if (canSend) start.mutate({ task: text.trim(), attachmentIds: files.ids });
  };
  return (
    <div {...fileDrop(files.add)} className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        title={t.newSession}
        actions={
          <>
            {onDetach && <BesideButton onClick={onDetach} />}
            {onClose && (
              <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose}>
                {page ? <CloseIcon /> : <ChevronsRightIcon />}
              </Button>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 border-t">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{start.isPending ? <Spinner /> : <ModelLogo provider={engine} />}</EmptyMedia>
            <EmptyTitle>{CODE_ENGINE_NAMES[engine]}</EmptyTitle>
            <EmptyDescription>{start.isPending ? t.empty : t.newHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-[22px] bg-secondary p-1.5"
        >
          <PendingFiles items={files.files} onRemove={files.remove} />
          <InputGroup className="h-auto flex-col items-stretch border-0 bg-transparent">
            <InputGroupTextarea
              rows={2}
              value={text}
              autoFocus
              readOnly={start.isPending}
              placeholder={t.placeholderNew(CODE_ENGINE_NAMES[engine])}
              onChange={(e) => setText(e.target.value)}
              onPaste={files.onPaste}
              onKeyDown={(e) => {
                if (e.key === "Tab" && e.shiftKey) {
                  e.preventDefault();
                  setMode(nextCodeMode(mode, engine));
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="max-h-60 min-h-0 min-w-0 px-2 py-1 text-[15px] leading-6 md:text-[15px]"
            />
            <InputGroupAddon align="block-end" className="cursor-default gap-1 px-0 pb-0">
              <AttachButton onFiles={files.add} disabled={start.isPending} />
              <RepoPicker conversationId={conversationId} recent={recent} value={repo} onSelect={setRepo} />
              <ModePicker engine={engine} value={mode} onSelect={setMode} />
              <span className="flex-1" />
              {engines.length > 1 && <EnginePicker engines={engines} value={engine} onSelect={pickEngine} />}
              <CodeModelPicker conversationId={conversationId} engine={engine} value={model} onSelect={setModel} />
              <Button type="submit" size="icon" aria-label={t.send} disabled={!canSend} className="rounded-full disabled:opacity-40">
                {start.isPending ? <Spinner /> : <ArrowUpIcon strokeWidth={2.25} />}
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  );
}

/** The files of an instruction: uploaded to the conversation as they are added, their ids sent with it. */
function useInstructionFiles(conversationId: string) {
  const t = useT(messages);
  const { files, setFiles, addFiles, removeFile } = usePendingFiles(conversationId, t);
  return {
    files,
    add: addFiles,
    remove: removeFile,
    uploading: files.some((f) => f.status === "uploading"),
    ids: files.flatMap((f) => (f.status === "done" && f.attachment ? [f.attachment.id] : [])),
    /** Sent: the instruction shows them from the server from now on. */
    clear: () => {
      for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      setFiles([]);
    },
    onPaste: (e: ClipboardEvent) => {
      if (!e.clipboardData.files.length) return;
      e.preventDefault();
      addFiles(e.clipboardData.files);
    },
  };
}

/** Files dropped anywhere on the panel go to its field; the conversation's own drop leaves them (data-file-drop). */
const fileDrop = (onFiles: (files: FileList) => void) => ({
  "data-file-drop": true,
  onDragOver: (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  },
  onDrop: (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    onFiles(e.dataTransfer.files);
  },
});

/** "+" beside the field, as in the conversation's: images, screenshots, any file for Claude Code. */
function AttachButton({ onFiles, disabled }: { onFiles: (files: FileList) => void; disabled?: boolean }) {
  const t = useT(messages);
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <InputGroupButton size="icon-sm" aria-label={t.attachFiles} disabled={disabled} onClick={() => picker.current?.click()}>
        <PlusIcon className="size-5" strokeWidth={1.75} />
      </InputGroupButton>
    </>
  );
}

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Where a new session works: a repository of the conversation, one the instance's GitHub token reaches, one typed, or none. */
function RepoPicker({ conversationId, recent, value, onSelect }: { conversationId: string; recent: string[]; value: string | null; onSelect: (repo: string | null) => void }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState(false);
  const [search, setSearch] = useState("");
  const { data: repos = [], isPending } = useQuery({ ...codeReposQuery(conversationId), enabled: open });
  const others = repos.filter((r) => !recent.includes(r.repo));
  // A repository typed in full, that no list holds (another owner's, or one the token does not list).
  const typed = search.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
  const custom = REPO.test(typed) && !recent.includes(typed) && !repos.some((r) => r.repo === typed) ? typed : null;
  const choose = (repo: string | null) => {
    setOpen(false);
    setSearch("");
    onSelect(repo);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<InputGroupButton size="sm" aria-label={t.repo} />} className="min-w-0 max-w-[60%] shrink gap-1.5">
        <BranchIcon className="size-3.5 shrink-0" />
        <span className="truncate">{value ?? t.noRepo}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={8} className="w-80 p-0">
        <Command>
          <CommandInput placeholder={t.searchRepo} value={search} onValueChange={setSearch} />
          <CommandList className="max-h-80">
            <CommandEmpty>{isPending ? <Spinner className="mx-auto size-4" /> : t.noRepos}</CommandEmpty>
            {custom && (
              <CommandGroup>
                <CommandItem value={custom} onSelect={() => choose(custom)} size="sm">
                  {t.useRepo(custom)}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem value={t.noRepo} data-checked={!value} onSelect={() => choose(null)} size="sm">
                {t.noRepo}
              </CommandItem>
            </CommandGroup>
            {recent.length > 0 && (
              <CommandGroup heading={t.recentRepos}>
                {recent.map((r) => (
                  <CommandItem key={r} value={r} data-checked={r === value} onSelect={() => choose(r)} size="sm">
                    <span className="truncate">{r}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading="GitHub">
                {others.map((r) => (
                  <CommandItem key={r.repo} value={r.repo} data-checked={r.repo === value} onSelect={() => choose(r.repo)} size="sm">
                    <span className="truncate">{r.repo}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {value && (
              <>
                <CommandSeparator alwaysRender />
                <CommandGroup forceMount>
                  <CommandItem
                    size="sm"
                    forceMount
                    value="__credentials"
                    onSelect={() => {
                      setOpen(false);
                      setCredentials(true);
                    }}
                  >
                    {t.credentials.open}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
      {value && <RepoCredentialsDialog conversationId={conversationId} repo={value} open={credentials} onClose={() => setCredentials(false)} />}
    </Popover>
  );
}

/**
 * A repository's credentials, the .env its clone never has: Agora writes them into the worktree of
 * every session started on it (ignored by git). Shown in clear to the owner only.
 */
function RepoCredentialsDialog({ conversationId, repo, open, onClose }: { conversationId: string; repo: string; open: boolean; onClose: () => void }) {
  const t = useT(messages).credentials;
  const c = useT(common);
  const { data, isPending } = useQuery({ ...repoEnvQuery(conversationId, repo), enabled: open });
  const save = useMutation({
    mutationFn: (env: string) => saveRepoEnv(conversationId, repo, env),
    onSuccess: onClose,
    meta: { success: t.saved, error: false },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(String(new FormData(e.currentTarget).get("env") ?? ""));
          }}
        >
          <DialogHeader>
            <DialogTitle className="pr-6">{t.title(repo)}</DialogTitle>
            <DialogDescription>{t.help}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5">
            <Field>
              <FormLabel htmlFor="code-repo-env">{t.label}</FormLabel>
              {isPending ? (
                <Spinner className="size-4 text-muted-foreground" />
              ) : (
                <Textarea
                  key={repo}
                  id="code-repo-env"
                  name="env"
                  rows={10}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  defaultValue={data?.env ?? ""}
                  placeholder={t.placeholder}
                  className="max-h-96 font-mono text-xs leading-5 md:text-xs"
                />
              )}
            </Field>
            {save.error && <FieldError>{save.error.message}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
            <Button type="submit" disabled={isPending || save.isPending}>
              {save.isPending ? c.saving : c.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Everything the session did, live; its pending approval and the owner's field stay in view at the bottom. */
/** `page`: a tab of its own, the close button closes it. */
function CodeSessionView({
  conversationId,
  sessionId,
  onClose,
  onDetach,
  page,
}: {
  conversationId: string;
  sessionId: string;
  onClose?: () => void;
  onDetach?: () => void;
  page?: boolean;
}) {
  const t = useT(messages);
  const c = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const { data: session } = useQuery(codeSessionQuery(conversationId, sessionId));
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const follow = useRef(true);
  // Follows the work while the reader stays at the bottom.
  useLayoutEffect(() => {
    if (follow.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [session?.steps]);

  const owner = !!session && session.requestedBy === user.id;
  // What the run waits for, after its last step: scrolled with them, so a long question never hides the steps.
  const approval = session?.approval;
  const pending =
    session && (approval || session.question) ? (
      <>
        {approval?.kind === "question" && approval.questions ? (
          <QuestionBlock conversationId={conversationId} session={session} approval={approval} questions={approval.questions} canAnswer={owner} />
        ) : approval?.kind === "plan" ? (
          <PlanBlock conversationId={conversationId} session={session} approval={approval} canAnswer={owner} />
        ) : (
          approval && <ApprovalBlock conversationId={conversationId} session={session} approval={approval} canAnswer={owner} />
        )}
        {session.question && <BotQuestionBlock conversationId={conversationId} session={session} question={session.question} canAnswer={owner} />}
      </>
    ) : null;
  // A new one comes into view, even scrolled up: the run waits for it.
  const waitingFor = approval?.id ?? session?.question?.text;
  useLayoutEffect(() => {
    if (!waitingFor) return;
    follow.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [waitingFor]);
  const composer = useRef<{ addFiles: (files: FileList) => void }>(null);
  useGitRefresh(conversationId, sessionId, !!session?.git && !session.worktree?.removedAt);
  return (
    <div {...(owner && fileDrop((files) => composer.current?.addFiles(files)))} className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        media={session && <StatusIcon status={session.status} asking={!!session.question} />}
        title={session?.title ?? t.claudeCode}
        description={
          session && (
            <>
              <StatusText session={session} />
              {session.mode !== "bypassPermissions" ? ` · ${t.modes[session.mode]}` : ""}
              {session.activity && active(session.status) ? ` · ${session.activity}` : <UsageLine session={session} />}
            </>
          )
        }
        actions={
          <>
            {session && <SessionDetails conversationId={conversationId} session={session} showModel={!owner} owner={owner} />}
            {onDetach && <BesideButton onClick={onDetach} />}
            {onClose && (
              <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose}>
                {page ? <CloseIcon /> : <ChevronsRightIcon />}
              </Button>
            )}
          </>
        }
      />

      {!session ? (
        <div className="flex min-h-0 flex-1 border-t">
          <Empty>
            <Spinner className="size-5 text-muted-foreground" />
          </Empty>
        </div>
      ) : (
        <>
          {session.limit && <LimitAlert conversationId={conversationId} session={session} limit={session.limit} owner={owner} />}

          <div className="relative min-h-0 flex-1 border-t">
            <div
              ref={scroller}
              onScroll={(e) => {
                const el = e.currentTarget;
                const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                follow.current = bottom;
                setAtBottom(bottom);
              }}
              className="h-full overflow-y-auto px-4 py-4"
            >
              {session.steps.length === 0 && !pending ? (
                <Empty className="h-full">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Spinner />
                    </EmptyMedia>
                    <EmptyDescription>{t.empty}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-4">
                  <Timeline steps={session.steps} running={session.status === "running"} />
                  {pending}
                </div>
              )}
            </div>
            {!atBottom && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
                onClick={() => {
                  follow.current = true;
                  scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
                }}
              >
                {t.latest}
              </Button>
            )}
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2">
            {session.todos.length > 0 && <TodoBar todos={session.todos} running={session.status === "running"} />}
            {owner && session.worktree && <WorktreeBanner conversationId={conversationId} session={session} worktree={session.worktree} />}
            {session.git && <ChangesBar conversationId={conversationId} session={session} git={session.git} owner={owner && !session.worktree?.removedAt} />}
            {owner ? (
              <SessionComposer ref={composer} conversationId={conversationId} session={session} />
            ) : (
              <p className="px-1 text-[13px] text-muted-foreground">{t.readOnly}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const GIT_REFRESH_MS = 30_000;

/**
 * While the panel is open, the branch and its pull request follow GitHub: read again when it
 * opens, when the window comes back, and every 30 s while it is visible (a PR merged or closed
 * there, a push from elsewhere). During a run the server rereads them itself after each push.
 */
function useGitRefresh(conversationId: string, sessionId: string, enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      refreshCodeSessionGit(conversationId, sessionId).then(
        (s) => applyCodeSession(qc, s),
        () => {},
      );
    };
    refresh();
    const timer = setInterval(refresh, GIT_REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [conversationId, sessionId, enabled, qc]);
}

const usageTime = (u: NonNullable<CodeSession["usage"]>) => {
  const minutes = u.durationMs / 60_000;
  return minutes < 1 ? `${Math.max(1, Math.round(u.durationMs / 1000))} s` : `${Math.round(minutes)} min`;
};

/** After the status: what the session cost and how long it ran; the detail in its details. */
function UsageLine({ session }: { session: CodeSession }) {
  const f = useFormat();
  const u = session.usage;
  return u ? <span className="tabular-nums">{` · ${f.cost(u.costUsd)} · ${usageTime(u)}`}</span> : null;
}

/**
 * The session's details, out of the header: its folder, what it consumed, the model for those who
 * cannot change it; for its owner, the account and the repository's credentials.
 */
function SessionDetails({ conversationId, session, showModel, owner }: { conversationId: string; session: CodeSession; showModel: boolean; owner: boolean }) {
  const t = useT(messages);
  const f = useFormat();
  const [credentials, setCredentials] = useState(false);
  const u = session.usage;
  return (
    <>
      <Popover>
        <Tooltip>
          <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" size="icon" aria-label={t.details} />} />}>
            <MoreIcon />
          </TooltipTrigger>
          <TooltipContent>{t.details}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" sideOffset={6} className="w-80 gap-0 p-1.5">
          <Item
            size="sm"
            render={<button type="button" onClick={() => copyText(session.cwd)} />}
            aria-label={t.copyPath}
            className="flex-nowrap text-left hover:bg-muted/60"
          >
            <ItemContent className="min-w-0">
              <ItemTitle>{t.folder}</ItemTitle>
              <ItemDescription className="break-all font-mono text-xs">{session.cwd}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <CopyIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
          {showModel && session.model && (
            <Item size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>{t.model}</ItemTitle>
                <ItemDescription>{session.model}</ItemDescription>
              </ItemContent>
            </Item>
          )}
          {owner && session.account && (
            <Item size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>{t.account}</ItemTitle>
                <ItemDescription className="truncate">
                  {session.account.email ?? t.serverAccount}
                  {session.account.plan ? ` · ${session.account.plan}` : ""}
                </ItemDescription>
              </ItemContent>
            </Item>
          )}
          {u && (
            <Item size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle>{t.usage}</ItemTitle>
                <ItemDescription className="tabular-nums">
                  {t.tokens(f.compact(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens))} · {f.cost(u.costUsd)} · {t.runs(u.runs)} · {usageTime(u)}
                </ItemDescription>
                <ItemDescription className="tabular-nums">
                  {t.usageDetail(f.compact(u.inputTokens), f.compact(u.outputTokens), f.compact(u.cacheReadTokens + u.cacheWriteTokens), u.turns)}
                </ItemDescription>
                <ItemDescription className="text-xs">{t.costNote}</ItemDescription>
              </ItemContent>
            </Item>
          )}
          {owner && session.repo && (
            <div className="px-2.5 pb-1.5 pt-1">
              <Button variant="outline" size="sm" onClick={() => setCredentials(true)}>
                {t.credentials.open}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {owner && session.repo && <RepoCredentialsDialog conversationId={conversationId} repo={session.repo} open={credentials} onClose={() => setCredentials(false)} />}
    </>
  );
}

/**
 * Once its owner is done with a session started on a repository: the way to delete its worktree
 * (the branch stays in the clone). Deleted, what a new instruction does.
 */
function WorktreeBanner({ conversationId, session, worktree }: { conversationId: string; session: CodeSession; worktree: NonNullable<CodeSession["worktree"]> }) {
  const t = useT(messages).worktree;
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeCodeSessionWorktree(conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { loading: t.removing, success: t.removed },
  });
  if (worktree.removedAt) return active(session.status) ? null : <p className="mb-2 px-1 text-[13px] text-muted-foreground">{t.gone(worktree.branch)}</p>;
  // Its task is over: its PR merged, or closed without being merged.
  const closed = session.status === "idle" && session.git?.pr?.state === "closed";
  if (session.status !== "done" && !closed) return null;
  const confirm = async () => {
    const branch = session.git?.branch ?? worktree.branch;
    if (await confirmAction({ title: t.confirmTitle(session.title), description: t.confirmHelp(branch, session.git?.changes ?? 0), action: t.remove })) remove.mutate();
  };
  return (
    <Alert className="mb-2">
      <AlertDescription>
        <p>{closed ? t.closed : t.done}</p>
        <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => void confirm()} className="mt-2">
          {remove.isPending ? t.removing : t.remove}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Usage warning; once the limit is hit, its owner can move the session to another of their Claude accounts. */
function LimitAlert({ conversationId, session, limit, owner }: { conversationId: string; session: CodeSession; limit: NonNullable<CodeSession["limit"]>; owner: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const rejected = limit.status === "rejected";
  // Only Claude Code's accounts are switched from here.
  const { data: accounts = [] } = useQuery({ ...codeAccountsQuery(conversationId), enabled: owner && rejected && session.engine === "claude" });
  const others = accounts.filter((a) => a.id !== (session.account?.id ?? null));
  const change = useMutation({
    mutationFn: (id: string | null) => switchCodeSessionAccount(conversationId, session.id, id),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      void qc.invalidateQueries({ queryKey: codeAccountsQuery(conversationId).queryKey });
    },
    meta: { success: t.switched },
  });
  const window = t.windows[limit.window] ?? limit.window;
  const at = limit.resetsAt ? new Date(limit.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="shrink-0 px-4 pb-3">
      <Alert>
        <WarningIcon />
        <AlertDescription>
          <p>{rejected ? t.limited(window, at) : t.limit(`${Math.round((limit.utilization ?? 0) * 100)} %`, window)}</p>
          {rejected && owner && others.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {others.map((a) => (
                <Button key={a.id ?? "server"} size="sm" variant="outline" disabled={change.isPending} onClick={() => change.mutate(a.id)}>
                  {change.isPending && change.variables === a.id ? c.inProgress : t.switchTo(a.email ?? t.serverAccount)}
                </Button>
              ))}
            </div>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

/* ---------- git ---------- */

const FILE_STATE = { added: "A", modified: "M", deleted: "D", renamed: "R" } as const;
const FILE_TONE = { added: "text-success", modified: "text-warning", deleted: "text-destructive", renamed: "text-muted-foreground" } as const;

/**
 * Where the clone stands, docked above the field as in an IDE's agent panel: the branch, the files
 * changed with their lines, the pull request, and for the owner the next git action (commit, push,
 * PR, merge). A commit without a message gets one written by Claude Code from the diff.
 */
function ChangesBar({ conversationId, session, git, owner }: { conversationId: string; session: CodeSession; git: CodeGit; owner: boolean }) {
  const t = useT(messages).git;
  const c = useT(common);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [prDialog, setPrDialog] = useState(false);
  const run = useMutation({
    // One after the other: "commit and push" is two actions, each its own step.
    mutationFn: async (reqs: CodeGitRequest[]) => {
      let s: CodeSession | undefined;
      for (const req of reqs) s = await runCodeGit(conversationId, session.id, req);
      return s!;
    },
    onSuccess: (s, reqs) => {
      applyCodeSession(qc, s);
      if (reqs[0]?.action === "commit") setMessage("");
      setPrDialog(false);
    },
    meta: {
      loading: (reqs: CodeGitRequest[]) => (reqs[0]?.action === "commit" && !reqs[0].message ? t.writing : c.inProgress),
      success: (_: CodeSession, reqs: CodeGitRequest[]) => ({ commit: t.committed, push: t.pushed, pull: t.pulled, pr: t.opened, merge: t.merged })[reqs.at(-1)!.action],
      error: t.failed,
    },
  });
  const generate = useMutation({
    mutationFn: () => writeCommitMessage(conversationId, session.id),
    onSuccess: (m) => {
      setMessage(m);
      setOpen(true);
    },
    meta: { error: t.failed },
  });

  const files = git.files ?? [];
  const added = files.reduce((n, f) => n + (f.added ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removed ?? 0), 0);
  const onBase = !!git.branch && git.branch === git.base;
  const pr = git.pr;
  const openPr = pr?.state === "open" ? pr : null;
  const working = active(session.status);
  const busy = working || run.isPending || generate.isPending;
  const commitReq = (): CodeGitRequest => ({ action: "commit", message: message.trim() });
  const merge = async () => {
    if (openPr && (await confirmAction({ title: t.mergeTitle(openPr.number, openPr.base), description: t.mergeHelp, action: t.merge, destructive: false }))) {
      run.mutate([{ action: "merge", method: "squash" }]);
    }
  };

  // The next thing to do with the branch, and what else can be done with it.
  type Action = { label: string; onSelect: () => void };
  const canPush = git.github && !onBase && git.ahead > 0;
  const canOpenPr = git.github && !onBase && !openPr && (git.ahead > 0 || git.pushed);
  const actions: Action[] = !owner
    ? []
    : git.changes > 0
      ? [
          { label: t.commit, onSelect: () => run.mutate([commitReq()]) },
          ...(git.github && !onBase ? [{ label: openPr ? t.commitPushPr(openPr.number) : t.commitPush, onSelect: () => run.mutate([commitReq(), { action: "push" }]) }] : []),
        ]
      : [
          ...(canOpenPr ? [{ label: t.openPr, onSelect: () => setPrDialog(true) }] : []),
          ...(canPush ? [{ label: openPr ? t.pushPr(openPr.number) : t.push, onSelect: () => run.mutate([{ action: "push" }]) }] : []),
          ...(git.pushed && git.behind > 0 ? [{ label: t.pull, onSelect: () => run.mutate([{ action: "pull" }]) }] : []),
          ...(git.github && openPr && !canPush ? [{ label: t.merge, onSelect: () => void merge() }] : []),
        ];
  const [primary, ...more] = actions;

  const summary = [
    git.changes ? t.changes(git.changes) : null,
    git.ahead ? t.ahead(git.ahead, git.pushed) : null,
    git.behind ? t.behind(git.behind) : null,
  ].filter(Boolean);

  return (
    <Card size="sm" className="mb-2">
      <Collapsible open={open} onOpenChange={setOpen} className="contents">
        <CardHeader>
          <CardTitle className="min-w-0">
            <CollapsibleTrigger
              disabled={!files.length && !(owner && git.changes)}
              render={<Button variant="ghost" size="xs" className="-mx-2 max-w-full font-mono text-xs text-foreground" />}
            >
              {files.length > 0 && <ChevronRightIcon className={cn("text-muted-foreground transition-transform", open && "rotate-90")} />}
              <BranchIcon className="text-muted-foreground" />
              <span className="truncate">{git.branch ?? "?"}</span>
            </CollapsibleTrigger>
          </CardTitle>
          <CardDescription className="truncate text-xs">
            {summary.length ? summary.join(" · ") : t.clean}
            {(added > 0 || removed > 0) && (
              <span className="ml-2 font-mono tabular-nums">
                <span className="text-success">+{added}</span> <span className="text-destructive">−{removed}</span>
              </span>
            )}
          </CardDescription>
          {(pr || primary) && (
            <CardAction className="flex items-center gap-1.5">
              {pr && (
                <Badge variant="outline" render={<a href={pr.url} target="_blank" rel="noreferrer" title={pr.title} />}>
                  {t.pr(pr.number)} · {t.prState[pr.state]}
                  <ExternalLinkIcon />
                </Badge>
              )}
              {primary && (
                <Tooltip>
                  <TooltipTrigger render={<ButtonGroup />}>
                    <Button size="xs" disabled={busy} onClick={primary.onSelect}>
                      {run.isPending ? c.inProgress : primary.label}
                    </Button>
                    {more.length > 0 && (
                      <>
                        <ButtonGroupSeparator />
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button size="xs" aria-label={t.more} disabled={busy} />}>
                            <ChevronDownIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-52">
                            {more.map((a) => (
                              <DropdownMenuItem key={a.label} onClick={a.onSelect}>
                                {a.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </TooltipTrigger>
                  {working && <TooltipContent>{t.busy}</TooltipContent>}
                </Tooltip>
              )}
            </CardAction>
          )}
        </CardHeader>

        <CollapsibleContent render={<CardContent className="flex flex-col gap-3" />}>
          {files.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {files.map((f) => {
                const slash = f.path.lastIndexOf("/");
                return (
                  <li key={f.path} className="flex items-center gap-2 text-xs" title={f.path}>
                    <span className={cn("w-3 shrink-0 text-center font-mono font-medium", FILE_TONE[f.state])}>{FILE_STATE[f.state]}</span>
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {f.path.slice(slash + 1)}
                      {slash > 0 && <span className="ml-2 text-muted-foreground">{f.path.slice(0, slash)}</span>}
                    </span>
                    {f.added !== null && (
                      <span className="shrink-0 font-mono tabular-nums">
                        {f.added > 0 && <span className="text-success">+{f.added}</span>} {!!f.removed && <span className="text-destructive">−{f.removed}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
              {git.changes > files.length && <li className="text-xs text-muted-foreground">{t.moreFiles(git.changes - files.length)}</li>}
            </ul>
          )}
          {owner && git.changes > 0 && (
            <InputGroup className="items-end">
              <InputGroupTextarea
                rows={1}
                value={message}
                aria-label={t.message}
                placeholder={t.messagePlaceholder}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) {
                    e.preventDefault();
                    run.mutate([commitReq()]);
                  }
                }}
                className="max-h-32 min-h-0 font-mono text-xs leading-5 md:text-xs"
              />
              <InputGroupAddon align="inline-end">
                <Tooltip>
                  <TooltipTrigger render={<InputGroupButton size="icon-xs" aria-label={t.generate} disabled={busy} onClick={() => generate.mutate()} />}>
                    {generate.isPending ? <Spinner className="size-3.5" /> : <SparklesIcon />}
                  </TooltipTrigger>
                  <TooltipContent>{t.generate}</TooltipContent>
                </Tooltip>
              </InputGroupAddon>
            </InputGroup>
          )}
        </CollapsibleContent>
      </Collapsible>

      {owner && !git.github && <CardFooter className="text-xs text-muted-foreground">{t.noGithub}</CardFooter>}
      <PullRequestDialog
        open={prDialog}
        onClose={() => setPrDialog(false)}
        pending={run.isPending}
        branch={git.branch ?? ""}
        base={git.base ?? ""}
        defaultTitle={git.ahead === 1 && git.lastCommit ? git.lastCommit.subject : session.title}
        defaultBody={session.result ?? ""}
        onSubmit={(title, body) => run.mutate([{ action: "pr", title, body, draft: false }])}
      />
    </Card>
  );
}

function PullRequestDialog(props: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  branch: string;
  base: string;
  defaultTitle: string;
  defaultBody: string;
  onSubmit: (title: string, body: string) => void;
}) {
  const t = useT(messages).git;
  const c = useT(common);
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const title = String(form.get("title") ?? "").trim();
            if (title) props.onSubmit(title, String(form.get("body") ?? ""));
          }}
        >
          <DialogHeader>
            <DialogTitle className="pr-6">{t.prTitle}</DialogTitle>
            <DialogDescription>{t.prHelp(props.branch, props.base)}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5">
            <Field>
              <FormLabel htmlFor="git-pr-title" required>
                {t.title}
              </FormLabel>
              <Input id="git-pr-title" name="title" required autoFocus defaultValue={props.defaultTitle} />
            </Field>
            <Field>
              <FormLabel htmlFor="git-pr-body">{t.body}</FormLabel>
              <Textarea id="git-pr-body" name="body" rows={8} defaultValue={props.defaultBody} className="max-h-72" />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
            <Button type="submit" disabled={props.pending}>
              {props.pending ? c.inProgress : t.openPr}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- steps ---------- */

type ToolStepT = Extract<CodeStep, { kind: "tool" }>;
type Block = { kind: "step"; step: Exclude<CodeStep, ToolStepT> } | { kind: "tools"; steps: ToolStepT[] };

/** Consecutive tool calls read as one block; a subagent's steps go under its Task call. */
function blocks(steps: CodeStep[]): Block[] {
  const out: Block[] = [];
  for (const step of steps) {
    const last = out.at(-1);
    if (step.kind === "tool" && last?.kind === "tools") last.steps.push(step);
    else if (step.kind === "tool") out.push({ kind: "tools", steps: [step] });
    else out.push({ kind: "step", step });
  }
  return out;
}

const parentOf = (s: CodeStep) => ("parentId" in s ? s.parentId : undefined);

/** The steps of one level (the session's, or a subagent's), each Task call holding its own. */
function Timeline({ steps, running, parentId }: { steps: CodeStep[]; running: boolean; parentId?: string }) {
  const own = steps.filter((s) => parentOf(s) === parentId);
  const last = own.at(-1);
  return (
    <div className="flex flex-col gap-3">
      {blocks(own).map((b) =>
        b.kind === "tools" ? (
          <div key={b.steps[0]!.id} className="-mx-2 flex flex-col">
            {b.steps.map((s) => (
              <ToolRow key={s.id} step={s} all={steps} />
            ))}
          </div>
        ) : (
          <StepView key={b.step.id} step={b.step} streaming={running && b.step === last} />
        ),
      )}
    </div>
  );
}

function StepView({ step, streaming }: { step: Exclude<CodeStep, ToolStepT>; streaming: boolean }) {
  const t = useT(messages);
  switch (step.kind) {
    case "user":
      return (
        <div className="flex flex-col items-end gap-1">
          {step.by && <span className="px-1 text-xs text-muted-foreground">{step.by}</span>}
          {!!step.files?.length && <SentAttachments items={step.files} className="max-w-[88%]" />}
          {step.text && <UserBubble text={step.text} className="max-w-[88%] text-sm" />}
        </div>
      );
    case "text":
      return <MessageText text={step.text} streaming={streaming} className="text-sm" />;
    case "git":
      return (
        <div className={cn("flex items-start gap-2 text-[13px]", step.ok ? "text-muted-foreground" : "text-destructive")}>
          {step.ok ? <BranchIcon className="mt-0.5 size-3.5 shrink-0" /> : <CloseCircleIcon className="mt-0.5 size-3.5 shrink-0" />}
          <span className="min-w-0 break-words">
            {step.text}
            {step.by ? ` · ${step.by}` : ""}
          </span>
        </div>
      );
    case "notice":
      if (step.code === "error") {
        return (
          <Alert variant="destructive">
            <CloseCircleIcon />
            <AlertTitle>{t.notices.error}</AlertTitle>
            {step.text && (
              <AlertDescription>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{step.text}</pre>
              </AlertDescription>
            )}
          </Alert>
        );
      }
      return (
        <div className="text-center text-[13px] text-muted-foreground">
          {t.notices[step.code]}
          {step.text && <CodeBlock className="mt-1.5 text-left">{step.text}</CodeBlock>}
        </div>
      );
  }
}

/** A finished call shows nothing, as in an IDE: only work in progress and failures stand out. */
function ToolStatus({ status }: { status: ToolStepT["status"] }) {
  if (status === "running") return <Spinner className="size-3.5 shrink-0" />;
  if (status === "done") return null;
  return <CloseCircleIcon className="size-3.5 shrink-0 text-destructive" />;
}

/** One tool call; unfolds to its input and result, and to its subagent's steps for a Task call. */
function ToolRow({ step, all }: { step: ToolStepT; all: CodeStep[] }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const nested = all.some((s) => parentOf(s) === step.id);
  const expandable = !!(step.input || step.output || nested);
  const row = (
    <>
      <ToolIcon name={step.name} className="size-3.5" />
      <span className="shrink-0">{step.name}</span>
      <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground/80">{step.title !== step.name ? step.title : ""}</span>
      <ToolStatus status={step.status} />
    </>
  );
  if (!expandable) return <div className="flex h-7 items-center gap-2 px-2 text-[13px] text-muted-foreground">{row}</div>;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="ghost" size="xs" className="w-full justify-start gap-2" />}>
        {row}
        <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-3.5 flex flex-col gap-2 border-l py-1.5 pl-3 pr-2">
        {step.input && (step.name === "ExitPlanMode" ? <MessageText text={step.input} className="text-sm" /> : <Detail label={t.input} text={step.input} />)}
        {nested && <Timeline steps={all} running={false} parentId={step.id} />}
        {step.output && <Detail label={t.output} text={step.output} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A command, a tool's input or output, an error: monospaced, wrapped, scrolling past its height. */
function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <pre className={cn("overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs", className)}>{children}</pre>;
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <CodeBlock className="max-h-72 leading-relaxed">{text}</CodeBlock>
    </div>
  );
}

/* ---------- approval and writing ---------- */

function ApprovalBlock({ conversationId, session, approval, canAnswer }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const answer = useMutation({
    mutationFn: (choice: CodeApproval["choices"][number]) => answerCodeApproval(conversationId, session.id, approval.id, { choice }),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { error: false },
  });
  return (
    <Card size="sm" role="region" aria-label={t.asks}>
      <CardHeader>
        <CardTitle>
          {t.asks} <span className="font-mono">{approval.tool}</span>
        </CardTitle>
        <CardDescription className="truncate">{approval.title}</CardDescription>
      </CardHeader>
      {approval.detail && (
        <CardContent>
          <CodeBlock className="max-h-40">{approval.detail}</CodeBlock>
        </CardContent>
      )}
      <CardFooter className="flex-wrap gap-2">
        {canAnswer ? (
          approval.choices.map((choice, i) => (
            <Button
              key={choice}
              size="sm"
              variant={choice === "deny" ? "ghost" : i === 0 ? "default" : "outline"}
              disabled={answer.isPending}
              onClick={() => answer.mutate(choice)}
            >
              {answer.isPending && answer.variables === choice ? c.inProgress : t.choices[choice]}
            </Button>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t.waitingOwner}</p>
        )}
        {answer.error && <p className="w-full text-sm text-destructive">{answer.error.message}</p>}
      </CardFooter>
    </Card>
  );
}

/**
 * Its question to the bot that started it (ask_bot): the bot answers it, or its owner, with one of
 * its options or the next message of the field below, which goes to it as the answer.
 */
function BotQuestionBlock({ conversationId, session, question, canAnswer }: { conversationId: string; session: CodeSession; question: CodeBotQuestion; canAnswer: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [choice, setChoice] = useState<Choice>({ picked: [], other: "" });
  const answer = useMutation({
    mutationFn: (text: string) => sendToCodeSession(conversationId, session.id, text),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: t.question.answered },
  });
  const options = question.options?.length
    ? [...question.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }]
    : [];
  const value = answerOf(choice);
  const help = !canAnswer ? t.botQuestion.waiting(question.bot) : options.length ? t.botQuestion.pick(question.bot, options[0]!.label) : t.botQuestion.help(question.bot);
  const id = (i: number) => `bot-q-${i}`;
  return (
    <Card size="sm" role="region" aria-label={t.botQuestion.title(question.bot)}>
      <CardHeader>
        <CardTitle>{t.botQuestion.title(question.bot)}</CardTitle>
        <CardDescription>{help}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value && !answer.isPending) answer.mutate(value);
        }}
      >
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <MessageText text={question.text} className="text-sm font-medium" />
            {question.context && (
              <div className="max-h-[30vh] overflow-y-auto text-muted-foreground">
                <MessageText text={question.context} className="text-[13px]" />
              </div>
            )}
          </div>
          {options.length > 0 && (
            <FieldSet disabled={!canAnswer || answer.isPending} aria-label={question.text} className="gap-3">
              <RadioGroup value={choice.picked[0] ?? ""} onValueChange={(v) => setChoice((all) => ({ ...all, picked: [String(v)] }))} className="gap-2.5">
                {options.map((o, i) => (
                  <Field key={o.value} orientation="horizontal">
                    <RadioGroupItem value={o.value} id={id(i)} />
                    <FieldContent>
                      <FieldLabel htmlFor={id(i)} className="font-normal">
                        {o.label}
                      </FieldLabel>
                      {o.description && <FieldDescription className="text-[13px]">{o.description}</FieldDescription>}
                    </FieldContent>
                  </Field>
                ))}
              </RadioGroup>
              {choice.picked.includes(OTHER_ANSWER) && (
                <Input
                  autoFocus
                  aria-label={t.question.other}
                  placeholder={t.question.otherPlaceholder}
                  value={choice.other}
                  onChange={(e) => setChoice((all) => ({ ...all, other: e.target.value }))}
                />
              )}
            </FieldSet>
          )}
          {canAnswer && options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!value || answer.isPending}>
                {answer.isPending ? c.inProgress : t.question.answer}
              </Button>
            </div>
          )}
        </CardContent>
      </form>
    </Card>
  );
}

type Choice = { picked: string[]; other: string };

const answerOf = (c: Choice | undefined) => (c ? questionAnswer(c.picked, c.other) : "");

/**
 * Claude Code's questions (AskUserQuestion), as in its terminal: each with its options, one or
 * several to pick, and "Other" for an answer of one's own. The run waits for the answers.
 */
function QuestionBlock({
  conversationId,
  session,
  approval,
  questions,
  canAnswer,
}: {
  conversationId: string;
  session: CodeSession;
  approval: CodeApproval;
  questions: CodeQuestion[];
  canAnswer: boolean;
}) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const answer = useMutation({
    mutationFn: (skip: boolean) =>
      answerCodeApproval(
        conversationId,
        session.id,
        approval.id,
        skip ? { choice: "deny" } : { choice: "once", answers: Object.fromEntries(questions.map((q) => [q.question, answerOf(choices[q.question])])) },
      ),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: (_: CodeSession, skip: boolean) => (skip ? undefined : t.question.answered) },
  });
  const set = (question: string, change: Partial<Choice>) =>
    setChoices((all) => ({ ...all, [question]: { ...(all[question] ?? { picked: [], other: "" }), ...change } }));
  const complete = questions.every((q) => answerOf(choices[q.question]));
  return (
    <Card size="sm" role="region" aria-label={questions.length > 1 ? t.question.titleMany(questions.length) : t.question.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete && !answer.isPending) answer.mutate(false);
        }}
      >
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="gap-5">
            {questions.map((q, qi) => {
              const choice = choices[q.question];
              const picked = choice?.picked ?? [];
              const options = [...q.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }];
              const id = (i: number) => `code-q${qi}-${i}`;
              const row = (o: (typeof options)[number], i: number, control: ReactNode) => (
                <Field key={o.value} orientation="horizontal">
                  {control}
                  <FieldContent>
                    <FieldLabel htmlFor={id(i)} className="font-normal">
                      {o.label}
                    </FieldLabel>
                    {o.description && <FieldDescription className="text-[13px]">{o.description}</FieldDescription>}
                  </FieldContent>
                </Field>
              );
              return (
                <FieldSet key={q.question} disabled={!canAnswer} className="gap-3">
                  <FieldLegend variant="label" className="mb-0 leading-snug">
                    {q.header && <span className="text-muted-foreground">{q.header} · </span>}
                    {q.question}
                  </FieldLegend>
                  {q.multiSelect ? (
                    <div data-slot="checkbox-group" className="flex flex-col gap-2.5">
                      {options.map((o, i) =>
                        row(
                          o,
                          i,
                          <Checkbox
                            id={id(i)}
                            checked={picked.includes(o.value)}
                            onCheckedChange={(on) => set(q.question, { picked: on ? [...picked, o.value] : picked.filter((p) => p !== o.value) })}
                          />,
                        ),
                      )}
                    </div>
                  ) : (
                    <RadioGroup value={picked[0] ?? ""} onValueChange={(v) => set(q.question, { picked: [String(v)] })} className="gap-2.5">
                      {options.map((o, i) => row(o, i, <RadioGroupItem value={o.value} id={id(i)} />))}
                    </RadioGroup>
                  )}
                  {picked.includes(OTHER_ANSWER) && (
                    <Input
                      autoFocus
                      aria-label={t.question.other}
                      placeholder={t.question.otherPlaceholder}
                      value={choice?.other ?? ""}
                      onChange={(e) => set(q.question, { other: e.target.value })}
                    />
                  )}
                </FieldSet>
              );
            })}
          </FieldGroup>
          {canAnswer ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!complete || answer.isPending}>
                {answer.isPending && !answer.variables ? c.inProgress : t.question.answer}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate(true)}>
                {answer.isPending && answer.variables ? c.inProgress : t.question.skip}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.waitingOwner}</p>
          )}
        </CardContent>
      </form>
    </Card>
  );
}

/**
 * The plan Claude Code wrote in plan mode (ExitPlanMode): read whole, then approved (it starts, in
 * the mode it had before planning) or sent back with what to change (it keeps planning).
 */
function PlanBlock({ conversationId, session, approval, canAnswer }: { conversationId: string; session: CodeSession; approval: CodeApproval; canAnswer: boolean }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const answer = useMutation({
    mutationFn: (approve: boolean) =>
      answerCodeApproval(conversationId, session.id, approval.id, approve ? { choice: "once" } : { choice: "deny", feedback: feedback.trim() }),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      setFeedback("");
    },
    meta: { success: (_: CodeSession, approve: boolean) => (approve ? t.plan.approved : t.plan.sentBack) },
  });
  return (
    <Card size="sm" role="region" aria-label={t.plan.title}>
      <CardHeader>
        <CardTitle>{t.plan.title}</CardTitle>
        <CardDescription>{t.plan.help}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {approval.plan && (
          <div className="max-h-[40vh] overflow-y-auto">
            <MessageText text={approval.plan} className="text-sm" />
          </div>
        )}
        {canAnswer && (
          <Textarea
            rows={2}
            value={feedback}
            aria-label={t.plan.feedback}
            placeholder={t.plan.feedbackPlaceholder}
            onChange={(e) => setFeedback(e.target.value)}
            className="max-h-32"
          />
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {canAnswer ? (
          <>
            <Button size="sm" disabled={answer.isPending || !!feedback.trim()} onClick={() => answer.mutate(true)}>
              {answer.isPending && answer.variables ? c.inProgress : t.plan.approve}
            </Button>
            <Button size="sm" variant="outline" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
              {answer.isPending && !answer.variables ? c.inProgress : t.plan.revise}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.waitingOwner}</p>
        )}
      </CardFooter>
    </Card>
  );
}

/** "/name" typed at the start of the field, up to the caret: a slash command or a skill being picked. */
function slashQuery(text: string, caret: number) {
  return /^\/([\w:.-]*)$/.exec(text.slice(0, caret))?.[1] ?? null;
}

/**
 * Same field as the conversation's: the instruction, the session's mode and model, send. "/" at its
 * start lists Claude Code's skills and slash commands, as in its terminal; Shift+Tab switches the mode.
 */
function SessionComposer({ conversationId, session, ref }: { conversationId: string; session: CodeSession; ref?: Ref<{ addFiles: (files: FileList) => void }> }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const area = useRef<HTMLTextAreaElement>(null);
  const { user } = useRouteContext({ from: "/app" });
  const [text, setText] = useDraft(`${user.id}:code:${conversationId}:${session.id}`);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const files = useInstructionFiles(conversationId);
  useImperativeHandle(ref, () => ({ addFiles: files.add }));
  const send = useMutation({
    mutationFn: ({ value, attachmentIds }: { value: string; attachmentIds: string[] }) => sendToCodeSession(conversationId, session.id, value, attachmentIds),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      setText("");
      files.clear();
      void playSound("sent");
    },
  });
  const stop = useMutation({
    mutationFn: () => stopCodeSession(conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
  });
  const mode = useMutation({
    mutationFn: (value: CodePermissionMode) => setCodeSessionMode(conversationId, session.id, value),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: (s: CodeSession) => t.modeChanged(t.modes[s.mode]) },
  });
  const query = dismissed ? null : slashQuery(text, caret);
  const items = query === null ? [] : commandItems(session, query);
  // While Claude Code works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = active(session.status) && !text.trim() && !files.files.length;
  const canSend = !files.uploading && !send.isPending && (!!text.trim() || files.ids.length > 0);
  const submit = () => {
    if (canSend) send.mutate({ value: text.trim(), attachmentIds: files.ids });
  };
  const pick = (item: SlashItem) => {
    const next = `/${item.name} ${text.slice(caret).trimStart()}`;
    const at = item.name.length + 2;
    setText(next);
    setCaret(at);
    setDismissed(true);
    requestAnimationFrame(() => area.current?.setSelectionRange(at, at));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative rounded-[22px] bg-secondary p-1.5"
    >
      {query !== null && items.length > 0 && <SlashMenu items={items} active={Math.min(highlight, items.length - 1)} onHover={setHighlight} onPick={pick} />}
      <PendingFiles items={files.files} onRemove={files.remove} />
      <InputGroup className="h-auto flex-col items-stretch border-0 bg-transparent">
        <InputGroupTextarea
          ref={area}
          rows={1}
          value={text}
          autoFocus
          aria-expanded={query !== null && items.length > 0}
          aria-autocomplete="list"
          placeholder={
            session.question
              ? t.placeholderAnswer
              : active(session.status)
                ? t.placeholderRunning
                : session.commands.length
                  ? `${t.placeholderIdle} · ${t.commands.hint}`
                  : t.placeholderIdle
          }
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setHighlight(0);
            setDismissed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={files.onPaste}
          onKeyDown={(e) => {
            if (query !== null && items.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = items.length;
                setHighlight((a) => (Math.min(a, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
                return;
              }
              if ((e.key === "Enter" && !e.shiftKey) || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                pick(items[Math.min(highlight, items.length - 1)]!);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (e.key === "Tab" && e.shiftKey) {
              e.preventDefault();
              if (!mode.isPending) mode.mutate(nextCodeMode(session.mode, session.engine));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-0 min-w-0 px-2 py-1 text-[15px] leading-6 md:text-[15px]"
        />
        <InputGroupAddon align="block-end" className="cursor-default gap-1 px-0 pb-0">
          <AttachButton onFiles={files.add} />
          <ModePicker engine={session.engine} value={session.mode} disabled={mode.isPending} onSelect={(value) => value !== session.mode && mode.mutate(value)} />
          <span className="flex-1" />
          <SessionModelPicker conversationId={conversationId} session={session} />
          {stoppable ? (
            <Button type="button" size="icon" aria-label={stop.isPending ? t.stopping : t.stop} disabled={stop.isPending} onClick={() => stop.mutate()} className="rounded-full disabled:opacity-40">
              {stop.isPending ? <Spinner /> : <StopIcon className="size-5" />}
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label={t.send} disabled={!canSend} className="rounded-full disabled:opacity-40">
              <ArrowUpIcon strokeWidth={2.25} />
            </Button>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

/** Its skills first, then its commands, best matches of the query first. */
function commandItems(session: CodeSession, query: string): SlashItem[] {
  const all = [...session.commands].sort((a, b) => Number(b.skill) - Number(a.skill));
  return rankByQuery(
    all.map((c) => ({
      key: `${c.skill ? "skill" : "command"}:${c.name}`,
      kind: c.skill ? "skill" : "command",
      name: c.name,
      description: c.argumentHint ? `${c.argumentHint} · ${c.description}` : c.description,
    })),
    query.toLowerCase(),
  );
}

/** The agent CLI a new session runs on, among the ones installed on the server that are the person's. */
function EnginePicker({ engines, value, onSelect }: { engines: { id: CodeEngine; name: string }[]; value: CodeEngine; onSelect: (engine: CodeEngine) => void }) {
  const t = useT(messages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<InputGroupButton size="sm" aria-label={t.engine} className="min-w-0 shrink gap-1.5" />}>
        <ModelLogo provider={value} className="size-3.5" />
        <span className="truncate">{CODE_ENGINE_NAMES[value]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onSelect(v as CodeEngine)}>
          {engines.map((e) => (
            <DropdownMenuRadioItem key={e.id} value={e.id} className="gap-2">
              <ModelLogo provider={e.id} />
              {e.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Claude Code's permission mode, each with what it lets it do. */
function ModePicker({ engine, value, onSelect, disabled }: { engine: CodeEngine; value: CodePermissionMode; onSelect: (mode: CodePermissionMode) => void; disabled?: boolean }) {
  const t = useT(messages);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<InputGroupButton size="sm" aria-label={t.mode} disabled={disabled} />} />}>{t.modes[value]}</TooltipTrigger>
        <TooltipContent>{t.modeShortcut}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onSelect(v as CodePermissionMode)}>
          {codeEngineModes(engine).map((m) => (
            <DropdownMenuRadioItem key={m} value={m} className="h-auto items-start py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{t.modes[m]}</span>
                <span className="text-xs text-muted-foreground">{t.modeHelp[m]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- task list ---------- */

/**
 * Claude Code's task list, docked above the field as in its terminal: where it stands in one line,
 * each task on unfolding. Hidden once every task is done and the session rests.
 */
function TodoBar({ todos, running }: { todos: CodeTodo[]; running: boolean }) {
  const t = useT(messages).todos;
  const [open, setOpen] = useState(true);
  const done = todos.filter((x) => x.status === "completed").length;
  const current = todos.find((x) => x.status === "in_progress");
  if (done === todos.length && !running) return null;
  return (
    <Card size="sm" className="mb-2">
      <Collapsible open={open} onOpenChange={setOpen} className="contents">
        <CardHeader>
          <CardTitle>
            <CollapsibleTrigger aria-label={t.label(done, todos.length)} render={<Button variant="ghost" size="xs" className="-mx-2 text-foreground" />}>
              <ChevronRightIcon className={cn("text-muted-foreground transition-transform", open && "rotate-90")} />
              {t.title}
              <span className="tabular-nums text-muted-foreground">{t.progress(done, todos.length)}</span>
            </CollapsibleTrigger>
          </CardTitle>
          {current && !open && <CardDescription className="truncate text-xs">{current.activeForm ?? current.content}</CardDescription>}
        </CardHeader>
        <CollapsibleContent render={<CardContent />}>
          <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-start gap-2 text-[13px]">
                <TodoMark status={todo.status} running={running} />
                <span className={cn("min-w-0 break-words", todo.status === "completed" && "text-muted-foreground line-through", todo.status === "in_progress" && "font-medium")}>
                  {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function TodoMark({ status, running }: { status: CodeTodo["status"]; running: boolean }) {
  if (status === "completed") return <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-success" />;
  if (status === "in_progress" && running) return <Spinner className="mt-0.5 size-3.5 shrink-0" />;
  return <CircleIcon className={cn("mt-0.5 size-3.5 shrink-0", status === "in_progress" ? "text-foreground" : "text-muted-foreground")} />;
}

/** The session's model, among the ones its owner may use. */
function SessionModelPicker({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (model: string) => setCodeSessionModel(conversationId, session.id, model),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: t.modelChanged },
  });
  return <CodeModelPicker conversationId={conversationId} engine={session.engine} value={session.model} onSelect={(model) => change.mutate(model)} />;
}

/**
 * A Claude Code model among the ones the owner may use: searchable, each with its vendor's logo, as
 * in the conversation's picker. Null: Claude Code's default.
 */
function CodeModelPicker({ conversationId, engine, value, onSelect }: { conversationId: string; engine: CodeEngine; value: string | null; onSelect: (model: string) => void }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId, engine));
  // Claude's models are Anthropic's; Codex's OpenAI's; Cursor's come from every vendor.
  const vendor = engine === "claude" ? "anthropic" : engine === "codex" ? "openai" : "cursor";
  if (!models.length && !value) return null;
  const current = models.find((m) => m.id === value);
  // Claude Code's default, as it resolved it: listed even when it is not among the models offered.
  const list = value && !current ? [{ id: value }, ...models] : models;
  const key = (m: { id: string; label?: string }) => `${m.id} ${m.label ?? ""}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<InputGroupButton size="sm" />} className="min-w-0 shrink gap-1.5">
        <ModelLogo provider={vendor} model={value ?? undefined} className="size-3.5" />
        <span className="truncate">{current?.label ?? value ?? t.model}</span>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-72 p-0">
        <Command defaultValue={key(current ?? list[0] ?? { id: "" })}>
          <CommandInput placeholder={t.searchModel} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.noModel}</CommandEmpty>
            <CommandGroup heading={<GroupHeading provider={engine} label={CODE_ENGINE_NAMES[engine]} />}>
              {list.map((m) => (
                <ModelOption
                  key={m.id}
                  value={key(m)}
                  label={"label" in m && m.label ? m.label : m.id}
                  description={"description" in m ? m.description : undefined}
                  reasoning={"reasoning" in m ? m.reasoning : undefined}
                  logo={<ModelLogo model={m.id} provider={vendor} />}
                  active={m.id === value}
                  onSelect={() => {
                    setOpen(false);
                    if (m.id !== value) onSelect(m.id);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
