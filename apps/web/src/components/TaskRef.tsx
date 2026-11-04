import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircleIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { defineMessages, useT } from "@/i18n";
import type { TaskStatus } from "@/lib/api";
import { formatDueDate, isOverdue } from "@/lib/dates";
import { taskQuery } from "@/lib/queries";
import { priorityMessages } from "@/lib/task-status";
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

const pill = "rounded-sm px-1 font-medium box-decoration-clone";

/** The inline reference takes the brand colour while the task is in progress, muted otherwise. */
const refTone: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-brand/10 text-brand",
  done: "bg-muted text-muted-foreground",
};

const statusVariant = { todo: "secondary", in_progress: "default", done: "outline" } as const;
const priorityVariant = { urgent: "destructive", high: "secondary", normal: "secondary", low: "outline" } as const;

/** A task cited in a message: its title with a status-colored check; hovering shows the task. */
export function TaskRef({ taskId }: { taskId: string }) {
  const t = useT(messages);
  const p = useT(priorityMessages);
  const navigate = useNavigate();
  const { data: task, isPending } = useQuery(taskQuery(taskId));
  if (isPending) return <Skeleton className="inline-block h-4 w-24 align-middle" />;
  if (!task) return <Badge variant="secondary">{t.missing}</Badge>;
  const done = task.status === "done";
  return (
    <HoverCard>
      <HoverCardTrigger delay={300} render={<span className={cn(pill, "cursor-default", refTone[task.status])} />}>
        <CheckCircleIcon className="mr-1 inline-block size-4 align-text-bottom" />
        <span className={cn(done && "line-through")}>{task.title}</span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex w-80 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{task.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant[task.status]}>
              {t.status[task.status]}
            </Badge>
            {task.priority !== "normal" && !done && (
              <Badge variant={priorityVariant[task.priority]}>
                {p.label[task.priority]}
              </Badge>
            )}
            {task.dueOn && (
              <span className={cn("text-xs text-muted-foreground", !done && isOverdue(task.dueOn) && "text-destructive")}>
                {t.due(formatDueDate(task.dueOn))}
              </span>
            )}
          </div>
        </div>
        {task.description && <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{task.description}</p>}
        {task.assignees.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {task.assignees.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-xs">
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
