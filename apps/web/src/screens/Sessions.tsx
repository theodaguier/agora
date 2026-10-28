import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState, type DragEvent } from "react";
import {
  codeDetailLine,
  codeSessionProject,
  codeSessionState,
  groupCodeSessions,
  type CodePriority,
  type CodeSession,
  type CodeSessionGrouping,
  type CodeSessionOrdering,
  type CodeSessionState,
  type CodeSessionView,
} from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import { newCodeSessionFor } from "@/components/CodeSession";
import { CodePriorityIcon, CodeStateIcon, IssueIcon } from "@/components/CodeSessionMarks";
import { CodePriorityMenu, priorityOfKey, useSetCodePriority, useSetCodePriorityOf } from "@/components/CodePriorityMenu";
import { EmptyFigure } from "@/components/EmptyFigure";
import { BranchIcon, ChevronLeftIcon, PlusIcon, TerminalIcon } from "@/components/icons";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { allCodeSessionsQuery, codeEnginesQuery } from "@/lib/code-sessions";
import { listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Display = { view: CodeSessionView; group: CodeSessionGrouping; order: CodeSessionOrdering; showStopped: boolean };

const DISPLAY_KEY = "agora.sessions.display";
const DEFAULT_DISPLAY: Display = { view: "active", group: "state", order: "priority", showStopped: false };

/** How the list is shown, kept in this browser as Linear keeps a view's display options. */
function loadDisplay(): Display {
  try {
    return { ...DEFAULT_DISPLAY, ...(JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? "{}") as Partial<Display>) };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

function useDisplay() {
  const [display, setDisplay] = useState(loadDisplay);
  const update = (patch: Partial<Display>) =>
    setDisplay((d) => {
      const next = { ...d, ...patch };
      try {
        localStorage.setItem(DISPLAY_KEY, JSON.stringify(next));
      } catch {
        // Blocked storage: kept for this page only.
      }
      return next;
    });
  return [display, update] as const;
}

const VIEWS: CodeSessionView[] = ["active", "finished", "all"];

/**
 * Figma « Sessions : vues et regroupement » (13, 14): every code session of your conversations, as Linear
 * lists issues. Views (Active, Over, All), then groups by state, priority or project, each sorted by
 * priority then last activity. Priority: its mark (a menu), keys 1 to 4 and 0 on a row, or dragging a
 * row into another priority group. A row opens its conversation with the session beside the thread.
 */
export function Sessions() {
  const t = useT(codeSessions);
  const c = useT(common);
  const b = t.board;
  useOrgTitle(t.page.title);
  const [display, setDisplay] = useDisplay();
  const { data: sessions = [], isPending } = useQuery(allCodeSessionsQuery);
  // What each view would show, stopped sessions counted only when they are shown.
  const count = (view: CodeSessionView) => groupCodeSessions(sessions, { ...display, view }).reduce((n, g) => n + g.sessions.length, 0);
  const groups = groupCodeSessions(sessions, display);
  const start = useNewSession(sessions);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/" aria-label={c.back} />} className="-ml-2 mb-2 hover:bg-transparent md:hidden">
            <ChevronLeftIcon className="size-5" />
          </Button>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl leading-7 font-medium">{t.page.title}</h1>
            {start.can && <NewSessionButton projects={start.projects} onStart={start.open} />}
          </div>
          {sessions.length > 0 && (
            <div className="mt-3 flex items-center gap-0.5">
              {/* Figma « Vue de liste »: text tabs, a light background on the one shown, the count in light grey. */}
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={display.view === v}
                  onClick={() => setDisplay({ view: v })}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-foreground"
                >
                  {b.views[v]}
                  <span className="font-normal text-subtle tabular-nums">{count(v)}</span>
                </button>
              ))}
              <DisplayMenu display={display} onChange={setDisplay} />
            </div>
          )}
          {isPending ? (
            <Spinner className="mx-auto mt-16 size-5 text-muted-foreground" />
          ) : !groups.length ? (
            <Empty className="mt-10">
              {sessions.length ? (
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TerminalIcon />
                  </EmptyMedia>
                  <EmptyTitle>{b.empty}</EmptyTitle>
                </EmptyHeader>
              ) : (
                <EmptyHeader>
                  <EmptyFigure mascot="grey" />
                  <EmptyTitle>{t.page.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{t.page.empty}</EmptyDescription>
                </EmptyHeader>
              )}
            </Empty>
          ) : (
            groups.map((g) => (
              <Group key={g.key} group={display.group} groupKey={g.key} sessions={g.sessions} onStart={start.can && display.group === "project" && g.key ? () => start.open(g.key) : undefined} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Starting a session from here: it opens as a new session tab, its repository chosen. A session lives in
 * a conversation: the one of the project's latest session, else of the latest session, else the latest
 * conversation. Only for those who may start one (an engine of theirs is installed).
 */
function useNewSession(sessions: CodeSession[]) {
  const navigate = useNavigate();
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const known = new Set(conversations.map((c) => c.id));
  const latest = sessions.filter((s) => known.has(s.conversationId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const fallback = latest[0]?.conversationId ?? [...conversations].sort((a, b) => b.lastAt.localeCompare(a.lastAt))[0]?.id;
  const { data: engines = [] } = useQuery({ ...codeEnginesQuery(fallback ?? ""), enabled: !!fallback, retry: false });
  return {
    can: !!fallback && engines.length > 0,
    /** The projects worked on, the latest first. */
    projects: [...new Set(latest.map(codeSessionProject).filter(Boolean))].slice(0, 8),
    open: (repo: string | null) => {
      const conversationId = (repo ? latest.find((s) => codeSessionProject(s) === repo)?.conversationId : undefined) ?? fallback;
      if (!conversationId) return;
      void navigate({ to: "/c/$conversationId/code/$sessionId", params: { conversationId, sessionId: newCodeSessionFor(repo) } });
    },
  };
}

/** « Nouvelle session »: on one of the projects worked on, or another repository picked beside the field. */
function NewSessionButton({ projects, onStart }: { projects: string[]; onStart: (repo: string | null) => void }) {
  const b = useT(codeSessions).board;
  if (!projects.length) {
    return (
      <Button size="sm" onClick={() => onStart(null)}>
        {b.newSession}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>{b.newSession}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {projects.map((repo) => (
          <DropdownMenuItem key={repo} title={repo} onClick={() => onStart(repo)}>
            <BrandLogo domain="github.com" fallback={<BranchIcon className="size-4" />} className="size-4 dark:invert" />
            <span className="truncate">{repo.split("/")[1] ?? repo}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onStart(null)}>{b.otherRepo}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Figma « Affichage »: group by, order by, and whether stopped sessions show. */
function DisplayMenu({ display, onChange }: { display: Display; onChange: (patch: Partial<Display>) => void }) {
  const b = useT(codeSessions).board;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="ml-auto" />}>{b.display}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <Field orientation="horizontal">
          <FieldLabel className="flex-1 font-normal">{b.groupBy}</FieldLabel>
          <OptionSelect
            className="w-36"
            value={display.group}
            options={(["state", "priority", "project"] as const).map((v) => ({ value: v, label: b.groupings[v] }))}
            onValueChange={(v) => onChange({ group: v as CodeSessionGrouping })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel className="flex-1 font-normal">{b.orderBy}</FieldLabel>
          <OptionSelect
            className="w-36"
            value={display.order}
            options={(["priority", "updated", "created"] as const).map((v) => ({ value: v, label: b.orderings[v] }))}
            onValueChange={(v) => onChange({ order: v as CodeSessionOrdering })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="sessions-stopped" className="flex-1 font-normal">
            {b.showStopped}
          </FieldLabel>
          <Switch id="sessions-stopped" checked={display.showStopped} onCheckedChange={(v) => onChange({ showStopped: v })} />
        </Field>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Figma « Titre de groupe » and its card: the group's mark (state, priority or GitHub), its name, its
 * count in light grey. Grouped by priority, a row dropped here takes the group's priority.
 */
function Group({ group, groupKey, sessions, onStart }: { group: CodeSessionGrouping; groupKey: string; sessions: CodeSession[]; onStart?: () => void }) {
  const t = useT(codeSessions);
  const [over, setOver] = useState(false);
  const priority = group === "priority" ? (groupKey as CodePriority) : null;
  const drop = useDropPriority(priority);
  const mark =
    group === "state" ? (
      <CodeStateIcon state={groupKey as CodeSessionState} className="size-3.5" />
    ) : group === "priority" ? (
      <CodePriorityIcon priority={groupKey as CodePriority} className="size-3.5" />
    ) : (
      <BrandLogo domain="github.com" fallback={<BranchIcon className="size-3.5" />} className="size-3.5 dark:invert" />
    );
  // A project by its repository's name (« e-do-bots »), its owner on hover.
  const label = group === "state" ? t.stateGroups[groupKey as CodeSessionState] : group === "priority" ? t.priorities[groupKey as CodePriority] : (groupKey.split("/")[1] ?? groupKey) || t.board.noProject;
  return (
    <section className="mt-7 flex flex-col gap-2">
      <h2 title={group === "project" ? groupKey : undefined} className="flex items-center gap-1.5 pl-0.5 text-[13px] leading-[18px] text-muted-foreground">
        {mark}
        {label}
        <span className="text-subtle tabular-nums">{sessions.length}</span>
        {onStart && (
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t.board.newIn(label)} onClick={onStart} className="ml-auto" />}>
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>{t.board.newIn(label)}</TooltipContent>
          </Tooltip>
        )}
      </h2>
      <div
        className={cn("flex flex-col rounded-[14px] border border-border p-1 transition-colors", over && "border-ring bg-accent/40")}
        onDragOver={(e) => {
          if (!priority || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          drop(e);
        }}
      >
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} grouping={group} />
        ))}
      </div>
    </section>
  );
}

const DRAG_TYPE = "application/x-agora-session";

/** A row dropped into a priority group: the session and its conversation travel in the drag. */
function useDropPriority(priority: CodePriority | null) {
  const set = useSetCodePriorityOf();
  return (e: DragEvent) => {
    const data = priority && e.dataTransfer.getData(DRAG_TYPE);
    if (!data) return;
    e.preventDefault();
    const { id, conversationId, from } = JSON.parse(data) as { id: string; conversationId: string; from: CodePriority };
    if (from !== priority) set.mutate({ conversationId, id, priority });
  };
}

/**
 * Figma « Ligne de session »: its priority (a menu, for its owner), its state (unless the group says it),
 * its title, then who started it, its issue, what it waits for or where its work is, and when. No « · ».
 */
function SessionRow({ session: s, grouping }: { session: CodeSession; grouping: CodeSessionGrouping }) {
  const t = useT(codeSessions);
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const conv = conversations.find((c) => c.id === s.conversationId);
  const agent = s.agentId ? conv?.agents.find((a) => a.id === s.agentId) : undefined;
  const owner = s.requestedBy === user.id;
  const setPriority = useSetCodePriority(s);
  const state = codeSessionState(s);
  const who = agent?.name ?? (owner ? t.page.you : null);
  const detail =
    state === "waiting" || state === "running"
      ? codeDetailLine(s)
      : s.git?.pr
        ? `${t.git.pr(s.git.pr.number)} ${t.git.prState[s.git.pr.state]}`
        : s.todos.length
          ? t.page.todos(s.todos.filter((x) => x.status === "completed").length, s.todos.length)
          : null;
  const project = grouping !== "project" ? codeSessionProject(s) : "";
  const open = () => {
    void navigate({ to: "/c/$conversationId/code/$sessionId", params: { conversationId: s.conversationId, sessionId: s.id } });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={owner}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: s.id, conversationId: s.conversationId, from: s.priority }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") return open();
        const p = owner ? priorityOfKey(e) : null;
        if (!p || p === s.priority) return;
        e.preventDefault();
        setPriority.mutate(p);
      }}
      className="group/row flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-2.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      {owner ? (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CodePriorityMenu
            session={s}
            align="start"
            trigger={
              <button type="button" aria-label={`${t.priority} ${t.priorities[s.priority]}`} className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <CodePriorityIcon priority={s.priority} />
              </button>
            }
          />
        </span>
      ) : (
        <span className="flex size-6 items-center justify-center" title={t.priorities[s.priority]}>
          <CodePriorityIcon priority={s.priority} />
        </span>
      )}
      {grouping !== "state" && <CodeStateIcon state={state} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[15px] leading-[21px]">{s.title}</p>
        <p className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
          {who && (
            <span className="flex shrink-0 items-center gap-1.5">
              {agent && <AgentAvatar agent={agent} className="size-4" />}
              {who}
            </span>
          )}
          {project && <span className="shrink-0">{project.split("/")[1] ?? project}</span>}
          {s.issue && (
            <span className="flex shrink-0 items-center gap-1" title={s.issue.title}>
              <IssueIcon />#{s.issue.number}
            </span>
          )}
          {detail && <span className={cn("min-w-0 truncate", state === "waiting" && "text-state-you", state === "failed" && "text-priority-urgent")}>{detail}</span>}
        </p>
      </div>
      <span className="shrink-0 self-start pt-0.5 text-xs text-subtle tabular-nums">{listTime(new Date(s.updatedAt))}</span>
    </div>
  );
}
