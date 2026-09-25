import { common } from "@agora/core/i18n";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Chip, ListGroup, PressableFeedback, Typography, useToast } from "heroui-native";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { confirmAction } from "@/components/confirm-action";
import { PersonAvatar } from "@/components/conversation-avatar";
import { MentionText } from "@/components/mention";
import { AssigneeFaces } from "@/components/tasks/assignee-faces";
import { StatusToggle } from "@/components/tasks/status-toggle";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { isOverdue, taskHref, useDeleteTask, useTaskPatch, useWorkingOn, type Task, type TaskPriority, type TaskStatus } from "@/lib/tasks";
import { priorityColor, priorityMessages, statusColor, statusMessages, TASK_PRIORITIES } from "@/lib/task-status";
import { LongPressMenu, type MenuEntry } from "@/components/menus";
import { rowMessages, taskMeta } from "@/components/tasks/task-meta";

/* apps/web/src/components/TaskList.tsx `TaskRow`: the "…" menu becomes a HeroUI Menu opened by a long press. */

/**
 * One task of a list: round status toggle, title, chips, who gave it and when it's due, and the
 * faces of who works on it. A tap opens the task sheet; a long press, its actions.
 * `owner`: whose list it is, to flag the task they're working on right now. `me`: the signed-in user.
 */
export function TaskRow({ task, owner, me, mentionables }: { task: Task; owner: string; me: string; mentionables: Mentionable[] }) {
  const router = useRouter();
  const patch = useTaskPatch(task.id);
  const remove = useDeleteTask(task.id);
  const work = useWorkingOn();
  const t = rowMessages;
  const c = tr(common);

  const done = task.status === "done";
  const mine = task.assignees.find((a) => a.id === me);
  const now = task.assignees.some((a) => a.id === owner && a.current);
  const meta = taskMeta(task);
  const late = !done && isOverdue(task.dueOn);
  const { toast } = useToast();
  const failed = () => toast.show({ variant: "danger", label: t.failed });
  const setStatus = (status: TaskStatus) => patch.mutate({ status }, { onError: failed });
  const setPriority = (priority: TaskPriority) => {
    void Haptics.selectionAsync();
    patch.mutate({ priority }, { onError: failed });
  };
  const askDelete = async () => {
    if (await confirmAction({ title: t.deleteTitle(task.title), description: t.deleteBody, action: c.delete }))
      remove.mutate(undefined, { onSuccess: () => toast.show({ variant: "success", label: c.deleted }), onError: failed });
  };
  const priority = !done ? priorityColor[task.priority] : null;
  const hasMenu = task.canEdit || task.canDelete;

  const row = (
    <PressableFeedback
      animation={false}
      onPress={withTap(() => router.push(taskHref(task.id)))}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled className="items-start gap-3 py-3">
          <ListGroup.ItemPrefix className="pt-px">
            <StatusToggle status={task.status} disabled={!task.canEdit} onChange={setStatus} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent className="gap-1">
            <ListGroup.ItemTitle className={done ? "line-through" : undefined} numberOfLines={3}>
              <MentionText text={task.title} mentionables={mentionables} flat />
            </ListGroup.ItemTitle>
            {!!task.description && <ListGroup.ItemDescription numberOfLines={2}>{task.description}</ListGroup.ItemDescription>}
            {(now || task.status === "in_progress" || priority || late) && (
              <View className="flex-row flex-wrap gap-1.5">
                {(now || task.status === "in_progress") && (
                  <Chip size="sm" variant="soft" color={statusColor.in_progress}>
                    <Chip.Label>{now ? t.now : statusMessages.label.in_progress}</Chip.Label>
                  </Chip>
                )}
                {priority && (
                  <Chip size="sm" variant="soft" color={priority}>
                    <Chip.Label>{priorityMessages.label[task.priority]}</Chip.Label>
                  </Chip>
                )}
                {late && (
                  <Chip size="sm" variant="soft" color="danger">
                    <Chip.Label>{t.overdue}</Chip.Label>
                  </Chip>
                )}
              </View>
            )}
            {!!meta && (
              <View className="flex-row items-center gap-1.5">
                {task.assignedBy?.kind === "agent" && <AgentAvatar agent={task.assignedBy} size={16} />}
                {task.assignedBy?.kind === "user" && <PersonAvatar person={task.assignedBy} size={16} />}
                <Typography type="body-xs" color="muted" className="flex-1" truncate>
                  {meta}
                </Typography>
              </View>
            )}
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <AssigneeFaces assignees={task.assignees} />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Highlight />
    </PressableFeedback>
  );

  if (!hasMenu) return row;
  // A tap opens the task; a long press, the HeroUI Menu .
  const actions: MenuEntry[] = [
    task.canEdit && task.status !== "in_progress" && !done && { label: t.start, icon: "play.circle", onPress: () => setStatus("in_progress") },
    task.canEdit && task.status !== "todo" && { label: t.reopen, icon: "arrow.uturn.backward.circle", onPress: () => setStatus("todo") },
    task.canEdit &&
      !done && {
        label: t.complete,
        icon: "checkmark.circle",
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setStatus("done");
        },
      },
    task.canEdit && mine && !done && !mine.current && { label: t.workOn, icon: "hammer", onPress: () => work.mutate(task.id, { onError: failed }) },
    task.canEdit && mine?.current && { label: t.stopWorking, icon: "stop.circle", onPress: () => work.mutate(null, { onError: failed }) },
    task.canEdit && {
      title: priorityMessages.priority,
      actions: [
        {
          submenu: priorityMessages.label[task.priority],
          icon: "flag",
          actions: TASK_PRIORITIES.map((level) => ({
            label: priorityMessages.label[level],
            checked: level === task.priority,
            onPress: () => level !== task.priority && setPriority(level),
          })),
        },
      ],
    },
    task.canDelete && "divider",
    task.canDelete && { label: c.edit, icon: "pencil", onPress: () => router.push(taskHref(task.id)) },
    task.canDelete && { label: c.delete, icon: "trash", destructive: true, onPress: askDelete },
  ];
  return <LongPressMenu actions={actions}>{row}</LongPressMenu>;
}
