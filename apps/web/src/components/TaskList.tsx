import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { CheckCircleIcon, ChevronDownIcon, CircleIcon, LoaderIcon, MoreIcon } from "@/components/icons";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { EmptyFigure } from "@/components/EmptyFigure";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AgentSummary, type Task, type TaskPriority, type TaskStatus } from "@/lib/api";
import { formatDueDate, isOverdue } from "@/lib/dates";
import { agentTasksQuery, tasksQuery } from "@/lib/queries";
import { MentionText } from "@/lib/mentions";
import { useMentionables, usePeople } from "@/lib/people";
import { priorityMessages, priorityTone, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-status";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    deleteTitle: (title: string) => `Delete "${title}"?`,
    deleteBody: "The task will be removed for everyone working on it.",
    done: (n: number) => `Done · ${n}`,
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
  },
  fr: {
    deleteTitle: (title: string) => `Supprimer « ${title} » ?`,
    deleteBody: "La tâche disparaîtra pour toutes les personnes qui y travaillent.",
    done: (n: number) => `Terminées · ${n}`,
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
  },
});

type Filter = "all" | TaskStatus;

/**
 * Tasks assigned to someone (`userId`) or created by a bot (`agentId`), filtered
 * by status in tabs; "all" = open ones first, then the done ones.
 */
export function TaskList({ userId, agentId, empty, emptyTitle }: ({ userId: string; agentId?: never } | { agentId: string; userId?: never }) & { empty: string; emptyTitle?: string }) {
  const t = useT(messages);
  const [filter, setFilter] = useState<Filter>("all");
  const { data: tasks, isPending } = useQuery(agentId ? agentTasksQuery(agentId) : tasksQuery(userId!));
  if (isPending)
    return (
      <div className="flex flex-col gap-3 py-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  const all = tasks ?? [];
  if (!all.length)
    return (
      <Empty className="py-10">
        <EmptyHeader>
          {emptyTitle && <EmptyFigure mascot="green" />}
          {emptyTitle && <EmptyTitle>{emptyTitle}</EmptyTitle>}
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((x) => x.status === f).length);
  const open = all.filter((x) => x.status !== "done");
  const done = all.filter((x) => x.status === "done");
  const shown = filter === "all" ? [] : all.filter((x) => x.status === filter);

  const inProgress = open.filter((x) => x.status === "in_progress");
  const todo = open.filter((x) => x.status === "todo");
  // Figma « Carte »: one white card with a hairline per group, its rows inside without frames of their own.
  const rows = (items: Task[]) => (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-background py-1">
      {items.map((task) => (
        <TaskRow key={task.id} task={task} owner={userId ?? null} />
      ))}
    </div>
  );

  return (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="gap-0">
      <TabsList className={filterList}>
        {(["all", ...TASK_STATUSES] as Filter[]).map((f) => (
          <TabsTrigger key={f} value={f} className={filterTrigger} aria-label={`${f === "all" ? t.all : t.statusTab[f]} (${count(f)})`}>
            {f === "all" ? t.all : t.statusTab[f]}
          </TabsTrigger>
        ))}
      </TabsList>
      {filter === "all" ? (
        <>
          {inProgress.length > 0 && <TaskGroup title={t.group.in_progress} count={inProgress.length}>{rows(inProgress)}</TaskGroup>}
          {todo.length > 0 && <TaskGroup title={t.group.todo} count={todo.length}>{rows(todo)}</TaskGroup>}
          {done.length > 0 && (
            <Collapsible className="pt-6">
              <CollapsibleTrigger className="group/done flex items-center gap-1 rounded-md pl-0.5 text-[13px] leading-[18px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30">
                {t.done(done.length)}
                <ChevronDownIcon className="size-3.5 transition-transform group-data-panel-open/done:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">{rows(done)}</CollapsibleContent>
            </Collapsible>
          )}
        </>
      ) : shown.length ? (
        <div className="pt-6">{rows(shown)}</div>
      ) : (
        <p className="px-3 py-10 text-center text-sm text-muted-foreground">{t.noneWithStatus}</p>
      )}
    </Tabs>
  );
}

/** A group: its title and count in grey above its card (Figma section titles). */
function TaskGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="pt-6">
      <h3 className="mb-2 flex items-baseline gap-1.5 pl-0.5 text-[13px] leading-[18px] text-muted-foreground">
        {title}
        <span className="text-subtle tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  );
}

/** Figma « Filtre »: grey pills, the active one in ink. Shared by the lists filtered by status (tasks, inbox). */
export const filterList = "h-auto max-w-full gap-1.5 overflow-x-auto rounded-none bg-transparent p-0 dark:bg-transparent";
export const filterTrigger =
  "h-[30px] flex-none rounded-full border-0 bg-secondary px-3 text-[13px] font-normal text-foreground hover:bg-accent data-active:text-primary-foreground group-data-[variant=default]/tabs-list:data-active:border-transparent group-data-[variant=default]/tabs-list:data-active:bg-none group-data-[variant=default]/tabs-list:data-active:bg-primary dark:group-data-[variant=default]/tabs-list:data-active:border-transparent";

