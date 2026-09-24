import { defineMessages } from "./i18n";
import type { TaskPriority, TaskStatus } from "./tasks";

/* apps/web/src/lib/task-status.ts, with HeroUI chip colors instead of the web's tinted classes. */

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

/** Most pressing first. */
export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

type ChipColor = "accent" | "default" | "success" | "warning" | "danger";

/** One color per status: blue to do, amber in progress, green done. */
export const statusColor: Record<TaskStatus, ChipColor> = { todo: "accent", in_progress: "warning", done: "success" };

/** Text color alone (counters). */
export const statusText: Record<TaskStatus, string> = { todo: "text-link", in_progress: "text-warning", done: "text-success" };

/** Chip per priority; "normal" shows none. */
export const priorityColor: Record<TaskPriority, ChipColor | null> = { urgent: "danger", high: "warning", normal: null, low: "default" };

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

/** Status names, as the web's TaskList shows them on a task (singular) and on its tabs (plural). */
export const statusMessages = defineMessages({
  en: {
    status: "Status",
    label: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    tab: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
  },
  fr: {
    status: "Statut",
    label: { todo: "À faire", in_progress: "En cours", done: "Terminée" },
    tab: { todo: "À faire", in_progress: "En cours", done: "Terminées" },
  },
});
