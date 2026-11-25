import type { RoutineRunRef } from "@agora/core";
import { simple } from "@agora/core/i18n";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { ClockIcon } from "@/components/icons";
import { ListCard, ListCardRows } from "@/components/list-card";
import { RoutineItem } from "@/components/RightPanel";
import { TaskRow } from "@/components/TaskList";
import { useT } from "@/i18n";
import { dividerLabel } from "@/lib/dates";
import { routinesQuery, taskQuery, type Routine } from "@/lib/queries";

/*
 * Figma « Mode simple », 4 to 7: what the bot shows under its reply, in any interface. Tasks and routines
 * are the app's own rows (the tasks page's, the side panel's), in a card; a routine's result opens on the
 * routine it comes from. apps/mobile/src/components/simple/cards.tsx is the phone's twin.
 */

/** The tasks a ```task-list``` block names. */
export function TaskCard({ ids }: { ids: string[] }) {
  const { user } = useRouteContext({ from: "/app" });
  const tasks = useQueries({ queries: ids.map((id) => taskQuery(id)) })
    .map((q) => q.data)
    .filter((t) => !!t);
  if (!tasks.length) return null;
  return (
    <ListCard size="sm" className="mt-2 max-w-md">
      <ListCardRows>
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} owner={user.id} />
        ))}
      </ListCardRows>
    </ListCard>
  );
}

/** Routines of this conversation: one the bot just created, or those a ```routine-list``` block names. */
export function RoutineCard({ conversationId, ids, onMention }: { conversationId: string; ids: string[]; onMention: (routine: Routine) => void }) {
  const { data = [] } = useQuery(routinesQuery(conversationId));
  const shown = ids.map((id) => data.find((r) => r.id === id)).filter((r) => !!r);
  if (!shown.length) return null;
  return (
    <ListCard size="sm" className="mt-2 max-w-md">
      <ListCardRows>
        {shown.map((r) => (
          <RoutineItem key={r.id} conversationId={conversationId} routine={r} onMention={() => onMention(r)} />
        ))}
      </ListCardRows>
    </ListCard>
  );
}

/** The grey line above a routine's result: « Routine « Planning de la semaine », lundi 09:00 ». */
export function RoutineLine({ routine }: { routine: RoutineRunRef }) {
  const t = useT(simple);
  const at = new Date(routine.at);
  return (
    <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <ClockIcon className="size-3.5" />
      <span className="truncate">{t.routineFrom(routine.name, dividerLabel(at).replace(/^\p{Lu}/u, (c) => c.toLowerCase()))}</span>
    </p>
  );
}
