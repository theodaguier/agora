import { common, conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Chip, ListGroup, Separator, Skeleton, Tabs, Typography } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useMe } from "@/components/server-scope";
import { TaskRow } from "@/components/tasks/task-row";
import { WorkingOn } from "@/components/tasks/working-on";
import { defineMessages, tr } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { usePeople, personMentionables } from "@/lib/people";
import { newTaskHref, userTasksQuery, type Task, type TaskStatus } from "@/lib/tasks";
import { statusColor, statusMessages, TASK_STATUSES } from "@/lib/task-status";
import { PlusIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { haptic, usePullToRefresh, withTap } from "@/lib/haptics";

/* apps/web/src/screens/Tasks.tsx + components/TaskList.tsx. */

const messages = defineMessages({
  en: {
    noTasks: "Nothing to do. Tasks assigned to you, by a colleague or an agent, show up here.",
    done: (n: number) => `Done · ${n}`,
    all: "All",
    noneWithStatus: "No tasks with this status.",
    noMatch: "No task matches.",
    newTask: "New task",
  },
  fr: {
    noTasks: "Rien à faire. Les tâches qu'un collègue ou un agent t'assigne arrivent ici.",
    done: (n: number) => `Terminées · ${n}`,
    all: "Toutes",
    noneWithStatus: "Aucune tâche avec ce statut.",
    noMatch: "Aucune tâche ne correspond.",
    newTask: "Nouvelle tâche",
  },
});

type Filter = "all" | TaskStatus;

/** Your tasks: what you're working on, then the list by status ("all" = open ones, then the done ones). */
export default function TasksScreen() {
  const me = useMe();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { data: tasks, isPending, refetch } = useQuery(userTasksQuery(me.id));
  const pull = usePullToRefresh(refetch);
  const people = usePeople();
  const mentionables = useMemo(() => personMentionables(people), [people]);

  const all = tasks ?? [];
  const query = q.trim().toLowerCase();
  const found = query ? all.filter((x) => x.title.toLowerCase().includes(query) || x.description.toLowerCase().includes(query)) : all;
  const count = (f: Filter) => (f === "all" ? found.length : found.filter((x) => x.status === f).length);

  return (
    <>
      <Stack.Screen.Title>{tr(conversations).tasks}</Stack.Screen.Title>
      <Stack.SearchBar placeholder={tr(common).search} onChangeText={(e) => setQ(e.nativeEvent.text)} onCancelButtonPress={() => setQ("")} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={messages.newTask} onPress={withTap(() => router.push(newTaskHref))} />
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="bg-background"
        contentContainerClassName="gap-5 pb-10 pt-2"
        refreshControl={
          <RefreshControl
            {...pull}
          />
        }
      >
        <View className="px-4">
          <WorkingOn />
        </View>
        {isPending ? (
          <View className="gap-3 px-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </View>
        ) : !all.length ? (
          <Typography color="muted" align="center" className="px-8 py-12">
            {messages.noTasks}
          </Typography>
        ) : (
          <>
            <Tabs value={filter} onValueChange={(v) => (haptic.select(), setFilter(v as Filter))} className="px-4">
              <Tabs.List>
                <Tabs.ScrollView scrollAlign="start">
                  <Tabs.Indicator />
                  {(["all", ...TASK_STATUSES] as Filter[]).map((f) => (
                    <Tabs.Trigger key={f} value={f}>
                      <Tabs.Label>{f === "all" ? messages.all : statusMessages.tab[f]}</Tabs.Label>
                      <Chip size="sm" variant="soft" color={f === "all" ? "default" : statusColor[f]}>
                        <Chip.Label className="tabular-nums">{count(f)}</Chip.Label>
                      </Chip>
                    </Tabs.Trigger>
                  ))}
                </Tabs.ScrollView>
              </Tabs.List>
            </Tabs>
            <TaskSections tasks={found} filter={filter} me={me.id} mentionables={mentionables} searching={!!query} />
          </>
        )}
      </ScrollView>
    </>
  );
}

function TaskSections({ tasks, filter, me, mentionables, searching }: { tasks: Task[]; filter: Filter; me: string; mentionables: Mentionable[]; searching: boolean }) {
  const group = (list: Task[]) => (
    <ListGroup className="mx-4 overflow-hidden">
      {list.map((task, i) => (
        <Fragment key={task.id}>
          {i > 0 && <Separator className="ml-14" />}
          <TaskRow task={task} owner={me} me={me} mentionables={mentionables} />
        </Fragment>
      ))}
    </ListGroup>
  );
  const empty = (text: string) => (
    <Typography type="body-sm" color="muted" align="center" className="px-8 py-10">
      {text}
    </Typography>
  );

  if (filter !== "all") {
    const shown = tasks.filter((x) => x.status === filter);
    return shown.length ? group(shown) : empty(searching ? messages.noMatch : messages.noneWithStatus);
  }
  const open = tasks.filter((x) => x.status !== "done");
  const done = tasks.filter((x) => x.status === "done");
  if (!open.length && !done.length) return empty(messages.noMatch);
  return (
    <View className="gap-6">
      {open.length > 0 && group(open)}
      {done.length > 0 && (
        <View className="gap-2">
          <Typography type="body-xs" color="muted" className="px-8 uppercase">
            {messages.done(done.length)}
          </Typography>
          {group(done)}
        </View>
      )}
    </View>
  );
}
