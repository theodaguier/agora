import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeftIcon, MoreIcon, PlusIcon, SlidersIcon } from "@/components/icons";
import { QuickAddTask } from "@/components/QuickAddTask";
import { TaskList } from "@/components/TaskList";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { defineMessages, useT } from "@/i18n";
import { useOrgTitle } from "@/lib/org";
import { tasksQuery } from "@/lib/queries";
import { useShortcut } from "@/lib/shortcuts";
import { useTabPlace } from "@/lib/workspace";

const messages = defineMessages({
  en: {
    title: "My tasks",
    back: "Back",
    newTask: "New task",
    open: (n: number) => `${n} open`,
    display: "Display",
    showDone: "Show done tasks",
    more: "More",
    noTasksTitle: "Nothing to do",
    noTasks: "Tasks assigned to you, by a colleague or an agent, show up here.",
  },
  fr: {
    title: "Mes tâches",
    back: "Retour",
    newTask: "Nouvelle tâche",
    open: (n: number) => `${n} ouverte${n > 1 ? "s" : ""}`,
    display: "Affichage",
    showDone: "Afficher les terminées",
    more: "Plus",
    noTasksTitle: "Rien à faire",
    noTasks: "Les tâches qu'un collègue ou un agent t'assigne arrivent ici.",
  },
});

const NEW_TASK = { key: "n", typing: false } as const;

/**
 * Figma « Mes tâches · 1440 »: the title and how many are open, display and more on the right; then
 * the groups (in progress, to do, done) as Linear's issues. « Nouvelle tâche » (N) opens the quick add.
 */
export function Tasks() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(true);
  useOrgTitle(t.title);
  // Tabs stay mounted behind the one in front: only the one in front listens.
  useShortcut(NEW_TASK, () => setAdding(true), useTabPlace().current);
  const { data: tasks = [] } = useQuery(tasksQuery(user.id));
  const open = tasks.filter((x) => x.status !== "done" && x.assignees.some((a) => a.id === user.id)).length;
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-11.5 shrink-0 items-center gap-2 border-b pr-3.5 pl-3 md:pl-5">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="md:hidden">
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-ui font-medium">{t.title}</h1>
        {open > 0 && <span className="text-ui text-subtle-foreground tabular-nums">{t.open(open)}</span>}
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.display} className="text-muted-foreground" />}>
            <SlidersIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuCheckboxItem checked={showDone} onCheckedChange={setShowDone}>
                {t.showDone}
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.more} className="text-muted-foreground" />}>
            <MoreIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setAdding(true)}>
                <PlusIcon /> {t.newTask}
                <DropdownMenuShortcut>N</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding && (
          <div className="border-b px-5 py-3">
            <QuickAddTask autoFocus onCancel={() => setAdding(false)} />
          </div>
        )}
        <TaskList userId={user.id} empty={t.noTasks} emptyTitle={t.noTasksTitle} table showDone={showDone} onAdd={() => setAdding(true)} />
      </div>
    </section>
  );
}
