import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  CODE_PERMISSION_MODES,
  codeApprovalLine,
  codeStatusText,
  nextCodeMode,
  OTHER_ANSWER,
  placeCodeSessions,
  questionAnswer,
  rankByQuery,
  type CodeApproval,
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
  CheckCircleIcon,
  CircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsRightIcon,
  CloseCircleIcon,
  CodeIcon,
  ExternalLinkIcon,
  FolderIcon,
  ShieldAlertIcon,
  SparklesIcon,
  StopIcon,
  TaskListIcon,
  ToolIcon,
  UserIcon,
  WarningIcon,
} from "@/components/icons";
import { MessageText } from "@/components/MessageText";
import { GroupHeading, ModelOption } from "@/components/ModelPicker";
import { ModelLogo } from "@/components/ProviderLogo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/FormLabel";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  codeModelsQuery,
  codeReposQuery,
  runCodeGit,
  switchCodeSessionAccount,
  type CodeGitRequest,
  codeSessionQuery,
  codeSessionsQuery,
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
import { dividerLabel } from "@/lib/dates";
import { useFormat } from "@/lib/usage-format";
import { cn } from "@/lib/utils";

const messages = codeSessions;

const active = (s: CodeSessionStatus) => s === "running" || s === "waiting";

function StatusIcon({ status, className }: { status: CodeSessionStatus; className?: string }) {
  if (status === "running") return <Spinner className={cn("size-4", className)} />;
  if (status === "waiting") return <ShieldAlertIcon className={cn("size-4 text-warning", className)} />;
  if (status === "idle") return <CheckCircleIcon className={cn("size-4 text-success", className)} />;
  return <CloseCircleIcon className={cn("size-4", status === "failed" ? "text-destructive" : "text-muted-foreground", className)} />;
}

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
  const status = session?.status ?? "running";
  const detail = session?.approval ? codeApprovalLine(session.approval) : active(status) ? session?.activity : null;
  return (
    <Item variant="outline" className={cn("my-1 w-full max-w-[min(680px,88%)]", className)}>
      <ItemMedia variant="icon">{session ? <StatusIcon status={status} /> : <CodeIcon />}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{session?.title ?? title}</ItemTitle>
        <ItemDescription className="truncate">
          {t.claudeCode} · {session ? codeStatusText(t, session) : t.status[status]}
          {detail ? ` · ${detail}` : ""}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {active(status) ? t.follow : t.open}
        </Button>
      </ItemActions>
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
export function CodeSessionsButton({ conversationId, current, onOpen }: { conversationId: string; current: string | null; onOpen: (sessionId: string) => void }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  // Its models answer only the owner (403 otherwise): the sign they may start a session.
  const { isSuccess: canStart } = useQuery({ ...codeModelsQuery(conversationId), retry: false });
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
              render={<Button variant="ghost" size="icon" aria-label={working ? t.sessionsWorking : t.sessions} aria-pressed={!!current} className="relative hidden rounded-lg aria-pressed:bg-muted lg:inline-flex" />}
            />
          }
        >
          {/* It hops while a session works: that is the sign, no badge. */}
          <ModelLogo provider="claude-code" className={cn("size-[18px]", working && "code-working")} />
        </TooltipTrigger>
        <TooltipContent>{working ? t.sessionsWorking : t.sessions}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={6} className="w-80 gap-0 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-[12px] font-medium text-muted-foreground">{t.sessions}</p>
        {!sorted.length && <p className="px-2 pb-2 text-sm text-muted-foreground">{t.none}</p>}
        <div className="flex max-h-96 flex-col overflow-y-auto">
          {sorted.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={s.id === current || undefined}
              onClick={() => {
                setOpen(false);
                onOpen(s.id);
              }}
              className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted aria-[current]:bg-muted"
            >
              <StatusIcon status={s.status} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{s.title}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {codeStatusText(t, s)}
                  {s.git?.pr ? ` · PR #${s.git.pr.number}` : s.git?.branch ? ` · ${s.git.branch}` : ""}
                  {s.worktree?.removedAt ? ` · ${t.worktree.listGone}` : ""} · {dividerLabel(new Date(s.updatedAt))}
                </span>
                {s.instruction && (
                  <span className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                    {s.instruction.by ? t.instructedBy(s.instruction.by, s.instruction.text) : s.instruction.text}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        {canStart && (
          <div className="mt-1 border-t border-border/60 pt-1">
            <Button
              variant="ghost"
              className="w-full justify-start rounded-lg px-2"
              onClick={() => {
                setOpen(false);
                onOpen(NEW_CODE_SESSION);
              }}
            >
              {t.newSession}
            </Button>
          </div>
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
/** Large screens show the session beside the thread; smaller ones in a sheet over it. */
export const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);

/** The panel's id for a session not started yet: the owner's first instruction starts it. */
export const NEW_CODE_SESSION = "new";

export function CodeSessionPanel({
  conversationId,
  sessionId,
  onOpen,
  onClose,
}: {
  conversationId: string;
  sessionId: string;
  /** The session the first instruction of a new one started. */
  onOpen: (sessionId: string) => void;
  onClose: () => void;
}) {
  const t = useT(messages);
  const wide = useWide();
  const view =
    sessionId === NEW_CODE_SESSION ? (
      <NewSessionView conversationId={conversationId} onStarted={onOpen} onClose={onClose} />
    ) : (
      <CodeSessionView conversationId={conversationId} sessionId={sessionId} onClose={onClose} />
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
  return <aside className="flex h-full w-[520px] shrink-0 flex-col bg-sidebar">{view}</aside>;
}

/**
 * A session not started yet: the same panel, empty, with the field. Its first instruction starts it,
 * in the repository and with the model chosen beside the field, and Claude Code names it from there.
 */
function NewSessionView({ conversationId, onStarted, onClose }: { conversationId: string; onStarted: (sessionId: string) => void; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
  // The conversation's repositories, the latest session's first: usually the one to work on again.
  const recent = [...new Set([...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).flatMap((s) => (s.git?.repo ? [s.git.repo] : [])))];
  const [repo, setRepo] = useState<string | null>(recent[0] ?? null);
  const [model, setModel] = useState<string | null>(null);
  const [mode, setMode] = useState<CodePermissionMode>("bypassPermissions");
  const [text, setText] = useState("");
  const start = useMutation({
    mutationFn: (task: string) => startCodeSession(conversationId, { task, mode, ...(repo && { repo }), ...(model && { model }) }),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      onStarted(s.id);
    },
  });
  const submit = () => {
    const value = text.trim();
    if (value && !start.isPending) start.mutate(value);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-2.5 px-4 pb-2 pt-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-snug">{t.newSession}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{start.isPending ? t.empty : t.newHint}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose} className="-mr-1.5 -mt-1 rounded-lg">
          <ChevronsRightIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 border-t border-border/60" />
      <div className="shrink-0 px-3 pb-3 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-[22px] bg-secondary p-1.5"
        >
          <InputGroup className="h-auto flex-col items-stretch border-0 bg-transparent">
            <InputGroupTextarea
              rows={2}
              value={text}
              autoFocus
              readOnly={start.isPending}
              placeholder={t.placeholderNew}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab" && e.shiftKey) {
                  e.preventDefault();
                  setMode(nextCodeMode(mode));
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
              <RepoPicker conversationId={conversationId} recent={recent} value={repo} onSelect={setRepo} />
              <ModePicker value={mode} onSelect={setMode} />
              <span className="flex-1" />
              <CodeModelPicker conversationId={conversationId} value={model} onSelect={setModel} />
              <Button type="submit" size="icon" aria-label={t.send} disabled={!text.trim() || start.isPending} className="disabled:opacity-40">
                {start.isPending ? <Spinner /> : <ArrowUpIcon strokeWidth={2.25} />}
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
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
      <PopoverTrigger render={<InputGroupButton size="sm" aria-label={t.repo} />} className="min-w-0 max-w-[60%] gap-1.5">
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
                <CommandItem value={custom} onSelect={() => choose(custom)} className="h-9 px-2.5 text-sm">
                  {t.useRepo(custom)}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem value={t.noRepo} data-checked={!value} onSelect={() => choose(null)} className="h-9 px-2.5 text-sm">
                {t.noRepo}
              </CommandItem>
            </CommandGroup>
            {recent.length > 0 && (
              <CommandGroup heading={t.recentRepos}>
                {recent.map((r) => (
                  <CommandItem key={r} value={r} data-checked={r === value} onSelect={() => choose(r)} className="h-9 px-2.5 text-sm">
                    <span className="truncate">{r}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading="GitHub">
                {others.map((r) => (
                  <CommandItem key={r.repo} value={r.repo} data-checked={r.repo === value} onSelect={() => choose(r.repo)} className="h-9 px-2.5 text-sm">
                    <span className="truncate">{r.repo}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {value && (
            <div className="border-t border-border/60 p-1">
              <Button
                variant="ghost"
                className="w-full justify-start rounded-md px-2.5 font-normal"
                onClick={() => {
                  setOpen(false);
                  setCredentials(true);
                }}
              >
                {t.credentials.open}
              </Button>
            </div>
          )}
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
                  className="max-h-96 font-mono text-[12px] leading-5 md:text-[12px]"
                />
              )}
            </Field>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
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
function CodeSessionView({ conversationId, sessionId, onClose }: { conversationId: string; sessionId: string; onClose: () => void }) {
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
  useGitRefresh(conversationId, sessionId, !!session?.git && !session.worktree?.removedAt);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-2.5 px-4 pb-2 pt-3.5">
        {session && <StatusIcon status={session.status} className="mt-1 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-snug">{session?.title ?? t.claudeCode}</p>
          {session && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {codeStatusText(t, session)}
              {session.mode !== "bypassPermissions" ? ` · ${t.modes[session.mode]}` : ""}
              {session.activity && active(session.status) ? ` · ${session.activity}` : ""}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label={c.close} onClick={onClose} className="-mr-1.5 -mt-1 rounded-lg">
          <ChevronsRightIcon />
        </Button>
      </header>

      {!session ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : (
        <>
          <Meta conversationId={conversationId} session={session} showModel={!owner} owner={owner} />
          {session.limit && <LimitAlert conversationId={conversationId} session={session} limit={session.limit} owner={owner} />}

          <div className="relative min-h-0 flex-1 border-t border-border/60">
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
              {session.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.empty}</p>
              ) : (
                <Timeline steps={session.steps} running={session.status === "running"} />
              )}
            </div>
            {!atBottom && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
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
            {session.approval?.kind === "question" && session.approval.questions ? (
              <QuestionBlock conversationId={conversationId} session={session} approval={session.approval} questions={session.approval.questions} canAnswer={owner} />
            ) : session.approval?.kind === "plan" ? (
              <PlanBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />
            ) : (
              session.approval && <ApprovalBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />
            )}
            {owner && session.worktree && <WorktreeBanner conversationId={conversationId} session={session} worktree={session.worktree} />}
            {session.git && <ChangesBar conversationId={conversationId} session={session} git={session.git} owner={owner && !session.worktree?.removedAt} />}
            {owner ? (
              <SessionComposer conversationId={conversationId} session={session} />
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

/**
 * Directory and what the session consumed, on one line; the detail on hover. The model too, for
 * those who cannot change it; for its owner, the account and the repository's credentials.
 */
function Meta({ conversationId, session, showModel, owner }: { conversationId: string; session: CodeSession; showModel: boolean; owner: boolean }) {
  const t = useT(messages);
  const f = useFormat();
  const [credentials, setCredentials] = useState(false);
  const showAccount = owner;
  const u = session.usage;
  const folder = session.cwd.split("/").filter(Boolean).at(-1) ?? session.cwd;
  const minutes = u ? u.durationMs / 60_000 : 0;
  const time = !u ? "" : minutes < 1 ? `${Math.max(1, Math.round(u.durationMs / 1000))} s` : `${Math.round(minutes)} min`;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 pl-10.5 text-[12px] text-muted-foreground">
      {showModel && session.model && (
        <span className="inline-flex items-center gap-1">
          <ModelLogo provider="anthropic" model={session.model} className="size-3.5" />
          {session.model}
        </span>
      )}
      {showAccount && session.account && (
        <Tooltip>
          <TooltipTrigger render={<span />} className="inline-flex min-w-0 cursor-default items-center gap-1">
            <UserIcon className="size-3.5 shrink-0" />
            <span className="truncate">{session.account.email ?? t.serverAccount}</span>
          </TooltipTrigger>
          <TooltipContent>
            {t.account}
            {session.account.plan ? ` · ${session.account.plan}` : ""}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" aria-label={t.copyPath} onClick={() => copyText(session.cwd)} />}
          className="inline-flex min-w-0 items-center gap-1 rounded-sm font-mono outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">{folder}</span>
        </TooltipTrigger>
        <TooltipContent className="font-mono">{session.cwd}</TooltipContent>
      </Tooltip>
      {u && (
        <Tooltip>
          <TooltipTrigger render={<span />} className="cursor-default tabular-nums">
            {t.tokens(f.compact(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens))} · {f.cost(u.costUsd)} · {t.runs(u.runs)} · {time}
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            <p>{t.usageDetail(f.compact(u.inputTokens), f.compact(u.outputTokens), f.compact(u.cacheReadTokens + u.cacheWriteTokens), u.turns)}</p>
            <p className="mt-1 opacity-80">{t.costNote}</p>
          </TooltipContent>
        </Tooltip>
      )}
      {owner && session.repo && (
        <>
          <button
            type="button"
            onClick={() => setCredentials(true)}
            className="rounded-sm underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {t.credentials.open}
          </button>
          <RepoCredentialsDialog conversationId={conversationId} repo={session.repo} open={credentials} onClose={() => setCredentials(false)} />
        </>
      )}
    </div>
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
  if (active(session.status)) return null;
  if (worktree.removedAt) return <p className="mb-2 px-1 text-[13px] text-muted-foreground">{t.gone(worktree.branch)}</p>;
  const confirm = async () => {
    const branch = session.git?.branch ?? worktree.branch;
    if (await confirmAction({ title: t.confirmTitle(session.title), description: t.confirmHelp(branch, session.git?.changes ?? 0), action: t.remove })) remove.mutate();
  };
  return (
    <Alert className="mb-2 rounded-2xl px-3.5 py-3">
      <AlertDescription>
        <p>{t.done}</p>
        <div className="mt-2">
          <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => void confirm()}>
            {remove.isPending ? t.removing : t.remove}
          </Button>
        </div>
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
  const { data: accounts = [] } = useQuery({ ...codeAccountsQuery(conversationId), enabled: owner && rejected });
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
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2 overflow-hidden rounded-2xl border border-border/70 bg-background/60">
      <div className="flex h-10 items-center gap-2 pl-1.5 pr-1.5">
        <CollapsibleTrigger
          disabled={!files.length && !(owner && git.changes)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-[13px] outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:hover:bg-transparent"
        >
          {files.length > 0 && <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />}
          <BranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-mono text-[12px]">{git.branch ?? "?"}</span>
          <span className="shrink-0 truncate text-muted-foreground">{summary.length ? summary.join(" · ") : t.clean}</span>
          {(added > 0 || removed > 0) && (
            <span className="shrink-0 font-mono text-[12px] tabular-nums">
              <span className="text-success">+{added}</span> <span className="text-destructive">−{removed}</span>
            </span>
          )}
        </CollapsibleTrigger>
        {pr && (
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            title={pr.title}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className={cn("size-1.5 rounded-full", pr.state === "open" ? "bg-success" : pr.state === "merged" ? "bg-violet-500" : "bg-muted-foreground")} />
            {t.pr(pr.number)} · {t.prState[pr.state]}
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
        {primary && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
              <Button size="xs" disabled={busy} onClick={primary.onSelect} className={cn("px-3", more.length > 0 && "rounded-r-none pr-2.5")}>
                {run.isPending ? c.inProgress : primary.label}
              </Button>
              {more.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="xs" aria-label={t.more} disabled={busy} className="rounded-l-none border-l border-primary-foreground/15 px-1.5" />}>
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
              )}
            </TooltipTrigger>
            {working && <TooltipContent>{t.busy}</TooltipContent>}
          </Tooltip>
        )}
      </div>

      <CollapsibleContent className="border-t border-border/60">
        {files.length > 0 && (
          <ul className="max-h-48 overflow-y-auto py-1">
            {files.map((f) => {
              const slash = f.path.lastIndexOf("/");
              return (
                <li key={f.path} className="flex items-center gap-2 px-3 py-1 text-[12px]" title={f.path}>
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
            {git.changes > files.length && <li className="px-3 py-1 text-[12px] text-muted-foreground">{t.moreFiles(git.changes - files.length)}</li>}
          </ul>
        )}
        {owner && git.changes > 0 && (
          <div className="border-t border-border/60 p-1.5">
            <InputGroup className="h-auto items-end rounded-xl border-0 bg-secondary">
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
                className="max-h-32 min-h-0 px-2.5 py-1.5 font-mono text-[12px] leading-5 md:text-[12px]"
              />
              <InputGroupAddon align="inline-end" className="py-1 pr-1">
                <Tooltip>
                  <TooltipTrigger render={<InputGroupButton size="icon-xs" aria-label={t.generate} disabled={busy} onClick={() => generate.mutate()} />}>
                    {generate.isPending ? <Spinner className="size-3.5" /> : <SparklesIcon />}
                  </TooltipTrigger>
                  <TooltipContent>{t.generate}</TooltipContent>
                </Tooltip>
              </InputGroupAddon>
            </InputGroup>
          </div>
        )}
      </CollapsibleContent>

      {owner && !git.github && <p className="border-t border-border/60 px-3 py-2 text-[12px] text-muted-foreground">{t.noGithub}</p>}
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
    </Collapsible>
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
          {step.by && <span className="px-1 text-[12px] text-muted-foreground">{step.by}</span>}
          <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl bg-secondary px-3.5 py-2 text-sm">{step.text}</p>
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
      return (
        <div className={cn("text-center text-[13px]", step.code === "error" ? "text-destructive" : "text-muted-foreground")}>
          {t.notices[step.code]}
          {step.text && <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-background px-3 py-2 text-left font-mono text-[12px]">{step.text}</pre>}
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
      <ToolIcon name={step.name} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-[13px] text-muted-foreground">{step.name}</span>
      <span className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-foreground/80">{step.title !== step.name ? step.title : ""}</span>
      <ToolStatus status={step.status} />
    </>
  );
  if (!expandable) return <div className="flex h-7 items-center gap-2 px-2">{row}</div>;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group/tool flex h-7 w-full items-center gap-2 rounded-md px-2 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        {row}
        <ChevronRightIcon className={cn("size-3 shrink-0 text-muted-foreground opacity-0 transition group-hover/tool:opacity-100", open && "rotate-90 opacity-100")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-[21px] flex flex-col gap-2 border-l border-border/70 py-1.5 pl-3 pr-2">
        {step.input && (step.name === "ExitPlanMode" ? <MessageText text={step.input} className="text-sm" /> : <Detail label={t.input} text={step.input} />)}
        {nested && (
          <div className="border-l border-border pl-3">
            <Timeline steps={all} running={false} parentId={step.id} />
          </div>
        )}
        {step.output && <Detail label={t.output} text={step.output} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-muted-foreground">{label}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background px-3 py-2 font-mono text-[12px] leading-relaxed">{text}</pre>
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
    <section aria-label={t.asks} className="mb-2 rounded-2xl border border-warning/30 bg-secondary p-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            {t.asks} <span className="font-mono">{approval.tool}</span>
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{approval.title}</p>
          {approval.detail && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{approval.detail}</pre>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-6.5">
        {canAnswer ? (
          approval.choices.map((choice, i) => (
            <Button
              key={choice}
              size="sm"
              variant={choice === "deny" ? "ghost" : i === 0 ? "default" : "secondary"}
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
      </div>
    </section>
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
    <section aria-label={t.question.title} className="mb-2 rounded-2xl border border-border/70 bg-secondary p-3.5">
      <p className="text-sm font-medium">{questions.length > 1 ? t.question.titleMany(questions.length) : t.question.title}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete && !answer.isPending) answer.mutate(false);
        }}
      >
        <FieldGroup className="mt-3 max-h-[45vh] gap-5 overflow-y-auto">
          {questions.map((q, qi) => {
            const choice = choices[q.question];
            const picked = choice?.picked ?? [];
            const options = [...q.options.map((o) => ({ value: o.label, label: o.label, description: o.description })), { value: OTHER_ANSWER, label: t.question.other, description: undefined }];
            const id = (i: number) => `code-q${qi}-${i}`;
            const card = (o: (typeof options)[number], i: number, control: ReactNode) => (
              <FieldLabel key={o.value} htmlFor={id(i)}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{o.label}</FieldTitle>
                    {o.description && <FieldDescription>{o.description}</FieldDescription>}
                  </FieldContent>
                  {control}
                </Field>
              </FieldLabel>
            );
            return (
              <FieldSet key={q.question} disabled={!canAnswer}>
                <FieldLegend variant="label" className="flex items-start gap-2">
                  {q.header && <Badge variant="secondary">{q.header}</Badge>}
                  <span>{q.question}</span>
                </FieldLegend>
                {q.multiSelect ? (
                  <div data-slot="checkbox-group" className="flex flex-col gap-3">
                    {options.map((o, i) =>
                      card(
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
                  <RadioGroup value={picked[0] ?? ""} onValueChange={(v) => set(q.question, { picked: [String(v)] })}>
                    {options.map((o, i) => card(o, i, <RadioGroupItem value={o.value} id={id(i)} />))}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canAnswer ? (
            <>
              <Button type="submit" size="sm" disabled={!complete || answer.isPending}>
                {answer.isPending && !answer.variables ? c.inProgress : t.question.answer}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate(true)}>
                {answer.isPending && answer.variables ? c.inProgress : t.question.skip}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.waitingOwner}</p>
          )}
        </div>
      </form>
    </section>
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
    <section aria-label={t.plan.title} className="mb-2 rounded-2xl border border-border/70 bg-secondary p-3.5">
      <div className="flex items-start gap-2.5">
        <TaskListIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{t.plan.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t.plan.help}</p>
        </div>
      </div>
      {approval.plan && (
        <div className="mt-3 max-h-[40vh] overflow-y-auto rounded-lg bg-background px-3.5 py-2.5">
          <MessageText text={approval.plan} className="text-sm" />
        </div>
      )}
      {canAnswer ? (
        <>
          <Textarea
            rows={2}
            value={feedback}
            aria-label={t.plan.feedback}
            placeholder={t.plan.feedbackPlaceholder}
            onChange={(e) => setFeedback(e.target.value)}
            className="mt-3 max-h-32 bg-background"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={answer.isPending || !!feedback.trim()} onClick={() => answer.mutate(true)}>
              {answer.isPending && answer.variables ? c.inProgress : t.plan.approve}
            </Button>
            <Button size="sm" variant="secondary" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
              {answer.isPending && !answer.variables ? c.inProgress : t.plan.revise}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t.waitingOwner}</p>
      )}
    </section>
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
function SessionComposer({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const area = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const send = useMutation({
    mutationFn: (value: string) => sendToCodeSession(conversationId, session.id, value),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      setText("");
    },
  });
  const stop = useMutation({
    mutationFn: () => stopCodeSession(conversationId, session.id),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: t.stopped },
  });
  const mode = useMutation({
    mutationFn: (value: CodePermissionMode) => setCodeSessionMode(conversationId, session.id, value),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: (s: CodeSession) => t.modeChanged(t.modes[s.mode]) },
  });
  const query = dismissed ? null : slashQuery(text, caret);
  const items = query === null ? [] : commandItems(session, query);
  // While Claude Code works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = active(session.status) && !text.trim();
  const submit = () => {
    const value = text.trim();
    if (value && !send.isPending) send.mutate(value);
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
      <InputGroup className="h-auto flex-col items-stretch border-0 bg-transparent">
        <InputGroupTextarea
          ref={area}
          rows={1}
          value={text}
          autoFocus
          aria-expanded={query !== null && items.length > 0}
          aria-autocomplete="list"
          placeholder={active(session.status) ? t.placeholderRunning : session.commands.length ? `${t.placeholderIdle} · ${t.commands.hint}` : t.placeholderIdle}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            setHighlight(0);
            setDismissed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
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
              if (!mode.isPending) mode.mutate(nextCodeMode(session.mode));
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
          <ModePicker value={session.mode} disabled={mode.isPending} onSelect={(value) => value !== session.mode && mode.mutate(value)} />
          <span className="flex-1" />
          <SessionModelPicker conversationId={conversationId} session={session} />
          {stoppable ? (
            <Button type="button" size="icon" aria-label={stop.isPending ? t.stopping : t.stop} disabled={stop.isPending} onClick={() => stop.mutate()} className="disabled:opacity-40">
              {stop.isPending ? <Spinner /> : <StopIcon className="size-5" />}
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label={t.send} disabled={!text.trim() || send.isPending} className="disabled:opacity-40">
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

/** Claude Code's permission mode, each with what it lets it do. */
function ModePicker({ value, onSelect, disabled }: { value: CodePermissionMode; onSelect: (mode: CodePermissionMode) => void; disabled?: boolean }) {
  const t = useT(messages);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<InputGroupButton size="sm" aria-label={t.mode} disabled={disabled} />} />}>{t.modes[value]}</TooltipTrigger>
        <TooltipContent>{t.modeShortcut}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onSelect(v as CodePermissionMode)}>
          {CODE_PERMISSION_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m} className="h-auto items-start py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{t.modes[m]}</span>
                <span className="text-[12px] text-muted-foreground">{t.modeHelp[m]}</span>
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
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2 overflow-hidden rounded-2xl border border-border/70 bg-background/60">
      <CollapsibleTrigger
        aria-label={t.label(done, todos.length)}
        className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <TaskListIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0">{t.title}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{t.progress(done, todos.length)}</span>
        {current && !open && <span className="min-w-0 truncate text-muted-foreground">{current.activeForm ?? current.content}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60">
        <ul className="max-h-48 overflow-y-auto py-1.5">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-start gap-2 px-3 py-1 text-[13px]">
              <TodoMark status={todo.status} running={running} />
              <span className={cn("min-w-0 break-words", todo.status === "completed" && "text-muted-foreground line-through", todo.status === "in_progress" && "font-medium")}>
                {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
  return <CodeModelPicker conversationId={conversationId} value={session.model} onSelect={(model) => change.mutate(model)} />;
}

/**
 * A Claude Code model among the ones the owner may use: searchable, each with its vendor's logo, as
 * in the conversation's picker. Null: Claude Code's default.
 */
function CodeModelPicker({ conversationId, value, onSelect }: { conversationId: string; value: string | null; onSelect: (model: string) => void }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId));
  if (!models.length && !value) return null;
  const current = models.find((m) => m.id === value);
  // Claude Code's default, as it resolved it: listed even when it is not among the models offered.
  const list = value && !current ? [{ id: value }, ...models] : models;
  const key = (m: { id: string; label?: string }) => `${m.id} ${m.label ?? ""}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<InputGroupButton size="sm" />} className="gap-1.5">
        <ModelLogo provider="anthropic" model={value ?? undefined} className="size-3.5" />
        {current?.label ?? value ?? t.model}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-72 p-0">
        <Command defaultValue={key(current ?? list[0] ?? { id: "" })}>
          <CommandInput placeholder={t.searchModel} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.noModel}</CommandEmpty>
            <CommandGroup heading={<GroupHeading provider="claude-code" label={t.claudeCode} />}>
              {list.map((m) => (
                <ModelOption
                  key={m.id}
                  value={key(m)}
                  label={"label" in m && m.label ? m.label : m.id}
                  description={"description" in m ? m.description : undefined}
                  reasoning={"reasoning" in m ? m.reasoning : undefined}
                  logo={<ModelLogo model={m.id} provider="anthropic" />}
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
