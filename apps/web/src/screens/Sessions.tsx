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
import { CodePriorityIcon, CodeStateIcon, IssueIcon } from "@/components/CodeSessionMarks";
import { CodePriorityMenu, priorityOfKey, useSetCodePriority, useSetCodePriorityOf } from "@/components/CodePriorityMenu";
import { EmptyFigure } from "@/components/EmptyFigure";
import { BranchIcon, ChevronLeftIcon, ClockIcon, FolderIcon, HistoryIcon, TerminalIcon, WarningIcon } from "@/components/icons";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { CardAction, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import { ChecksMark } from "@/components/github/PullRequestCard";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    emptyView: "Switch to another view, or show stopped sessions in Display.",
    errorTitle: "Sessions unavailable",
    error: "Code sessions can't be reached right now.",
  },
  fr: {
    emptyView: "Passe à une autre vue, ou affiche les sessions arrêtées dans Affichage.",
    errorTitle: "Sessions indisponibles",
    error: "Les sessions de code sont injoignables pour le moment.",
  },
});

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

const VIEWS: CodeSessionView[] = ["active", "parked", "finished", "all"];

/**
 * Every code session of your conversations, as Linear
 * lists issues. Views (Active, Over, All), then groups by state, priority or project, each sorted by
 * priority then last activity. Priority: its mark (a menu), keys 1 to 4 and 0 on a row, or dragging a
 * row into another priority group. A row opens its conversation with the session beside the thread.
 */
