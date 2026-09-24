import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { MoreIcon } from "@/components/icons";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
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
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AgentSummary, type Task, type TaskPriority, type TaskStatus } from "@/lib/api";
import { formatDueDate, isOverdue } from "@/lib/dates";
import { agentTasksQuery, tasksQuery } from "@/lib/queries";
import { MentionText } from "@/lib/mentions";
import { useMentionables, usePeople } from "@/lib/people";
import { priorityMessages, priorityTone, statusText, statusTone, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/task-status";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    deleteTitle: (title: string) => `Delete "${title}"?`,
    deleteBody: "The task will be removed for everyone working on it.",
    done: (n: number) => `Done · ${n}`,
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
    now: "Working on it now",
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
    now: "En ce moment",
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
export function TaskList({ userId, agentId, empty }: ({ userId: string; agentId?: never } | { agentId: string; userId?: never }) & { empty: string }) {
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
          <EmptyDescription>{empty}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((x) => x.status === f).length);
  const open = all.filter((x) => x.status !== "done");
  const done = all.filter((x) => x.status === "done");
  const shown = filter === "all" ? [] : all.filter((x) => x.status === filter);

  return (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="gap-3">
      <TabsList className="max-w-full overflow-x-auto">
        {(["all", ...TASK_STATUSES] as Filter[]).map((f) => (
          <TabsTrigger key={f} value={f} className="gap-1.5">
            {f === "all" ? t.all : t.statusTab[f]}
            <span className={cn("tabular-nums", f === "all" ? "text-muted-foreground" : statusText[f])}>{count(f)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {filter === "all" ? (
        <div className="flex flex-col gap-4">
          {open.length > 0 && (
            <ItemGroup className="gap-1">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} owner={userId ?? null} />
              ))}
            </ItemGroup>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="mb-1 px-3 text-[13px] font-medium text-muted-foreground">{t.done(done.length)}</h3>
              <ItemGroup className="gap-1">
                {done.map((task) => (
                  <TaskRow key={task.id} task={task} owner={userId ?? null} />
                ))}
              </ItemGroup>
            </section>
          )}
        </div>
      ) : shown.length ? (
        <ItemGroup className="gap-1">
          {shown.map((task) => (
            <TaskRow key={task.id} task={task} owner={userId ?? null} />
          ))}
        </ItemGroup>
      ) : (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t.noneWithStatus}</p>
      )}
    </Tabs>
  );
}

/** `owner`: whose list it is, to flag the task they're working on right now. */
function TaskRow({ task, owner }: { task: Task; owner: string | null }) {
  const { user } = useRouteContext({ from: "/app" });
  const work = useWorkingOn();
  const mine = task.assignees.find((a) => a.id === user.id);
  const now = task.assignees.some((a) => a.id === owner && a.current);
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
  });
  const setPriority = useMutation({
    mutationFn: (priority: TaskPriority) => api<Task>(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ priority }) }),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: () => api(`/tasks/${task.id}`, { method: "DELETE" }), onSettled: refresh });

  const done = task.status === "done";
  const from = task.assignedBy
    ? task.assignedBy.kind === "agent" && task.requestedBy
      ? t.byFor(task.assignedBy.name, task.requestedBy.name)
      : t.by(task.assignedBy.name)
    : null;
  const meta = [from, task.dueOn && t.due(formatDueDate(task.dueOn))].filter(Boolean).join(" · ");

  return (
    <Item size="sm" className="flex-nowrap items-start px-3 hover:bg-muted/50">
      <ItemMedia className="pt-0.5">
        <Checkbox
          checked={done}
          disabled={!task.canEdit || setStatus.isPending}
          onCheckedChange={(checked) => setStatus.mutate(checked ? "done" : "todo")}
          aria-label={done ? t.reopen : t.complete}
          className="data-checked:border-success data-checked:bg-success"
        />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className={cn("flex-wrap", done && "text-muted-foreground line-through")}>
          <span>
            <MentionText text={task.title} mentionables={mentions} />
          </span>
          <Badge variant="secondary" className={cn("font-normal", statusTone[task.status])}>
            {now ? t.now : t.status[task.status]}
          </Badge>
          {task.priority !== "normal" && !done && (
            <Badge variant="secondary" className={cn("font-normal", priorityTone[task.priority])}>
              {p.label[task.priority]}
            </Badge>
          )}
        </ItemTitle>
        {task.description && (
          <ItemDescription className="whitespace-pre-line">
            <MentionText text={task.description} mentionables={mentions} />
          </ItemDescription>
        )}
        {meta && (
          <p className={cn("flex items-center gap-1.5 text-[13px] text-subtle", !done && isOverdue(task.dueOn) && "text-destructive")}>
            {task.assignedBy?.kind === "agent" && <AgentAvatar agent={task.assignedBy} className="size-3.5" />}
            {task.assignedBy?.kind === "user" && (
              <PersonAvatar person={{ id: task.assignedBy.id, name: task.assignedBy.name, image: task.assignedBy.image }} className="size-3.5" />
            )}
            <span className="truncate">{meta}</span>
          </p>
        )}
        {(setStatus.error || setPriority.error || remove.error) && <p className="text-[13px] text-destructive">{t.failed}</p>}
      </ItemContent>
      <ItemActions className="gap-1">
        <Participants task={task} />
        {(task.canEdit || task.canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} className="text-muted-foreground" />}>
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
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-8 gap-0 rounded-full px-1.5" aria-label={t.editParticipants(names)} />}>
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
