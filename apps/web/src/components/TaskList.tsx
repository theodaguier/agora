import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CheckCircleIcon, ChevronDownIcon, CircleIcon, LoaderIcon, MoreIcon, PencilIcon, PlusIcon, StopIcon, TaskListIcon, TrashIcon, UserIcon, WarningIcon } from "@/components/icons";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PriorityIcon, TaskStatusIcon } from "@/components/Marks";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, type ReactNode } from "react";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { TaskDialog } from "@/components/TaskDialog";
import { useWorkingOn } from "@/components/WorkingOn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyFigure } from "@/components/EmptyFigure";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { CardAction, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AgentSummary, type Task, type TaskPriority, type TaskStatus } from "@/lib/api";
import { dueLabel, formatDueDate, isOverdue } from "@/lib/dates";
import { agentTasksQuery, tasksQuery } from "@/lib/queries";
import { MentionText } from "@/lib/mentions";
import { useMentionables, usePeople } from "@/lib/people";
import { CodePriorityIcon } from "@/components/CodeSessionMarks";
import { priorityMessages, TASK_PRIORITIES, TASK_STATUSES, taskPriorityMark } from "@/lib/task-status";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    deleteTitle: (title: string) => `Delete "${title}"?`,
    deleteBody: "The task will be removed for everyone working on it.",
    done: "Done",
    group: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    working: (names: string) => `${names} working on it`,
    all: "All",
    statusTab: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    noneWithStatus: "No tasks with this status.",
    status: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    due: (date: string) => `Due ${date}`,
    by: (name: string) => `From ${name}`,
    byFor: (bot: string, name: string) => `From ${bot}, for ${name}`,
    actions: "Task actions",
    start: "Mark in progress",
    reopen: "Move back to to-do",
    complete: "Mark as done",
    edit: "Edit",
    failed: "Couldn't update the task.",
    participants: (names: string) => `Working on it: ${names}`,
    workOn: "I'm working on it",
    stopWorking: "I'm no longer working on it",
    editParticipants: (names: string) => `Working on it: ${names}. Change`,
    searchPeople: "Search a colleague…",
    noMatch: "No one matches.",
    errorTitle: "Tasks unavailable",
    error: "Tasks can't be reached right now.",
    columns: { task: "Task", who: "Who", due: "Due" },
    add: (group: string) => `Add a task (${group})`,
  },
  fr: {
    deleteTitle: (title: string) => `Supprimer « ${title} » ?`,
    deleteBody: "La tâche disparaîtra pour toutes les personnes qui y travaillent.",
    done: "Terminées",
    group: { todo: "À faire", in_progress: "En cours", done: "Terminées" },
    working: (names: string) => `${names} y travaille`,
    all: "Toutes",
    statusTab: { todo: "À faire", in_progress: "En cours", done: "Terminées" },
    noneWithStatus: "Aucune tâche avec ce statut.",
    status: { todo: "À faire", in_progress: "En cours", done: "Terminée" },
    due: (date: string) => `Échéance ${date}`,
    by: (name: string) => `De ${name}`,
    byFor: (bot: string, name: string) => `De ${bot}, pour ${name}`,
    actions: "Actions de la tâche",
    start: "Marquer en cours",
    reopen: "Remettre à faire",
    complete: "Marquer comme terminée",
    edit: "Modifier",
    failed: "Modification impossible.",
    participants: (names: string) => `Sur la tâche : ${names}`,
    workOn: "Je travaille dessus",
    stopWorking: "Je ne travaille plus dessus",
    editParticipants: (names: string) => `Sur la tâche : ${names}. Modifier`,
    searchPeople: "Chercher un collègue…",
    noMatch: "Personne ne correspond.",
    errorTitle: "Tâches indisponibles",
    error: "Les tâches sont injoignables pour le moment.",
    columns: { task: "Tâche", who: "Qui", due: "Échéance" },
    add: (group: string) => `Ajouter une tâche (${group})`,
  },
});

type Filter = "all" | TaskStatus;

