import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState, type DragEvent } from "react";
import {
  codeSessionState,
  groupCodeSessions,
  type CodePriority,
  type CodeSession,
  type CodeSessionGrouping,
  type CodeSessionOrdering,
  type CodeSessionState,
  type CodeSessionView,
  CODE_ENGINE_NAMES,
} from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import { CodePriorityIcon, CodeStateIcon } from "@/components/CodeSessionMarks";
import { PriorityIcon } from "@/components/Marks";
import { CodePriorityMenu, priorityOfKey, useSetCodePriority, useSetCodePriorityOf } from "@/components/CodePriorityMenu";
import { EmptyFigure } from "@/components/EmptyFigure";
import { LiveSessionCard } from "@/components/CodeSession";
import { CodeEnginesLogo, ModelLogo } from "@/components/ProviderLogo";
import { BranchIcon, ChevronLeftIcon, ClockIcon, FolderIcon, HistoryIcon, SlidersIcon, WarningIcon } from "@/components/icons";
import { OptionSelect } from "@/components/Pickers";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
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
const DEFAULT_DISPLAY: Display = { view: "all", group: "state", order: "priority", showStopped: true };

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
  // What waits for an answer comes first, as cards you decide in without opening them; not repeated below.
  const toDecide = display.view === "parked" || display.view === "finished" ? [] : sessions.filter((s) => codeSessionState(s) === "waiting" && !s.parked);
  const groups = groupCodeSessions(
    sessions.filter((s) => !toDecide.includes(s)),
    display,
  );
  const navigate = useNavigate();
  const shown = groups.reduce((n, g) => n + g.sessions.length, 0) + toDecide.length;
  return (
    // Figma « Sessions de code · 1440 »: the title and its count, display on the right; then the groups
    // of 40 px rows, as Linear's issues. What waits for an answer stays a card you decide in.
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-11.5 shrink-0 items-center gap-2 border-b pr-3.5 pl-3 md:pl-5">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" aria-label={c.back} />} className="md:hidden">
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-ui font-medium">{t.sessions}</h1>
        {shown > 0 && <span className="text-ui text-subtle-foreground tabular-nums">{shown}</span>}
        <span className="flex-1" />
        {sessions.length > 0 && <DisplayMenu display={display} onChange={setDisplay} count={count} />}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <div className="flex flex-col gap-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
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
        ) : !groups.length && !toDecide.length ? (
          <Empty className="mt-10">
            {sessions.length ? (
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CodeEnginesLogo />
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
          <>
            {toDecide.length > 0 && (
              <section aria-label={t.stateGroups.waiting}>
                <GroupHeader mark={<CodeStateIcon state="waiting" />} label={t.stateGroups.waiting} count={toDecide.length} />
                <div className="flex flex-col gap-3 border-b px-5 py-3">
                  {toDecide.map((s) => (
                    <LiveSessionCard
                      key={s.id}
                      session={s}
                      onOpen={() => void navigate({ to: "/c/$conversationId/code/$sessionId", params: { conversationId: s.conversationId, sessionId: s.id } })}
                    />
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <Group key={g.key} group={display.group} groupKey={g.key} sessions={g.sessions} />
            ))}
          </>
        )}
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

function DisplayMenu({ display, onChange, count }: { display: Display; onChange: (patch: Partial<Display>) => void; count: (view: CodeSessionView) => number }) {
  const b = useT(codeSessions).board;
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={b.display} className="text-muted-foreground" />}>
        <SlidersIcon />
      </PopoverTrigger>
      <PopoverContent align="end">
        <Field orientation="horizontal">
          <FieldLabel className="flex-1">{b.view}</FieldLabel>
          <OptionSelect
            className="w-36"
            value={display.view}
            options={VIEWS.map((v) => ({ value: v, label: `${b.views[v]} (${count(v)})` }))}
            onValueChange={(v) => onChange({ view: v as CodeSessionView })}
          />
        </Field>
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

/** A group's band (Figma): its mark, its name, its count in grey. */
function GroupHeader({ mark, label, count, title }: { mark: React.ReactNode; label: string; count: number; title?: string }) {
  return (
    <h2 title={title} className="flex h-9 items-center gap-2 border-b bg-card pr-4 pl-5 text-ui font-medium">
      {mark}
      {label}
      <span className="font-normal text-subtle-foreground tabular-nums">{count}</span>
    </h2>
  );
}

/** A group: its band, then its rows. Grouped by priority, a row dropped here takes the group's priority. */
function Group({ group, groupKey, sessions }: { group: CodeSessionGrouping; groupKey: string; sessions: CodeSession[] }) {
  const t = useT(codeSessions);
  const [over, setOver] = useState(false);
  const priority = group === "priority" ? (groupKey as CodePriority) : null;
  const drop = useDropPriority(priority);
  const mark =
    group === "state" ? (
      <CodeStateIcon state={groupKey as CodeSessionState} />
    ) : group === "priority" ? (
      <PriorityIcon priority={groupKey as CodePriority} />
    ) : (
      <BrandLogo domain="github.com" fallback={<BranchIcon className="size-3.5" />} className="size-3.5 dark:invert" />
    );
  // A project by its repository's name (« e-do-bots »), its owner on hover.
  const label = group === "state" ? t.stateGroups[groupKey as CodeSessionState] : group === "priority" ? t.priorities[groupKey as CodePriority] : (groupKey.split("/")[1] ?? groupKey) || t.board.noProject;
  return (
    <section
      aria-label={label}
      className={cn(over && "ring-2 ring-ring ring-inset")}
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
      <GroupHeader mark={mark} label={label} count={sessions.length} title={group === "project" ? groupKey : undefined} />
      <div role="list">
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
 * Figma « Sessions de code · 1440 »: one 40 px line per session: its priority (a menu, for its owner),
 * its state (unless the group says it), the title, where its work is (repository · branch, in mono),
 * the agent that started it, the engine, when. The line opens it beside its conversation.
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
  const branch = s.git?.branch ?? s.worktree?.branch;
  const open = () => {
    void navigate({ to: "/c/$conversationId/code/$sessionId", params: { conversationId: s.conversationId, sessionId: s.id } });
  };
  return (
    <div
      role="listitem"
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
      // Its columns by the row's own width (a pane beside a conversation is narrow): the title always stays.
      className="@container flex h-10 cursor-pointer items-center gap-3 border-b px-5 outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      {owner ? (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <CodePriorityMenu
            session={s}
            align="start"
            trigger={
              <Button variant="ghost" size="icon-xs" className="-mx-1" aria-label={`${t.priority} ${t.priorities[s.priority]}`}>
                <PriorityIcon priority={s.priority} />
              </Button>
            }
          />
        </span>
      ) : (
        <span className="flex size-3.5 items-center justify-center" title={t.priorities[s.priority]}>
          <PriorityIcon priority={s.priority} />
        </span>
      )}
      {grouping !== "state" && <CodeStateIcon state={state} />}
      <span className="min-w-0 flex-1 truncate text-ui">{s.title}</span>
      {/* Where it works, in words: the repository's name (its owner on hover), then its branch with its mark. */}
      <span className="hidden w-74 shrink-0 items-center gap-2.5 text-xs text-muted-foreground @4xl:flex" title={[s.repo, branch].filter(Boolean).join(" · ")}>
        {s.repo ? (
          <>
            <span className="shrink-0">{s.repo.split("/").pop()}</span>
            {branch && (
              <span className="flex min-w-0 items-center gap-1 text-subtle-foreground">
                <BranchIcon className="size-3 shrink-0" />
                <span className="truncate">{branch}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-subtle-foreground">{t.noRepo}</span>
        )}
      </span>
      <span className="hidden w-25 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @xl:flex">
        {agent && (
          <>
            <AgentAvatar agent={agent} className="size-3.5" />
            <span className="truncate">{agent.name}</span>
          </>
        )}
      </span>
      <span title={CODE_ENGINE_NAMES[s.engine]} className="flex shrink-0">
        <ModelLogo provider={s.engine} className="size-3.5" />
      </span>
      <span className="w-12 shrink-0 text-right text-xs text-subtle-foreground tabular-nums">{listTime(new Date(s.updatedAt))}</span>
    </div>
  );
}
