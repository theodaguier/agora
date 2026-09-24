import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircleIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { defineMessages, useT } from "@/i18n";
import type { TaskStatus } from "@/lib/api";
import { formatDueDate, isOverdue } from "@/lib/dates";
import { taskQuery } from "@/lib/queries";
import { priorityMessages, priorityTone, statusTone } from "@/lib/task-status";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    status: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    due: (date: string) => `Due ${date}`,
    open: "Open tasks",
    missing: "Task not found",
  },
  fr: {
    status: { todo: "À faire", in_progress: "En cours", done: "Terminée" },
    due: (date: string) => `Échéance ${date}`,
    open: "Ouvrir les tâches",
    missing: "Tâche introuvable",
  },
});

const pill = "rounded-[5px] px-[3px] font-medium box-decoration-clone";

/** A task cited in a message: its title with a status-colored check; hovering shows the task. */
export function TaskRef({ taskId }: { taskId: string }) {
  const t = useT(messages);
  const p = useT(priorityMessages);
  const navigate = useNavigate();
  const { data: task, isPending } = useQuery(taskQuery(taskId));
  if (isPending) return <span className={cn(pill, "inline-block h-[1.1em] w-24 animate-pulse bg-muted align-[-0.15em]")} />;
  if (!task) return <span className={cn(pill, "bg-muted text-muted-foreground")}>{t.missing}</span>;
  const done = task.status === "done";
  return (
    <HoverCard>
      <HoverCardTrigger delay={300} render={<span className={cn(pill, "cursor-default", statusTone[task.status])} />}>
        <CheckCircleIcon className="mr-[3px] inline-block size-[1.05em] align-[-0.18em]" />
        <span className={cn(done && "line-through")}>{task.title}</span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-80 flex-col gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{task.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className={cn("font-normal", statusTone[task.status])}>
              {t.status[task.status]}
            </Badge>
            {task.priority !== "normal" && !done && (
              <Badge variant="secondary" className={cn("font-normal", priorityTone[task.priority])}>
                {p.label[task.priority]}
              </Badge>
            )}
            {task.dueOn && (
              <span className={cn("text-[13px] text-muted-foreground", !done && isOverdue(task.dueOn) && "text-destructive")}>
                {t.due(formatDueDate(task.dueOn))}
              </span>
            )}
          </div>
        </div>
        {task.description && <p className="line-clamp-3 whitespace-pre-line text-[13px] text-muted-foreground">{task.description}</p>}
        {task.assignees.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {task.assignees.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-[13px]">
                <PersonAvatar person={a} className="size-4" />
                {a.name}
              </span>
            ))}
          </div>
        )}
        <Button variant="secondary" size="sm" onClick={() => navigate({ to: "/tasks" })}>
          {t.open}
        </Button>
      </HoverCardContent>
    </HoverCard>
  );
}
