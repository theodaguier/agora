import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { placeCodeSessions, type CodeApproval, type CodeGit, type CodeSession, type CodeSessionRef, type CodeSessionStatus, type CodeStep } from "@agora/core";
import { common } from "@agora/core/i18n";
import {
  ArrowUpIcon,
  BranchIcon,
  CheckCircleIcon,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormLabel } from "@/components/FormLabel";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { defineMessages, useT } from "@/i18n";
import {
  answerCodeApproval,
  applyCodeSession,
  codeAccountsQuery,
  codeModelsQuery,
  runCodeGit,
  switchCodeSessionAccount,
  type CodeGitRequest,
  codeSessionQuery,
  codeSessionsQuery,
  sendToCodeSession,
  setCodeSessionModel,
  refreshCodeSessionGit,
  stopCodeSession,
  writeCommitMessage,
} from "@/lib/code-sessions";
import { confirmAction } from "@/lib/confirm";
import { copyText } from "@/lib/feedback";
import { dividerLabel } from "@/lib/dates";
import { useFormat } from "@/lib/usage-format";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    claudeCode: "Claude Code",
    sessions: "Claude Code sessions",
    sessionsWorking: "Claude Code sessions · one is working",
    status: { running: "Working", waiting: "Waiting for approval", idle: "Done", stopped: "Stopped", failed: "Failed" } as Record<CodeSessionStatus, string>,
    follow: "Follow",
    open: "Open",
    asks: "Claude Code is asking to use",
    choices: { once: "Allow", session: "Allow for this session", deny: "Deny" } as Record<CodeApproval["choices"][number], string>,
    waitingOwner: "Waiting for the person who started it.",
    placeholderRunning: "Write to Claude Code, it reads it at its next step",
    placeholderIdle: "Give it a new instruction",
    send: "Send",
    stop: "Stop",
    stopping: "Stopping…",
    stopped: "Claude Code stopped.",
    readOnly: "Only the person who started this session can write to it.",
    notices: { stopped: "Stopped.", restart: "Interrupted by a server restart.", error: "Claude Code failed." },
    limit: (pct: string, window: string) => `Subscription usage at ${pct} (${window}).`,
    limited: (window: string, at: string) => `Subscription limit reached (${window})${at ? `, back at ${at}` : ""}.`,
    windows: { five_hour: "5 hours", seven_day: "7 days", session: "session" } as Record<string, string>,
    account: "Claude account of the last run",
    serverAccount: "Server's account",
    switchTo: (email: string) => `Switch to ${email}`,
    switched: "Account changed: Claude Code picks up where it stopped.",
    input: "Input",
    output: "Result",
    empty: "Starting…",
    model: "Model",
    searchModel: "Search models",
    noModel: "No models.",
    modelChanged: "Model changed.",
    tokens: (n: string) => `${n} tokens`,
    runs: (n: number) => (n === 1 ? "1 run" : `${n} runs`),
    usageDetail: (input: string, output: string, cache: string, calls: number) => `${input} in · ${output} out · ${cache} from cache · ${calls} model calls`,
    costNote: "Estimated at API prices: the subscription is not billed per token.",
    copyPath: "Copy the path",
    latest: "Latest steps",
    git: {
      changes: (n: number) => (n === 1 ? "1 file changed" : `${n} files changed`),
      ahead: (n: number, pushed: boolean) => (pushed ? `${n} to push` : n === 1 ? "1 commit, not pushed" : `${n} commits, not pushed`),
      behind: (n: number) => `${n} behind GitHub`,
      clean: "Up to date",
      pr: (n: number) => `PR #${n}`,
      prState: { open: "open", closed: "closed", merged: "merged" } as Record<"open" | "closed" | "merged", string>,
      noGithub: "No GitHub access: add GH_TOKEN to the vault.",
      busy: "Available once Claude Code has finished.",
      commit: "Commit",
      commitPush: "Commit and push",
      commitPushPr: (n: number) => `Commit and push to PR #${n}`,
      pushPr: (n: number) => `Push to PR #${n}`,
      more: "More git actions",
      moreFiles: (n: number) => `and ${n} more`,
      messagePlaceholder: "Commit message (written by Claude Code if empty)",
      generate: "Write the message with Claude Code",
      writing: "Claude Code is writing the message…",
      push: "Push",
      pull: "Pull",
      openPr: "Open a PR",
      merge: "Merge",
      message: "Commit message",
      prTitle: "Open a pull request",
      prHelp: (branch: string, base: string) => `From ${branch} into ${base}. What is not on GitHub yet is pushed first.`,
      title: "Title",
      body: "Description",
      mergeTitle: (n: number, base: string) => `Merge PR #${n} into ${base}?`,
      mergeHelp: "Its commits are squashed into one on the target branch.",
      committed: "Committed.",
      pushed: "Pushed.",
      pulled: "Updated.",
      opened: "Pull request opened.",
      merged: "Pull request merged.",
      failed: "Git failed",
    },
  },
  fr: {
    claudeCode: "Claude Code",
    sessions: "Sessions Claude Code",
    sessionsWorking: "Sessions Claude Code · une session travaille",
    status: { running: "En cours", waiting: "Attend une autorisation", idle: "Terminé", stopped: "Arrêté", failed: "Échec" },
    follow: "Suivre",
    open: "Ouvrir",
    asks: "Claude Code demande à utiliser",
    choices: { once: "Autoriser", session: "Autoriser pour la session", deny: "Refuser" },
    waitingOwner: "En attente de la personne qui l'a lancée.",
    placeholderRunning: "Écris à Claude Code, il le lira à sa prochaine étape",
    placeholderIdle: "Donne-lui une nouvelle instruction",
    send: "Envoyer",
    stop: "Arrêter",
    stopping: "Arrêt…",
    stopped: "Claude Code arrêté.",
    readOnly: "Seule la personne qui a lancé cette session peut lui écrire.",
    notices: { stopped: "Arrêté.", restart: "Interrompu par un redémarrage du serveur.", error: "Claude Code a échoué." },
    limit: (pct: string, window: string) => `Abonnement utilisé à ${pct} (${window}).`,
    limited: (window: string, at: string) => `Limite de l'abonnement atteinte (${window})${at ? `, reprise à ${at}` : ""}.`,
    windows: { five_hour: "5 heures", seven_day: "7 jours", session: "session" },
    account: "Compte Claude du dernier run",
    serverAccount: "Compte du serveur",
    switchTo: (email: string) => `Passer sur ${email}`,
    switched: "Compte changé : Claude Code reprend là où il s'était arrêté.",
    input: "Entrée",
    output: "Résultat",
    empty: "Démarrage…",
    model: "Modèle",
    searchModel: "Rechercher un modèle",
    noModel: "Aucun modèle.",
    modelChanged: "Modèle changé.",
    tokens: (n: string) => `${n} tokens`,
    runs: (n: number) => (n <= 1 ? `${n} run` : `${n} runs`),
    usageDetail: (input: string, output: string, cache: string, calls: number) =>
      `${input} en entrée · ${output} en sortie · ${cache} en cache · ${calls} appels au modèle`,
    costNote: "Estimation au prix de l'API : l'abonnement n'est pas facturé au token.",
    copyPath: "Copier le chemin",
    latest: "Dernières étapes",
    git: {
      changes: (n: number) => (n <= 1 ? `${n} fichier modifié` : `${n} fichiers modifiés`),
      ahead: (n: number, pushed: boolean) => (pushed ? `${n} à pousser` : n <= 1 ? `${n} commit non poussé` : `${n} commits non poussés`),
      behind: (n: number) => `${n} en retard sur GitHub`,
      clean: "À jour",
      pr: (n: number) => `PR #${n}`,
      prState: { open: "ouverte", closed: "fermée", merged: "mergée" },
      noGithub: "Pas d'accès GitHub : ajoute GH_TOKEN au coffre.",
      busy: "Disponible quand Claude Code aura terminé.",
      commit: "Committer",
      commitPush: "Committer et pousser",
      commitPushPr: (n: number) => `Committer et pousser sur la PR #${n}`,
      pushPr: (n: number) => `Pousser sur la PR #${n}`,
      more: "Autres actions git",
      moreFiles: (n: number) => `et ${n} de plus`,
      messagePlaceholder: "Message du commit (écrit par Claude Code si vide)",
      generate: "Écrire le message avec Claude Code",
      writing: "Claude Code écrit le message…",
      push: "Pousser",
      pull: "Mettre à jour",
      openPr: "Créer la PR",
      merge: "Merger",
      message: "Message du commit",
      prTitle: "Créer une pull request",
      prHelp: (branch: string, base: string) => `De ${branch} vers ${base}. Ce qui n'est pas encore sur GitHub est poussé d'abord.`,
      title: "Titre",
      body: "Description",
      mergeTitle: (n: number, base: string) => `Merger la PR #${n} dans ${base} ?`,
      mergeHelp: "Ses commits sont regroupés en un seul sur la branche cible.",
      committed: "Commit créé.",
      pushed: "Branche poussée.",
      pulled: "Branche mise à jour.",
      opened: "PR ouverte.",
      merged: "PR mergée.",
      failed: "Échec de git",
    },
  },
});

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
  const detail = session?.approval ? `${session.approval.tool} · ${session.approval.title}` : active(status) ? session?.activity : null;
  return (
    <Item variant="outline" className={cn("my-1 w-full max-w-[min(680px,88%)]", className)}>
      <ItemMedia variant="icon">{session ? <StatusIcon status={status} /> : <CodeIcon />}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{session?.title ?? title}</ItemTitle>
        <ItemDescription className="truncate">
          {t.claudeCode} · {t.status[status]}
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
 * each opening its panel. Hidden while there are none; a dot while one works.
 */
export function CodeSessionsButton({ conversationId, current, onOpen }: { conversationId: string; current: string | null; onOpen: (sessionId: string) => void }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: sessions = [] } = useQuery(codeSessionsQuery(conversationId));
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
  if (!sessions.length) return null;
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
                  {t.status[s.status]}
                  {s.git?.pr ? ` · PR #${s.git.pr.number}` : s.git?.branch ? ` · ${s.git.branch}` : ""} · {dividerLabel(new Date(s.updatedAt))}
                </span>
              </span>
            </button>
          ))}
        </div>
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
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);