export function Sessions() {
  const t = useT(codeSessions);
  const c = useT(common);
  const m = useT(messages);
  const b = t.board;
  useOrgTitle(t.page.title);
  const [display, setDisplay] = useDisplay();
  const { data: sessions = [], isPending, isError, error, refetch } = useQuery(allCodeSessionsQuery);
  // What each view would show, stopped sessions counted only when they are shown.
  const count = (view: CodeSessionView) => groupCodeSessions(sessions, { ...display, view }).reduce((n, g) => n + g.sessions.length, 0);
  const groups = groupCodeSessions(sessions, display);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/" aria-label={c.back} />} className="-ml-2 mb-2 md:hidden">
            <ChevronLeftIcon />
          </Button>
          <h1 className="text-xl font-medium">{t.page.title}</h1>
          {sessions.length > 0 && (
            <div className="mt-3 flex items-center gap-0.5">
              <Tabs value={display.view} onValueChange={(v) => setDisplay({ view: v as CodeSessionView })} className="min-w-0 flex-1">
                <TabsList>
                  {VIEWS.map((v) => (
                    <TabsTrigger key={v} value={v}>
                      {b.views[v]}
                      <Badge variant="secondary">{count(v)}</Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <DisplayMenu display={display} onChange={setDisplay} />
            </div>
          )}
          {isPending ? (
            <div className="mt-6 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError && !sessions.length ? (
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WarningIcon />
                </EmptyMedia>
                <EmptyTitle>{m.errorTitle}</EmptyTitle>
                <EmptyDescription title={error.message}>{m.error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="secondary" onClick={() => void refetch()}>
                  {c.retry}
                </Button>
              </EmptyContent>
            </Empty>
          ) : !groups.length ? (
            <Empty className="mt-10">
              {sessions.length ? (
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TerminalIcon />
                  </EmptyMedia>
                  <EmptyTitle>{b.empty}</EmptyTitle>
                  <EmptyDescription>{m.emptyView}</EmptyDescription>
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
            groups.map((g) => <Group key={g.key} group={display.group} groupKey={g.key} sessions={g.sessions} />)
          )}
        </div>
      </div>
    </section>
  );
}

/** Display options: group by, order by, and whether stopped sessions show. */
/** Leading marks of the grouping and ordering options: the session marks themselves, a folder for the project. */
const displayIcon = {
  state: <CodeStateIcon state="idle" />,
  priority: <CodePriorityIcon priority="high" />,
  project: <FolderIcon />,
  updated: <HistoryIcon />,
  created: <ClockIcon />,
};

function DisplayMenu({ display, onChange }: { display: Display; onChange: (patch: Partial<Display>) => void }) {
  const b = useT(codeSessions).board;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="ml-auto" />}>{b.display}</PopoverTrigger>
      <PopoverContent align="end">
        <Field orientation="horizontal">
          <FieldLabel className="flex-1">{b.groupBy}</FieldLabel>
          <OptionSelect
            className="w-36"
            value={display.group}
            options={(["state", "priority", "project"] as const).map((v) => ({ value: v, label: b.groupings[v], icon: displayIcon[v] }))}
            onValueChange={(v) => onChange({ group: v as CodeSessionGrouping })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel className="flex-1">{b.orderBy}</FieldLabel>
          <OptionSelect
            className="w-36"
            value={display.order}
            options={(["priority", "updated", "created"] as const).map((v) => ({ value: v, label: b.orderings[v], icon: displayIcon[v] }))}
            onValueChange={(v) => onChange({ order: v as CodeSessionOrdering })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="sessions-stopped" className="flex-1">
            {b.showStopped}
          </FieldLabel>
          <Switch id="sessions-stopped" checked={display.showStopped} onCheckedChange={(v) => onChange({ showStopped: v })} />
        </Field>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A group's card: its mark (state, priority or GitHub), its name, its count, then its rows.
 * Grouped by priority, a row dropped here takes the group's priority.
 */
function Group({ group, groupKey, sessions }: { group: CodeSessionGrouping; groupKey: string; sessions: CodeSession[] }) {
  const t = useT(codeSessions);
  const [over, setOver] = useState(false);
  const priority = group === "priority" ? (groupKey as CodePriority) : null;
  const drop = useDropPriority(priority);
  const mark =
    group === "state" ? (
      <CodeStateIcon state={groupKey as CodeSessionState} className="size-4" />
    ) : group === "priority" ? (
      <CodePriorityIcon priority={groupKey as CodePriority} className="size-4" />
    ) : (
      <BrandLogo domain="github.com" fallback={<BranchIcon className="size-4" />} className="size-4 dark:invert" />
    );
  // A project by its repository's name (« e-do-bots »), its owner on hover.
  const label = group === "state" ? t.stateGroups[groupKey as CodeSessionState] : group === "priority" ? t.priorities[groupKey as CodePriority] : (groupKey.split("/")[1] ?? groupKey) || t.board.noProject;
  return (
    <ListCard
      size="sm"
      className={cn("mt-6", over && "ring-2 ring-ring")}
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
      <ListCardHeader>
        <CardTitle title={group === "project" ? groupKey : undefined} className="flex items-center gap-2">
          {mark}
          {label}
        </CardTitle>
        <CardAction>
          <Badge variant="secondary" className="tabular-nums">
            {sessions.length}
          </Badge>
        </CardAction>
      </ListCardHeader>
      <ListCardRows>
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} grouping={group} />
        ))}
      </ListCardRows>
    </ListCard>
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
 * A session row: its priority (a menu, for its owner), its state (unless the group says it),
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
    <Item
      size="sm"
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
      className="cursor-pointer flex-nowrap hover:bg-muted/50"
    >
      {owner ? (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CodePriorityMenu
            session={s}
            align="start"
            trigger={
              <Button variant="ghost" size="icon-xs" aria-label={`${t.priority} ${t.priorities[s.priority]}`}>
                <CodePriorityIcon priority={s.priority} />
              </Button>
            }
          />
        </span>
      ) : (
        <span className="flex size-6 items-center justify-center" title={t.priorities[s.priority]}>
          <CodePriorityIcon priority={s.priority} />
        </span>
      )}
      {grouping !== "state" && <CodeStateIcon state={state} />}
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0">
          <span className="truncate">{s.title}</span>
        </ItemTitle>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
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
          {detail && <span className={cn("min-w-0 truncate", state === "running" && "typing-shimmer", state === "waiting" && "text-state-you", state === "failed" && "text-priority-urgent")}>{detail}</span>}
          {s.git?.pr?.state === "open" && !(state === "waiting" || state === "running") && <ChecksMark checks={s.git.pr.checks} />}
        </div>
      </ItemContent>
      <span className="shrink-0 self-start text-xs text-muted-foreground tabular-nums">{listTime(new Date(s.updatedAt))}</span>
    </Item>
  );
}
