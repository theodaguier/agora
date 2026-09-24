import { defineMessages } from "@/lib/i18n";
import { formatDueDate, type Task } from "@/lib/tasks";

export const rowMessages = defineMessages({
  en: {
    deleteTitle: (title: string) => `Delete "${title}"?`,
    deleteBody: "The task will be removed for everyone working on it.",
    due: (date: string) => `Due ${date}`,
    by: (name: string) => `From ${name}`,
    byFor: (bot: string, name: string) => `From ${bot}, for ${name}`,
    start: "Mark in progress",
    reopen: "Move back to to-do",
    complete: "Mark as done",
    failed: "Couldn't update the task.",
    now: "Working on it now",
    workOn: "I'm working on it",
    stopWorking: "I'm no longer working on it",
    overdue: "Overdue",
  },
  fr: {
    deleteTitle: (title: string) => `Supprimer « ${title} » ?`,
    deleteBody: "La tâche disparaîtra pour toutes les personnes qui y travaillent.",
    due: (date: string) => `Échéance ${date}`,
    by: (name: string) => `De ${name}`,
    byFor: (bot: string, name: string) => `De ${bot}, pour ${name}`,
    start: "Marquer en cours",
    reopen: "Remettre à faire",
    complete: "Marquer comme terminée",
    failed: "Modification impossible.",
    now: "En ce moment",
    workOn: "Je travaille dessus",
    stopWorking: "Je ne travaille plus dessus",
    overdue: "En retard",
  },
});

/** "From Léa · Due Sep 12" under the title. */
export function taskMeta(task: Task) {
  const t = rowMessages;
  const from = task.assignedBy
    ? task.assignedBy.kind === "agent" && task.requestedBy
      ? t.byFor(task.assignedBy.name, task.requestedBy.name)
      : t.by(task.assignedBy.name)
    : null;
  return [from, task.dueOn && t.due(formatDueDate(task.dueOn))].filter(Boolean).join(" · ");
}
