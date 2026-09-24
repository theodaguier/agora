import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Button, Chip, Popover, Skeleton, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { PersonAvatar } from "@/components/conversation-avatar";
import { CheckCircleIcon } from "@/components/icons";
import { InlineBox, ResetTextStyle, useEm } from "@/components/text-entities";
import { boxText } from "@/components/text-style";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { formatDueDate, isOverdue, taskHref, taskQuery, type Task } from "@/lib/tasks";
import { priorityColor, priorityMessages, statusColor, statusMessages, statusText } from "@/lib/task-status";
import { usePopoverInsets } from "@/lib/popover-insets";

/*
 * apps/web/src/components/TaskRef.tsx. The card shown on hover on the web shows on a tap here, in a
 * HeroUI Popover: status, priority, due date, description, assignees, and the way to the task.
 */

const messages = defineMessages({
  en: { missing: "Task not found", due: (date: string) => `Due ${date}`, open: "Open task" },
  fr: { missing: "Tâche introuvable", due: (date: string) => `Échéance ${date}`, open: "Ouvrir la tâche" },
});

/** A task cited in a message: its title in a chip of its status's color; a tap shows the task's card. */
export function TaskRef({ taskId }: { taskId: string }) {
  const insets = usePopoverInsets();
  const t = messages;
  const em = useEm();
  const [open, setOpen] = useState(false);
  const { data: task, isPending } = useQuery(taskQuery(taskId));
  if (isPending)
    return (
      <InlineBox>
        <Skeleton className="w-24" style={{ height: em(1.1) }} />
      </InlineBox>
    );
  if (!task)
    return (
      <InlineBox>
        <Chip size="sm" variant="soft" color="default">
          <Chip.Label style={boxText(em, 1)}>{t.missing}</Chip.Label>
        </Chip>
      </InlineBox>
    );
  const done = task.status === "done";
  return (
    <InlineBox>
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Chip size="sm" variant="soft" color={statusColor[task.status]} accessibilityRole="button" accessibilityLabel={task.title}>
            <CheckCircleIcon className={statusText[task.status]} size={em(1.05)} />
            <Chip.Label className={done ? "shrink line-through" : "shrink"} style={boxText(em, 1)}>
              {task.title}
            </Chip.Label>
          </Chip>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Overlay />
          <Popover.Content presentation="popover" placement="top" align="start" width={320} insets={insets} className="gap-3">
            <ResetTextStyle>
              <TaskCard
                task={task}
                onOpen={() => {
                  setOpen(false);
                  router.push(taskHref(task.id));
                }}
              />
            </ResetTextStyle>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </InlineBox>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const t = messages;
  const s = statusMessages;
  const p = priorityMessages;
  const done = task.status === "done";
  const priority = priorityColor[task.priority];
  return (
    <>
      <View className="gap-1.5">
        <Popover.Title>{task.title}</Popover.Title>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Chip size="sm" variant="soft" color={statusColor[task.status]}>
            <Chip.Label>{s.label[task.status]}</Chip.Label>
          </Chip>
          {priority && !done && (
            <Chip size="sm" variant="soft" color={priority}>
              <Chip.Label>{p.label[task.priority]}</Chip.Label>
            </Chip>
          )}
          {task.dueOn && (
            <Chip size="sm" variant="soft" color={!done && isOverdue(task.dueOn) ? "danger" : "default"}>
              <Chip.Label>{t.due(formatDueDate(task.dueOn))}</Chip.Label>
            </Chip>
          )}
        </View>
      </View>
      {!!task.description && <Popover.Description numberOfLines={3}>{task.description}</Popover.Description>}
      {task.assignees.length > 0 && (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1.5">
          {task.assignees.map((a) => (
            <View key={a.id} className="flex-row items-center gap-1.5">
              <PersonAvatar person={a} size={16} />
              <Typography type="body-sm">{a.name}</Typography>
            </View>
          ))}
        </View>
      )}
      <Button variant="secondary" size="sm" onPress={withTap(onOpen)}>
        {t.open}
      </Button>
    </>
  );
}
