import type { TaskPriority, TaskStatus } from "./api";
import { defineMessages } from "@/i18n";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

/** A status is said in words, in neutral grey: colour is kept for meaning (live work in blue). */
export const statusTone: Record<TaskStatus, string> = {
  todo: "bg-black/5 text-muted-foreground dark:bg-white/8",
  in_progress: "bg-brand/10 text-brand",
  done: "bg-black/5 text-muted-foreground dark:bg-white/8",
};

/** Text color alone (counters). */
export const statusText: Record<TaskStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-muted-foreground",
};

/** Most pressing first. */
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

/** Badge per priority; "normal" shows none. */
export const priorityTone: Record<TaskPriority, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-black/5 text-foreground dark:bg-white/8",
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
