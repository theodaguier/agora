import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ListGroup, PressableFeedback, Separator, Typography, useToast } from "heroui-native";
import { View } from "react-native";
import { PriorityMark, TaskStatusIcon } from "@/components/code-session-marks";
import { confirmAction } from "@/components/confirm-action";
import { MentionText } from "@/components/mention";
import { LongPressMenu, TapMenu, type MenuEntry } from "@/components/menus";
import { rowMessages } from "@/components/tasks/task-meta";
import { dueLabel } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { isOverdue, taskHref, useDeleteTask, useTaskPatch, useWorkingOn, type Task, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { priorityMessages, TASK_PRIORITIES } from "@/lib/task-status";

/*
 * apps/web/src/components/TaskList.tsx `TaskTableRow` (Figma « Mes tâches »): one 40 px line per task,
 * full width, a hairline under it. Its priority (a tap: the priorities), its state (a tap closes or
 * reopens it), its title, when it is due. At phone width the web drops the agent and the faces too.
 * A tap on the line opens the task; a long press, the web's right-click menu.
 */
export function TaskTableRow({ task, me, mentionables }: { task: Task; me: string; mentionables: Mentionable[] }) {
  const router = useRouter();
  const patch = useTaskPatch(task.id);
  const remove = useDeleteTask(task.id);
  const work = useWorkingOn();
  const { toast } = useToast();
  const t = rowMessages;
  const p = priorityMessages;
  const c = tr(common);
  const done = task.status === "done";
  const late = !done && isOverdue(task.dueOn);
  const mine = task.assignees.find((a) => a.id === me);
  const failed = () => toast.show({ variant: "danger", label: t.failed });
  const setStatus = (status: TaskStatus) => {
    if (status === "done") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    patch.mutate({ status }, { onError: failed });
  };
  const setPriority = (priority: TaskPriority) => patch.mutate({ priority }, { onError: failed });
  const askDelete = async () => {
    if (await confirmAction({ title: t.deleteTitle(task.title), description: t.deleteBody, action: c.delete }))
      remove.mutate(undefined, { onSuccess: () => toast.show({ variant: "success", label: c.deleted }), onError: failed });
  };

  const priorities: MenuEntry[] = task.canEdit
    ? [{ title: p.priority, actions: TASK_PRIORITIES.map((level) => ({ label: p.label[level], mark: <PriorityMark priority={level} size={16} />, checked: level === task.priority, onPress: () => level !== task.priority && setPriority(level) })) }]
    : [];
  const actions: MenuEntry[] = [
    task.canEdit && task.status !== "in_progress" && !done && { label: t.start, mark: <TaskStatusIcon status="in_progress" size={16} />, onPress: () => setStatus("in_progress") },
    task.canEdit && task.status !== "todo" && { label: t.reopen, mark: <TaskStatusIcon status="todo" size={16} />, onPress: () => setStatus("todo") },
    task.canEdit && !done && { label: t.complete, mark: <TaskStatusIcon status="done" size={16} />, onPress: () => setStatus("done") },
    task.canEdit && mine && !done && !mine.current && { label: t.workOn, icon: "person", onPress: () => work.mutate(task.id, { onError: failed }) },
    task.canEdit && mine?.current && { label: t.stopWorking, icon: "stop.circle", onPress: () => work.mutate(null, { onError: failed }) },
    task.canEdit && task.canDelete && "divider",
    task.canDelete && { label: c.edit, icon: "pencil", onPress: () => router.push(taskHref(task.id)) },
    task.canDelete && { label: c.delete, icon: "trash", destructive: true, onPress: () => void askDelete() },
  ];

  return (
    <>
      <LongPressMenu actions={actions}>
        <ListGroup.Item onPress={withTap(() => router.push(taskHref(task.id)))} className="h-10 gap-3 px-4 py-0">
          <ListGroup.ItemPrefix className="flex-row items-center gap-1">
            <TapMenu actions={priorities} accessibilityLabel={`${p.priority} : ${p.label[task.priority]}`}>
              <View className="size-7 items-center justify-center">
                <PriorityMark priority={task.priority} />
              </View>
            </TapMenu>
            <PressableFeedback
              isDisabled={!task.canEdit || patch.isPending}
              onPress={() => setStatus(done ? "todo" : "done")}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? t.reopen : t.complete}
              className="size-7 items-center justify-center"
            >
              <TaskStatusIcon status={task.status} />
            </PressableFeedback>
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <Typography type="body-sm" color={done ? "muted" : "default"} numberOfLines={1}>
              <MentionText text={task.title} mentionables={mentionables} flat />
            </Typography>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            {task.dueOn ? (
              <Typography type="body-xs" color={late || done ? "default" : "muted"} className={late ? "text-danger" : done ? "text-subtle" : undefined}>
                {dueLabel(task.dueOn)}
              </Typography>
            ) : (
              false
            )}
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </LongPressMenu>
      <Separator />
    </>
  );
}
