import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { QuickAddTask } from "@/components/QuickAddTask";
import { ShortcutTooltip } from "@/components/Shortcuts";
import { TaskList } from "@/components/TaskList";
import { Button } from "@/components/ui/button";
import { defineMessages, useT } from "@/i18n";
import { isOverdue } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { tasksQuery } from "@/lib/queries";
import { useShortcut } from "@/lib/shortcuts";
import { useTabPlace } from "@/lib/workspace";

const messages = defineMessages({
  en: {
    title: "My tasks",
    back: "Back",
    newTask: "New task",
    doneThisWeek: (n: number) => `${n} done this week`,
    overdue: (n: number) => `${n} overdue`,
    noTasksTitle: "Nothing to do",
    noTasks: "Tasks assigned to you, by a colleague or an agent, show up here.",
  },
  fr: {
    title: "Mes tâches",
    back: "Retour",
    newTask: "Nouvelle tâche",
    doneThisWeek: (n: number) => `${n} terminée${n > 1 ? "s" : ""} cette semaine`,
    overdue: (n: number) => `${n} en retard`,
    noTasksTitle: "Rien à faire",
    noTasks: "Les tâches qu'un collègue ou un agent t'assigne arrivent ici.",
  },
});

const NEW_TASK = { key: "n", typing: false } as const;
const WEEK = 7 * 86_400_000;

/** Figma « Mes tâches »: the title and what's new this week, « Nouvelle tâche » (N) opens the quick add, then the groups. */
export function Tasks() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const [adding, setAdding] = useState(false);
  useOrgTitle(t.title);
  // Tabs stay mounted behind the one in front: only the one in front listens.
  useShortcut(NEW_TASK, () => setAdding(true), useTabPlace().current);
  const { data: tasks = [] } = useQuery(tasksQuery(user.id));
  const doneThisWeek = tasks.filter((x) => x.status === "done" && x.completedAt && Date.now() - new Date(x.completedAt).getTime() < WEEK).length;
  const overdue = tasks.filter((x) => x.status !== "done" && isOverdue(x.dueOn)).length;
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[712px] flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link to="/" aria-label={t.back} />}
            className="-ml-2 mb-2 hover:bg-transparent md:hidden"
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          {/* Figma « Titre »: Titre/Panneau, the week in grey under it, the action on the right. */}
          <header className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl leading-[26px] font-medium">{t.title}</h1>
              {(doneThisWeek > 0 || overdue > 0) && (
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
                  {doneThisWeek > 0 && t.doneThisWeek(doneThisWeek)}
                  {doneThisWeek > 0 && overdue > 0 && " · "}
                  {overdue > 0 && <span className="text-destructive">{t.overdue(overdue)}</span>}
                </p>
              )}
            </div>
            <ShortcutTooltip label={t.newTask} shortcut={NEW_TASK}>
              <Button onClick={() => setAdding(true)}>
                {t.newTask}
              </Button>
            </ShortcutTooltip>
          </header>
          {adding && (
            <div className="mt-4">
              <QuickAddTask autoFocus onCancel={() => setAdding(false)} />
            </div>
          )}
          <div className="mt-5">
            <TaskList userId={user.id} empty={t.noTasks} emptyTitle={t.noTasksTitle} />
          </div>
        </div>
      </div>
    </section>
  );
}
