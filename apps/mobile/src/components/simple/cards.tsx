import type { RoutineRunRef } from "@agora/core";
import { simple } from "@agora/core/i18n";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ListGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { RoutineRow } from "@/components/agents/routine-row";
import { ClockIcon } from "@/components/icons";
import { useMe } from "@/components/server-scope";
import { TaskTableRow } from "@/components/tasks/task-table-row";
import { clockTime, dayLabel } from "@/lib/dates";
import { tr } from "@/lib/i18n";
import { useMentionables } from "@/lib/people";
import { routinesQuery } from "@/lib/queries";
import { taskQuery } from "@/lib/tasks";

/*
 * Figma « Mode simple », 4 to 7: what the bot shows under its reply, in any interface. Tasks and routines
 * are the app's own rows (the tasks tab's, the routines panel's), in a card; a routine's result opens on
 * the routine it comes from. apps/web/src/components/ChatCards.tsx is the web's twin.
 */

/** The tasks a ```task-list``` block names, each opening its sheet. */
export function TaskCard({ ids }: { ids: string[] }) {
  const me = useMe();
  const mentionables = useMentionables([]);
  const tasks = useQueries({ queries: ids.map((id) => taskQuery(id)) })
    .map((q) => q.data)
    .filter((t) => !!t);
  if (!tasks.length) return null;
  return (
    <ListGroup className="mt-2 w-full overflow-hidden">
      {tasks.map((t) => (
        <TaskTableRow key={t.id} task={t} me={me.id} mentionables={mentionables} />
      ))}
    </ListGroup>
  );
}

/** Routines of this conversation: one the bot just created, or those a ```routine-list``` block names. */
export function RoutineCard({ conversationId, agentId, ids }: { conversationId: string; agentId: string; ids: string[] }) {
  const { data = [] } = useQuery(routinesQuery(conversationId));
  const shown = ids.map((id) => data.find((r) => r.id === id)).filter((r) => !!r);
  if (!shown.length) return null;
  return (
    <ListGroup className="mt-2 w-full">
      {shown.map((r) => (
        <RoutineRow key={r.id} agentId={agentId} conversationId={conversationId} routine={r} />
      ))}
    </ListGroup>
  );
}

/** The grey line above a routine's result: « Routine « Planning de la semaine », lundi 09:00 ». */
export function RoutineLine({ routine }: { routine: RoutineRunRef }) {
  const at = new Date(routine.at);
  return (
    <View className="mb-1 flex-row items-center gap-1.5">
      <ClockIcon className="size-3.5 text-muted" />
      <Typography type="body-xs" color="muted" numberOfLines={1} className="shrink">
        {tr(simple).routineFrom(routine.name, `${dayLabel(at).toLowerCase()} ${clockTime(at)}`)}
      </Typography>
    </View>
  );
}
