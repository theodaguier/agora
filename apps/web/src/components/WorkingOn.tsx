import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { userProfileQuery } from "@/lib/queries";
import { statusTone } from "@/lib/task-status";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    you: (title: string) => `You're working on “${title}”`,
    them: (title: string) => `Working on “${title}”`,
    nothingYou: "Not working on anything. Start a task to show it here.",
    stop: "Stop",
  },
  fr: {
    you: (title: string) => `Tu travailles sur « ${title} »`,
    them: (title: string) => `Travaille sur « ${title} »`,
    nothingYou: "Tu ne travailles sur rien. Passe une tâche en cours pour l'afficher ici.",
    stop: "Arrêter",
  },
});

/** Sets the task you are working on (null: nothing). */
export const useWorkingOn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string | null) => api("/tasks/current", { method: "PUT", body: JSON.stringify({ taskId }) }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ["tasks"] }), qc.invalidateQueries({ queryKey: ["user"] })]),
  });
};

/** Title of the task someone is working on, for a discreet status line (null: nothing, or not a person). */
export function useCurrentTaskTitle(userId: string | null) {
  const { data } = useQuery({ ...userProfileQuery(userId ?? ""), enabled: !!userId });
  return userId ? (data?.currentTask?.title ?? null) : null;
}

/** Status shown on a profile: the task someone is working on right now. */
export function WorkingOn({ userId, className }: { userId: string; className?: string }) {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const { data } = useQuery(userProfileQuery(userId));
  const set = useWorkingOn();
  const self = userId === user.id;
  const current = data?.currentTask;
  if (!data || (!current && !self)) return null;
  if (!current) return <p className={cn("text-[13px] text-muted-foreground", className)}>{t.nothingYou}</p>;
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]", statusTone.in_progress, className)}>
      <span className="min-w-0 flex-1 truncate font-medium">{self ? t.you(current.title) : t.them(current.title)}</span>
      {self && (
        <Button variant="ghost" size="xs" className="-my-1 text-current hover:bg-transparent hover:underline" disabled={set.isPending} onClick={() => set.mutate(null)}>
          {t.stop}
        </Button>
      )}
    </div>
  );
}
