import { conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Skeleton } from "heroui-native";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { TaskStatusIcon } from "@/components/code-session-marks";
import { EmptyState } from "@/components/empty-state";
import { headerIcon } from "@/components/header-button";
import { ListBand } from "@/components/list-band";
import { MenuButton } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { TaskTableRow } from "@/components/tasks/task-table-row";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { personMentionables, usePeople } from "@/lib/people";
import { newTaskHref, userTasksQuery, type TaskStatus } from "@/lib/tasks";

/*
 * apps/web/src/screens/Tasks.tsx + TaskList.tsx `table` (Figma « Mes tâches »): the tasks given to you
 * (the ones you gave others are theirs), in groups as Linear's issues: in progress, to do, done. Each
 * group a band (its mark, its name, its count in grey), then its 40 px lines. « Affichage » hides the
 * done ones; « + » adds a task.
 */

const messages = defineMessages({
  en: {
    newTask: "New task",
    display: "Display",
    showDone: "Show done tasks",
    noTasksTitle: "Nothing to do",
    noTasks: "Tasks assigned to you, by a colleague or an agent, show up here.",
    group: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
  },
  fr: {
    newTask: "Nouvelle tâche",
    display: "Affichage",
    showDone: "Afficher les terminées",
    noTasksTitle: "Rien à faire",
    noTasks: "Les tâches qu'un collègue ou un agent t'assigne arrivent ici.",
    group: { todo: "À faire", in_progress: "En cours", done: "Terminées" },
  },
});

const GROUPS: TaskStatus[] = ["in_progress", "todo", "done"];

export default function TasksScreen() {
  const me = useMe();
  const router = useRouter();
  const [showDone, setShowDone] = useState(true);
  const { data: tasks, isPending, refetch } = useQuery(userTasksQuery(me.id));
  const pull = usePullToRefresh(refetch);
  const people = usePeople();
  const mentionables = useMemo(() => personMentionables(people), [people]);

  // My tasks: only the ones given to me.
  const mine = (tasks ?? []).filter((x) => x.assignees.some((a) => a.id === me.id));
  const groups = GROUPS.map((status) => ({ status, items: status === "done" && !showDone ? [] : mine.filter((x) => x.status === status) })).filter((g) => g.items.length);

  return (
    <>
      <Stack.Screen.Title>{tr(conversations).tasks}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton icon="slider.horizontal.3" label={messages.display} actions={[{ label: messages.showDone, checked: showDone, onPress: () => setShowDone((v) => !v) }]} />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={messages.newTask} onPress={withTap(() => router.push(newTaskHref))} />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="bg-background"
        contentContainerClassName="pb-10"
        refreshControl={<RefreshControl {...pull} />}
      >
        {isPending ? (
          <View className="gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </View>
        ) : !groups.length ? (
          <EmptyState mascot="green" title={messages.noTasksTitle} description={messages.noTasks} />
        ) : (
          groups.map((g) => (
            <View key={g.status} accessibilityLabel={messages.group[g.status]}>
              <ListBand mark={<TaskStatusIcon status={g.status} />} label={messages.group[g.status]} count={g.items.length} />
              {g.items.map((task) => (
                <TaskTableRow key={task.id} task={task} me={me.id} mentionables={mentionables} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