/** `owner`: whose list it is (their own face is not repeated on each row). */
function TaskRow({ task, owner }: { task: Task; owner: string | null }) {
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
    <Item
      size="sm"
      // Figma « Ligne de réglage »: a row of the group's card, no frame of its own.
      className="flex-nowrap gap-3 rounded-none border-0 bg-transparent py-2.5 pr-2.5 pl-3.5 hover:bg-transparent"
    >
      <ItemMedia>
        <button
          type="button"
          disabled={!task.canEdit || setStatus.isPending}
          onClick={() => setStatus.mutate(done ? "todo" : "done")}
          aria-label={done ? t.reopen : t.complete}
          aria-pressed={done}
          className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-default"
        >
          <StatusIcon
            className={cn(
              "size-5",
              done ? "text-muted-foreground" : task.status === "in_progress" ? "animate-spin text-brand [animation-duration:2s]" : "text-subtle hover:text-muted-foreground",
            )}
          />
        </button>
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className={cn("flex-wrap text-sm leading-5 font-normal", done && "text-muted-foreground")}>
          <span>
            <MentionText text={task.title} mentionables={mentions} />
          </span>
          {task.priority !== "normal" && !done && (
            <Badge variant="secondary" className={cn("font-normal", priorityTone[task.priority])}>
              {p.label[task.priority]}
            </Badge>
          )}
        </ItemTitle>
        {task.description && (
          <ItemDescription className="line-clamp-2 text-xs leading-4 whitespace-pre-line">
            <MentionText text={task.description} mentionables={mentions} />
          </ItemDescription>
        )}
        {(from || task.dueOn) && (
          <p className="flex min-w-0 items-center gap-2.5 text-xs leading-4 text-muted-foreground">
            {from && <span className="truncate">{from}</span>}
            {task.dueOn && <span className={cn("shrink-0", overdue && "text-destructive")}>{t.due(formatDueDate(task.dueOn))}</span>}
          </p>
        )}
      </ItemContent>
      {workingNow.length > 0 && !done && (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{t.working(workingNow.map((a) => a.name).join(", "))}</span>
      )}
      <ItemActions className="gap-1">
        {/* On your own list, your face on every row says nothing: only shared tasks show who's on them. */}
        {!(task.assignees.length === 1 && task.assignees[0]!.id === owner) && <Participants task={task} />}
        {(task.canEdit || task.canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t.actions} className="size-6 text-subtle" />}>
              <MoreIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {task.canEdit && (
                <DropdownMenuGroup>
                  {task.status !== "in_progress" && !done && <DropdownMenuItem onClick={() => setStatus.mutate("in_progress")}>{t.start}</DropdownMenuItem>}
                  {task.status !== "todo" && <DropdownMenuItem onClick={() => setStatus.mutate("todo")}>{t.reopen}</DropdownMenuItem>}
                  {!done && <DropdownMenuItem onClick={() => setStatus.mutate("done")}>{t.complete}</DropdownMenuItem>}
                  {mine && !done && !mine.current && <DropdownMenuItem onClick={() => work.mutate(task.id)}>{t.workOn}</DropdownMenuItem>}
                  {mine?.current && <DropdownMenuItem onClick={() => work.mutate(null)}>{t.stopWorking}</DropdownMenuItem>}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{p.priority}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value={task.priority} onValueChange={(v) => setPriority.mutate(v as TaskPriority)}>
                        {TASK_PRIORITIES.map((level) => (
                          <DropdownMenuRadioItem key={level} value={level}>
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
                    <DropdownMenuItem onClick={() => setEditing(true)}>{t.edit}</DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={async () =>
                        (await confirmAction({ title: t.deleteTitle(task.title), description: t.deleteBody, action: c.delete })) && remove.mutate()
                      }
                    >
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

const noBots: AgentSummary[] = [];

const FACES = 3;

/**
 * Who works on the task, as overlapping faces. Anyone who can edit it opens the
 * list and checks or unchecks people; there is always at least one.
 */
function Participants({ task }: { task: Task }) {
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
    <>
      {task.assignees.slice(0, FACES).map((a, i) => (
        <PersonAvatar key={a.id} person={a} className={cn("size-6 ring-2 ring-background", i > 0 && "-ml-2")} />
      ))}
      {task.assignees.length > FACES && <span className="pl-1 text-xs tabular-nums text-muted-foreground">+{task.assignees.length - FACES}</span>}
    </>
  );
  if (!task.canEdit)
    return (
      <span className="flex items-center px-1" title={names} aria-label={t.participants(names)}>
        {faces}
      </span>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-0 rounded-full px-0.5" aria-label={t.editParticipants(names)} />}>
        {faces}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {/* Filter on the name and handle only: the value holds the id. */}
        <Command className="p-1.5" filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}>
          <CommandInput placeholder={t.searchPeople} />
          <CommandList className="max-h-72 pt-1.5">
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
                  className="h-9 gap-2.5 rounded-lg px-2.5 text-sm"
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