/**
 * Tasks assigned to someone (`userId`) or created by a bot (`agentId`), filtered
 * by status in tabs; "all" = open ones first, then the done ones.
 */
export function TaskList({
  userId,
  agentId,
  empty,
  emptyTitle,
  table,
  showDone = true,
  onAdd,
}: ({ userId: string; agentId?: never } | { agentId: string; userId?: never }) & {
  empty: string;
  emptyTitle?: string;
  /** Figma « Mes tâches · 1440 »: the tasks given to `userId`, in groups of rows, as Linear's issues. */
  table?: boolean;
  /** Table: the done group shown. */
  showDone?: boolean;
  /** Table: the « + » of a group. */
  onAdd?: () => void;
}) {
  const t = useT(messages);
  const p = useT(priorityMessages);
  const [filter, setFilter] = useState<Filter>("all");
  const c = useT(common);
  const { data: tasks, isPending, isError, error, refetch } = useQuery(agentId ? agentTasksQuery(agentId) : tasksQuery(userId!));
  if (isPending)
    return (
      <div className="flex flex-col gap-3 py-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  if (isError)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WarningIcon />
          </EmptyMedia>
          <EmptyTitle>{t.errorTitle}</EmptyTitle>
          <EmptyDescription title={error.message}>{t.error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" onClick={() => void refetch()}>
            {c.retry}
          </Button>
        </EmptyContent>
      </Empty>
    );
  // My tasks: only the ones given to me (the ones I gave others are theirs).
  const all = (tasks ?? []).filter((x) => !table || !userId || x.assignees.some((a) => a.id === userId));
  // A page (its title): the full empty state. A section of a profile: one grey line, as its neighbours.
  if (!all.length)
    return emptyTitle ? (
      <Empty>
        <EmptyHeader>
          <EmptyFigure mascot="green" />
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((x) => x.status === f).length);
  const open = all.filter((x) => x.status !== "done");
  const done = all.filter((x) => x.status === "done");
  const shown = filter === "all" ? [] : all.filter((x) => x.status === filter);

  const inProgress = open.filter((x) => x.status === "in_progress");
  const todo = open.filter((x) => x.status === "todo");
  if (table)
    return (
      <div className="flex flex-col">
        {(
          [
            ["in_progress", inProgress],
            ["todo", todo],
            ["done", showDone ? done : []],
          ] as const
        ).map(
          ([status, items]) =>
            items.length > 0 && (
              <section key={status} aria-label={t.group[status]}>
                <h2 className="group/head flex h-9 items-center gap-2 border-b bg-card pr-2 pl-5 text-ui font-medium">
                  <TaskStatusIcon status={status} />
                  {t.group[status]}
                  <span className="font-normal text-subtle-foreground tabular-nums">{items.length}</span>
                  <span className="flex-1" />
                  {onAdd && (
                    <Button variant="ghost" size="icon-xs" aria-label={t.add(t.group[status])} onClick={onAdd} className="text-subtle-foreground opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100">
                      <PlusIcon />
                    </Button>
                  )}
                </h2>
                <div role="list">
                  {items.map((task) => (
                    <TaskTableRow key={task.id} task={task} />
                  ))}
                </div>
              </section>
            ),
        )}
      </div>
    );
  const rows = (items: Task[]) =>
    table ? (
      <div role="list" className="flex flex-col">
        {items.map((task) => (
          <TaskRow key={task.id} task={task} owner={userId ?? null} table />
        ))}
      </div>
    ) : (
      <ListCardRows>
        {items.map((task) => (
          <TaskRow key={task.id} task={task} owner={userId ?? null} />
        ))}
      </ListCardRows>
    );
  // A group without a title of its own: a card of rows (the table has no frames).
  const card = (items: Task[]) => (table ? rows(items) : <ListCard size="sm">{rows(items)}</ListCard>);
  const group = (status: TaskStatus, items: Task[]) =>
    table ? (
      <section aria-label={t.group[status]} className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 px-3 text-sm font-medium">
          <TaskStatusMark status={status} />
          {t.group[status]}
          <span className="font-normal text-muted-foreground tabular-nums">{items.length}</span>
        </h2>
        {rows(items)}
      </section>
    ) : (
      <TaskGroup title={t.group[status]} count={items.length}>
        {rows(items)}
      </TaskGroup>
    );

  return (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="gap-6">
      <TabsList>
        {(["all", ...TASK_STATUSES] as Filter[]).map((f) => (
          <TabsTrigger key={f} value={f} aria-label={`${f === "all" ? t.all : t.statusTab[f]} (${count(f)})`}>
            {f === "all" ? t.all : t.statusTab[f]}
          </TabsTrigger>
        ))}
      </TabsList>
      {/* The table's columns, over every group (from md up: smaller screens keep one line per task). */}
      {table && (
        <div aria-hidden className="hidden items-center gap-3 border-b px-3 pb-2 text-xs text-muted-foreground md:flex">
          <span className="flex-1 pl-11">{t.columns.task}</span>
          <span className="w-28">{p.priority}</span>
          <span className="w-24">{t.columns.who}</span>
          <span className="w-32">{t.columns.due}</span>
          <span className="w-7" />
        </div>
      )}
      {filter === "all" ? (
        <>
          {inProgress.length > 0 && group("in_progress", inProgress)}
          {todo.length > 0 && group("todo", todo)}
          {done.length > 0 && (
            <Collapsible className="flex flex-col gap-2">
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group/done self-start" />}>
                {t.done}
                <Badge variant="secondary" className="tabular-nums">
                  {done.length}
                </Badge>
                <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-panel-open/done:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>{card(done)}</CollapsibleContent>
            </Collapsible>
          )}
        </>
      ) : shown.length ? (
        card(shown)
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{t.noneWithStatus}</p>
      )}
    </Tabs>
  );
}

/** A task's state as a mark: an empty ring, a turning one in progress, a check once done. */
function TaskStatusMark({ status, className }: { status: TaskStatus; className?: string }) {
  const Mark = status === "done" ? CheckCircleIcon : status === "in_progress" ? LoaderIcon : CircleIcon;
  return <Mark className={cn("size-4 shrink-0", status === "in_progress" ? "animate-spin text-brand" : status === "done" ? "text-success" : "text-muted-foreground", className)} />;
}

/** A group: a card with its title and count, then its rows. */
function TaskGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <ListCard size="sm">
      <ListCardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Badge variant="secondary" className="tabular-nums">
            {count}
          </Badge>
        </CardAction>
      </ListCardHeader>
      {children}
    </ListCard>
  );
}