export function CodeSessionPanel({ conversationId, sessionId, onClose }: { conversationId: string; sessionId: string; onClose: () => void }) {
  const t = useT(messages);
  const wide = useWide();
  if (!wide) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
          <SheetTitle className="sr-only">{t.claudeCode}</SheetTitle>
          <CodeSessionView conversationId={conversationId} sessionId={sessionId} onClose={onClose} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <aside className="flex h-full w-[520px] shrink-0 flex-col bg-sidebar">
      <CodeSessionView conversationId={conversationId} sessionId={sessionId} onClose={onClose} />
    </aside>
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
  useGitRefresh(conversationId, sessionId, !!session?.git);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-2.5 px-4 pb-2 pt-3.5">
        {session && <StatusIcon status={session.status} className="mt-1 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-snug">{session?.title ?? t.claudeCode}</p>
          {session && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {t.status[session.status]}
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
          <Meta session={session} showModel={!owner} showAccount={owner} />
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
            {session.approval && <ApprovalBlock conversationId={conversationId} session={session} approval={session.approval} canAnswer={owner} />}
            {session.git && <ChangesBar conversationId={conversationId} session={session} git={session.git} owner={owner} />}
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

/** Directory and what the session consumed, on one line; the detail on hover. The model too, for those who cannot change it. */
function Meta({ session, showModel, showAccount }: { session: CodeSession; showModel: boolean; showAccount: boolean }) {
  const t = useT(messages);
  const f = useFormat();
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
    </div>
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
        {step.input && <Detail label={t.input} text={step.input} />}
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
    mutationFn: (choice: CodeApproval["choices"][number]) => answerCodeApproval(conversationId, session.id, approval.id, choice),
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

/** Same field as the conversation's: the instruction, the session's model, send. */
function SessionComposer({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [text, setText] = useState("");
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
  // While Claude Code works, the send button stops it; typing turns it back into send (an instruction mid-run).
  const stoppable = active(session.status) && !text.trim();
  const submit = () => {
    const value = text.trim();
    if (value && !send.isPending) send.mutate(value);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-[22px] bg-secondary p-1.5"
    >
      <InputGroup className="h-auto items-end border-0 bg-transparent">
        <InputGroupTextarea
          rows={1}
          value={text}
          autoFocus
          placeholder={active(session.status) ? t.placeholderRunning : t.placeholderIdle}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-0 min-w-0 px-2 py-1 text-[15px] leading-6 md:text-[15px]"
        />
        <InputGroupAddon align="inline-end" className="cursor-default gap-1 py-0 pr-0 has-[>button]:mr-0">
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

/** The session's model, among the ones its owner may use: searchable, each with its vendor's logo, as in the conversation's picker. */
function SessionModelPicker({ conversationId, session }: { conversationId: string; session: CodeSession }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: models = [] } = useQuery(codeModelsQuery(conversationId));
  const change = useMutation({
    mutationFn: (model: string) => setCodeSessionModel(conversationId, session.id, model),
    onSuccess: (s) => applyCodeSession(qc, s),
    meta: { success: t.modelChanged },
  });
  if (!models.length && !session.model) return null;
  const current = models.find((m) => m.id === session.model);
  // Claude Code's default, as it resolved it: listed even when it is not among the models offered.
  const list = session.model && !current ? [{ id: session.model }, ...models] : models;
  const value = (m: { id: string; label?: string }) => `${m.id} ${m.label ?? ""}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<InputGroupButton size="sm" />} className="gap-1.5">
        <ModelLogo provider="anthropic" model={session.model ?? undefined} className="size-3.5" />
        {current?.label ?? session.model ?? t.model}
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-72 p-0">
        <Command defaultValue={value(current ?? list[0] ?? { id: "" })}>
          <CommandInput placeholder={t.searchModel} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.noModel}</CommandEmpty>
            <CommandGroup heading={<GroupHeading provider="claude-code" label={t.claudeCode} />}>
              {list.map((m) => (
                <ModelOption
                  key={m.id}
                  value={value(m)}
                  label={"label" in m && m.label ? m.label : m.id}
                  description={"description" in m ? m.description : undefined}
                  reasoning={"reasoning" in m ? m.reasoning : undefined}
                  logo={<ModelLogo model={m.id} provider="anthropic" />}
                  active={m.id === session.model}
                  onSelect={() => {
                    setOpen(false);
                    if (m.id !== session.model) change.mutate(m.id);
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
