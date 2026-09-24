import type { TaskPriority, TaskStatus } from "./api";
import { defineMessages } from "@/i18n";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

/** One color per status: blue to do, amber in progress, green done. Text + tinted background. */
export const statusTone: Record<TaskStatus, string> = {
  todo: "bg-brand/12 text-brand",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-success/15 text-success",
};

/** Text color alone (counters). */
export const statusText: Record<TaskStatus, string> = {
  todo: "text-brand",
  in_progress: "text-amber-700 dark:text-amber-300",
  done: "text-success",
};

/** Most pressing first. */
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

/** Badge per priority; "normal" shows none. */
export const priorityTone: Record<TaskPriority, string> = {
  urgent: "bg-destructive/12 text-destructive",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  normal: "",
  low: "bg-muted text-muted-foreground",
};

export const priorityMessages = defineMessages({
  en: {
    priority: "Priority",
    label: { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" } as Record<TaskPriority, string>,
  },
  fr: {
    priority: "Priorité",
    label: { urgent: "Urgente", high: "Haute", normal: "Normale", low: "Basse" },
  },
});
