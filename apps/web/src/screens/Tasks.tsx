import { Link, useRouteContext } from "@tanstack/react-router";
import { ChevronLeftIcon } from "@/components/icons";
import { QuickAddTask } from "@/components/QuickAddTask";
import { TaskList } from "@/components/TaskList";
import { WorkingOn } from "@/components/WorkingOn";
import { Button } from "@/components/ui/button";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    title: "My tasks",
    back: "Back",
    noTasks: "Nothing to do. Tasks assigned to you, by a colleague or an agent, show up here.",
  },
  fr: {
    title: "Mes tâches",
    back: "Retour",
    noTasks: "Rien à faire. Les tâches qu'un collègue ou un agent t'assigne arrivent ici.",
  },
});

/** Your own tasks page: quick add (@someone to assign), then what you have to do. */
export function Tasks() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border/60 px-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link to="/" aria-label={t.back} />}
          className="-ml-1 rounded-lg hover:bg-transparent md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
        <h1 className="truncate text-[15px] font-medium">{t.title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
          <WorkingOn userId={user.id} />
          <QuickAddTask />
          <TaskList userId={user.id} empty={t.noTasks} />
        </div>
      </div>
    </section>
  );
}