/** Priority badge: urgent in red, the others neutral ("normal" shows none). */
const priorityBadge: Record<Exclude<TaskPriority, "normal">, "destructive" | "secondary" | "outline"> = {
  urgent: "destructive",
  high: "secondary",
  low: "outline",
};

/** `owner`: whose list it is (their own face is not repeated on each row). */
function TaskRow({ task, owner, table }: { task: Task; owner: string | null; table?: boolean }) {
  const { user } = useRouteContext({ from: "/app" });
  const work = useWorkingOn();
  const mine = task.assignees.find((a) => a.id === user.id);
  const mentions = useMentionables(noBots);
  const qc = useQueryClient();
  const t = useT(messages);
  const p = useT(priorityMessages);
  const c = useT(common);
  const [editing, setEditing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const setStatus = useMutation({
    mutationFn: (status: TaskStatus) => api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSettled: refresh,
    meta: { error: t.failed },
  });
  const setPriority = useMutation({
    mutationFn: (priority: TaskPriority) => api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ priority }) }),
    onSettled: refresh,
    meta: { error: t.failed },
  });
  const remove = useMutation({ mutationFn: () => api(`/tasks/${task.id}`, { method: "DELETE" }), onSettled: refresh, meta: { success: c.deleted } });

  const done = task.status === "done";
  const from = task.assignedBy
    ? task.assignedBy.kind === "agent" && task.requestedBy
      ? t.byFor(task.assignedBy.name, task.requestedBy.name)
      : t.by(task.assignedBy.name)
    : null;

  const overdue = !done && isOverdue(task.dueOn);
  const workingNow = task.assignees.filter((a) => a.current && a.id !== owner);
  const StatusIcon = done ? CheckCircleIcon : task.status === "in_progress" ? LoaderIcon : CircleIcon;

  return (
    <Item size="sm" role="listitem" className={cn("flex-nowrap", table && "rounded-lg hover:bg-muted/50", table && done && "opacity-60")}>
      <ItemMedia>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!task.canEdit || setStatus.isPending}
          onClick={() => setStatus.mutate(done ? "todo" : "done")}
          aria-label={done ? t.reopen : t.complete}
          aria-pressed={done}
        >
          <StatusIcon className={cn(task.status === "in_progress" ? "animate-spin text-brand" : "text-muted-foreground")} />
        </Button>
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <span className={cn(done && "text-muted-foreground")}>
            <MentionText text={task.title} mentionables={mentions} />
          </span>
          {task.priority !== "normal" && !done && <Badge variant={priorityBadge[task.priority]} className={cn(table && "md:hidden")}>{p.label[task.priority]}</Badge>}
        </ItemTitle>
        {task.description && (
          <ItemDescription className={table ? "line-clamp-1" : "whitespace-pre-line"}>
            <MentionText text={task.description} mentionables={mentions} />
          </ItemDescription>
        )}
        {(from || task.dueOn) && (
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {from && <span className="truncate">{from}</span>}
            {task.dueOn && <span className={cn("shrink-0", overdue && "text-destructive", table && "md:hidden")}>{t.due(formatDueDate(task.dueOn))}</span>}
          </p>
        )}
      </ItemContent>
      {/* The table's cells: priority, who, due date (its state is the mark at the start of the row). */}
      {table && (
        <>
          <span className="hidden w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground md:flex">
            <CodePriorityIcon priority={taskPriorityMark[task.priority]} />
            {task.priority !== "normal" && p.label[task.priority]}
          </span>
          <span className="hidden w-24 shrink-0 md:flex">
            <Participants task={task} />
          </span>
          <span className={cn("hidden w-32 shrink-0 text-sm md:block", overdue ? "text-destructive" : "text-muted-foreground")}>{task.dueOn ? formatDueDate(task.dueOn) : ""}</span>
        </>
      )}
      {workingNow.length > 0 && !done && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{t.working(workingNow.map((a) => a.name).join(", "))}</span>
      )}
      <ItemActions className="gap-1">
        {/* On your own list, your face on every row says nothing: only shared tasks show who's on them. */}
        {!table && !(task.assignees.length === 1 && task.assignees[0]!.id === owner) && <Participants task={task} />}
        {(task.canEdit || task.canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t.actions} />}>
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {task.canEdit && (
                <DropdownMenuGroup>
                  {task.status !== "in_progress" && !done && (
                    <DropdownMenuItem onClick={() => setStatus.mutate("in_progress")}>
                      <LoaderIcon />
                      {t.start}
                    </DropdownMenuItem>
                  )}
                  {task.status !== "todo" && (
                    <DropdownMenuItem onClick={() => setStatus.mutate("todo")}>
                      <CircleIcon />
                      {t.reopen}
                    </DropdownMenuItem>
                  )}
                  {!done && (
                    <DropdownMenuItem onClick={() => setStatus.mutate("done")}>
                      <CheckCircleIcon />
                      {t.complete}
                    </DropdownMenuItem>
                  )}
                  {mine && !done && !mine.current && (
                    <DropdownMenuItem onClick={() => work.mutate(task.id)}>
                      <UserIcon />
                      {t.workOn}
                    </DropdownMenuItem>
                  )}
                  {mine?.current && (
                    <DropdownMenuItem onClick={() => work.mutate(null)}>
                      <StopIcon />
                      {t.stopWorking}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <CodePriorityIcon priority={taskPriorityMark[task.priority]} />
                      {p.priority}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value={task.priority} onValueChange={(v) => setPriority.mutate(v as TaskPriority)}>
                        {TASK_PRIORITIES.map((level) => (
                          <DropdownMenuRadioItem key={level} value={level}>
                            <CodePriorityIcon priority={taskPriorityMark[level]} />
                            {p.label[level]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
              )}
              {task.canDelete && (
                <>
                  {task.canEdit && <DropdownMenuSeparator />}
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <PencilIcon />
                      {t.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () =>
                        (await confirmAction({ title: t.deleteTitle(task.title), description: t.deleteBody, action: c.delete })) && remove.mutate()
                      }
                    >
                      <TrashIcon />
                      {c.delete}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {task.canDelete && <TaskDialog open={editing} onOpenChange={setEditing} task={task} />}
      </ItemActions>
    </Item>
  );
}

/**
 * Figma « Mes tâches · 1440 »: one 40 px line per task: its priority (a menu), its state (a click
 * closes or reopens it), the title, the agent it came from, who is on it, when it is due. The other
 * actions on a right click, as in Linear.
 */
function TaskTableRow({ task }: { task: Task }) {
  const { user } = useRouteContext({ from: "/app" });
  const work = useWorkingOn();
  const mine = task.assignees.find((a) => a.id === user.id);
  const mentions = useMentionables(noBots);
  const qc = useQueryClient();
  const t = useT(messages);
  const p = useT(priorityMessages);
  const c = useT(common);
  const [editing, setEditing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const patch = useMutation({
    mutationFn: (body: Partial<Pick<Task, "status" | "priority">>) => api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSettled: refresh,
    meta: { error: t.failed },
  });
  const remove = useMutation({ mutationFn: () => api(`/tasks/${task.id}`, { method: "DELETE" }), onSettled: refresh, meta: { success: c.deleted } });
  const done = task.status === "done";
  const overdue = !done && isOverdue(task.dueOn);
  const agent = task.assignedBy?.kind === "agent" ? task.assignedBy : null;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<div role="listitem" className="flex h-10 items-center gap-3 border-b px-5 hover:bg-muted/40" />}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={!task.canEdit}
            render={<Button variant="ghost" size="icon-xs" aria-label={`${p.priority} : ${p.label[task.priority]}`} className="-mx-1" />}
          >
            <PriorityIcon priority={task.priority} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup value={task.priority} onValueChange={(v) => patch.mutate({ priority: v as TaskPriority })}>
              {TASK_PRIORITIES.map((level) => (
                <DropdownMenuRadioItem key={level} value={level}>
                  <PriorityIcon priority={level} />
                  {p.label[level]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          className="-mx-1"
          disabled={!task.canEdit || patch.isPending}
          onClick={() => patch.mutate({ status: done ? "todo" : "done" })}
          aria-label={done ? t.reopen : t.complete}
          aria-pressed={done}
        >
          <TaskStatusIcon status={task.status} />
        </Button>
        <button
          type="button"
          disabled={!task.canDelete}
          onClick={() => setEditing(true)}
          className={cn("min-w-0 flex-1 truncate text-left text-ui outline-none disabled:cursor-default", done && "text-muted-foreground")}
        >
          <MentionText text={task.title} mentionables={mentions} />
        </button>
        <span className="hidden w-27.5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
          {agent && (
            <>
              <AgentAvatar agent={agent} className="size-3.5" />
              <span className="truncate">{agent.name}</span>
            </>
          )}
        </span>
        <span className="hidden w-12 shrink-0 justify-end md:flex">
          <Participants task={task} small />
        </span>
        <span className={cn("w-18 shrink-0 truncate text-right text-xs", overdue ? "text-destructive" : done ? "text-subtle-foreground" : "text-muted-foreground")}>
          {task.dueOn ? dueLabel(task.dueOn) : ""}
        </span>
        {task.canDelete && <TaskDialog open={editing} onOpenChange={setEditing} task={task} />}
      </ContextMenuTrigger>
      {(task.canEdit || task.canDelete) && (
        <ContextMenuContent className="w-52">
          {task.canEdit && (
            <ContextMenuGroup>
              {task.status !== "in_progress" && !done && (
                <ContextMenuItem onClick={() => patch.mutate({ status: "in_progress" })}>
                  <LoaderIcon />
                  {t.start}
                </ContextMenuItem>
              )}
              {task.status !== "todo" && (
                <ContextMenuItem onClick={() => patch.mutate({ status: "todo" })}>
                  <CircleIcon />
                  {t.reopen}
                </ContextMenuItem>
              )}
              {!done && (
                <ContextMenuItem onClick={() => patch.mutate({ status: "done" })}>
                  <CheckCircleIcon />
                  {t.complete}
                </ContextMenuItem>
              )}
              {mine && !done && !mine.current && (
                <ContextMenuItem onClick={() => work.mutate(task.id)}>
                  <UserIcon />
                  {t.workOn}
                </ContextMenuItem>
              )}
              {mine?.current && (
                <ContextMenuItem onClick={() => work.mutate(null)}>
                  <StopIcon />
                  {t.stopWorking}
                </ContextMenuItem>
              )}
            </ContextMenuGroup>
          )}
          {task.canDelete && (
            <>
              {task.canEdit && <ContextMenuSeparator />}
              <ContextMenuGroup>
                <ContextMenuItem onClick={() => setEditing(true)}>
                  <PencilIcon />
                  {t.edit}
                </ContextMenuItem>
                <ContextMenuItem
                  variant="destructive"
                  onClick={async () => (await confirmAction({ title: t.deleteTitle(task.title), description: t.deleteBody, action: c.delete })) && remove.mutate()}
                >
                  <TrashIcon />
                  {c.delete}
                </ContextMenuItem>
              </ContextMenuGroup>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

const noBots: AgentSummary[] = [];

const FACES = 3;

/**
 * Who works on the task, as overlapping faces. Anyone who can edit it opens the
 * list and checks or unchecks people; there is always at least one.
 */
function Participants({ task, small }: { task: Task; small?: boolean }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const people = usePeople();
  const [open, setOpen] = useState(false);
  const ids = task.assignees.map((a) => a.id);
  const assigned = new Set(ids);
  const save = useMutation({
    mutationFn: (assigneeIds: string[]) => api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ assigneeIds }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    meta: { error: t.failed },
  });
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length) save.mutate(next);
  };
  const names = task.assignees.map((a) => a.name).join(", ");
  const faces = (
    <span className="flex items-center">
      {task.assignees.slice(0, FACES).map((a, i) => (
        <span key={a.id} className={cn("relative flex", i > 0 && (small ? "-ml-1" : "-ml-2"))} style={{ zIndex: FACES - i }}>
          <PersonAvatar person={a} className={small ? "size-4.5 ring-2 ring-background" : "size-6 ring-2 ring-background"} />
        </span>
      ))}
      {task.assignees.length > FACES && <span className="pl-1 text-xs tabular-nums text-muted-foreground">+{task.assignees.length - FACES}</span>}
    </span>
  );
  if (!task.canEdit)
    return (
      <span className="flex items-center px-1" title={names} aria-label={t.participants(names)}>
        {faces}
      </span>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size={small ? "xs" : "sm"} className={small ? "-mr-1.5 px-1" : undefined} aria-label={t.editParticipants(names)} />}>
        {faces}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        {/* Filter on the name and handle only: the value holds the id. */}
        <Command filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}>
          <CommandInput placeholder={t.searchPeople} />
          <CommandList>
            <CommandEmpty>{t.noMatch}</CommandEmpty>
            {people.map((p) => {
              const checked = assigned.has(p.id);
              return (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  keywords={[p.name, p.handle]}
                  onSelect={() => toggle(p.id)}
                  disabled={save.isPending || (checked && ids.length === 1)}
                >
                  <PersonAvatar person={p} className="size-5" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
