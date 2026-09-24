import { useQuery } from "@tanstack/react-query";
import { Chip, ListGroup, SkeletonGroup } from "heroui-native";
import { View } from "react-native";
import { Section, SectionNote } from "@/components/people/section";
import { defineMessages } from "@/lib/i18n";
import { agentTasksQuery } from "@/lib/profile";
import { tasksQuery } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

/* The list part of apps/web/src/components/TaskList.tsx, read-only: open tasks first, then the done ones. */

const messages = defineMessages({
  en: {
    done: (n: number) => `Done · ${n}`,
    status: { todo: "To do", in_progress: "In progress", done: "Done" } as Record<TaskStatus, string>,
    now: "Working on it now",
  },
  fr: {
    done: (n: number) => `Terminées · ${n}`,
    status: { todo: "À faire", in_progress: "En cours", done: "Terminée" },
    now: "En ce moment",
  },
});

/** One color per status, as on the web: blue to do, amber in progress, green done. */
const statusColor = { todo: "accent", in_progress: "warning", done: "success" } as const;

export function TaskSection({ title, empty, ...who }: { title: string; empty: string } & ({ userId: string } | { agentId: string })) {
  const { data: tasks, isPending } = useQuery("agentId" in who ? agentTasksQuery(who.agentId) : tasksQuery(who.userId));
  const owner = "userId" in who ? who.userId : null;
  if (isPending)
    return (
      <Section title={title}>
        <SkeletonGroup isLoading isSkeletonOnly className="gap-3 p-4">
          <View className="flex-row items-center justify-between gap-3">
            <SkeletonGroup.Item className="h-5 w-3/5 rounded-md" />
            <SkeletonGroup.Item className="h-6 w-16 rounded-full" />
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <SkeletonGroup.Item className="h-5 w-2/5 rounded-md" />
            <SkeletonGroup.Item className="h-6 w-16 rounded-full" />
          </View>
        </SkeletonGroup>
      </Section>
    );
  const all = tasks ?? [];
  const open = all.filter((x) => x.status !== "done");
  const done = all.filter((x) => x.status === "done");
  return (
    <>
      <Section title={title}>
        {open.length ? open.map((task) => <TaskRow key={task.id} task={task} owner={owner} />) : <SectionNote>{empty}</SectionNote>}
      </Section>
      {done.length > 0 && (
        <Section title={messages.done(done.length)}>
          {done.map((task) => (
            <TaskRow key={task.id} task={task} owner={owner} />
          ))}
        </Section>
      )}
    </>
  );
}

function TaskRow({ task, owner }: { task: Task; owner: string | null }) {
  const now = !!owner && task.assignees.some((a) => a.id === owner && a.current);
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent className="gap-0.5">
        <ListGroup.ItemTitle className={task.status === "done" ? "line-through" : undefined} numberOfLines={2}>
          {task.title}
        </ListGroup.ItemTitle>
        {now && <ListGroup.ItemDescription>{messages.now}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Chip size="sm" variant="soft" color={statusColor[task.status]}>
          <Chip.Label>{messages.status[task.status]}</Chip.Label>
        </Chip>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}
