import type { CodePriority } from "@agora/core";
import type { TaskPriority, TaskStatus } from "./api";
import { defineMessages } from "@/i18n";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

/** A status is said in words, in neutral grey: colour is kept for meaning (live work in blue). */
export const statusTone: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-brand/10 text-brand",
  done: "bg-muted text-muted-foreground",
};

/** Text color alone (counters). */
export const statusText: Record<TaskStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-muted-foreground",
};

/** Most pressing first. */
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

/** A task's priority drawn with the session priority marks (Linear's bars); « normal » is the middle one. */
export const taskPriorityMark: Record<TaskPriority, CodePriority> = { urgent: "urgent", high: "high", normal: "medium", low: "low" };

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
