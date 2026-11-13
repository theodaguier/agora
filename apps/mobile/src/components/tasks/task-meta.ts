import { defineMessages } from "@/lib/i18n";
import type { Task } from "@/lib/tasks";

export const rowMessages = defineMessages({
  en: {
    deleteTitle: (title: string) => `Delete "${title}"?`,
    deleteBody: "The task will be removed for everyone working on it.",
    by: (name: string) => `From ${name}`,
    byFor: (bot: string, name: string) => `From ${bot}, for ${name}`,
    start: "Mark in progress",
    reopen: "Move back to to-do",
    complete: "Mark as done",
    failed: "Couldn't update the task.",
    workOn: "I'm working on it",
    stopWorking: "I'm no longer working on it",
  },
  fr: {
    deleteTitle: (title: string) => `Supprimer « ${title} » ?`,
    deleteBody: "La tâche disparaîtra pour toutes les personnes qui y travaillent.",
    by: (name: string) => `De ${name}`,
    byFor: (bot: string, name: string) => `De ${bot}, pour ${name}`,
    start: "Marquer en cours",
    reopen: "Remettre à faire",
    complete: "Marquer comme terminée",
    failed: "Modification impossible.",
    workOn: "Je travaille dessus",
    stopWorking: "Je ne travaille plus dessus",
  },
});

/** "From Léa" (or "From Max, for Léa" for a bot's task): who gave it. Its due date has its own row. */
export function taskFrom(task: Task) {
  const t = rowMessages;
  if (!task.assignedBy) return null;
  return task.assignedBy.kind === "agent" && task.requestedBy ? t.byFor(task.assignedBy.name, task.requestedBy.name) : t.by(task.assignedBy.name);
}
