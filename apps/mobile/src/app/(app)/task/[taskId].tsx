import { common } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldError, Input, Label, ListGroup, Separator, Spinner, TextArea, TextField, Typography } from "heroui-native";
import { Fragment, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { AgentAvatar } from "@/components/agent-avatar";
import { confirmAction } from "@/components/confirm-action";
import { PersonAvatar } from "@/components/conversation-avatar";
import { useMe } from "@/components/server-scope";
import { rowMessages, taskMeta } from "@/components/tasks/task-meta";
import { AssigneesRow, DueRow, PriorityRow, StatusRow } from "@/components/tasks/task-fields";
import { defineMessages, tr } from "@/lib/i18n";
import { isOverdue, taskQuery, useDeleteTask, useTaskPatch, userTasksQuery, useWorkingOn, type Task, type TaskPatch } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { MentionFieldText } from "@/components/mention";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { useAdminToast } from "@/components/admin/ui";

/* apps/web/src/components/TaskDialog.tsx, and the actions of the web's task row, as one sheet of the (app) stack. */

const messages = defineMessages({
  en: {
    task: "Task",
    title: "Task",
    titlePlaceholder: "What needs to be done",
    description: "Details",
    people: "Working on it",
    openConversation: "Open the conversation",
    failed: "Couldn't save the task.",
    missing: "Task not found",
    now: "Working on it now",
  },
  fr: {
    task: "Tâche",
    title: "Tâche",
    titlePlaceholder: "Ce qu'il y a à faire",
    description: "Détails",
    people: "Sur la tâche",
    openConversation: "Ouvrir la conversation",
    failed: "Enregistrement impossible.",
    missing: "Tâche introuvable",
    now: "En ce moment",
  },
});

export default function TaskSheet() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const me = useMe();
  // From the list when it's there (instant), otherwise fetched alone (a task cited elsewhere).
  const fromList = useQuery({ ...userTasksQuery(me.id), select: (list) => list.find((t) => t.id === taskId) }).data;
  const single = useQuery({ ...taskQuery(taskId), enabled: !fromList });
  const task = fromList ?? single.data;

  if (!task)
    return (
      <>
        <Stack.Screen.Title>{messages.task}</Stack.Screen.Title>
        <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="flex-1 items-center justify-center">
          {single.isPending ? <Spinner /> : <Typography color="muted">{messages.missing}</Typography>}
        </ScrollView>
      </>
    );
  return <TaskForm key={task.id} task={task} />;
}

type Draft = Pick<Task, "title" | "description" | "status" | "priority" | "dueOn">;
const draftOf = (t: Task): Draft => ({ title: t.title, description: t.description, status: t.status, priority: t.priority, dueOn: t.dueOn });

function TaskForm({ task }: { task: Task }) {
  const router = useRouter();
  const me = useMe();
  const c = tr(common);
  const patch = useTaskPatch(task.id);
  const remove = useDeleteTask(task.id);
  const work = useWorkingOn();
  // The screen closes once saved or deleted: a toast says it worked; a failure stays inline, below.
  const toast = useAdminToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(task));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Someone else changed the task meanwhile (realtime): take their values for the fields left untouched.
  const [base, setBase] = useState<Draft>(() => draftOf(task));
  const next = draftOf(task);
  const keys = Object.keys(next) as (keyof Draft)[];
  if (keys.some((k) => next[k] !== base[k])) {
    const merged = { ...draft };
    for (const k of keys) if (draft[k] === base[k]) (merged as Record<string, unknown>)[k] = next[k];
    setDraft(merged);
    setBase(next);
  }

  const reword = task.canDelete;
  const title = draft.title.trim();
  // Only the fields that changed: a participant who didn't create it may not reword it.
  const changes: TaskPatch = {};
  if (reword && title !== task.title) changes.title = title;
  if (reword && draft.description.trim() !== task.description) changes.description = draft.description.trim();
  if (reword && draft.dueOn !== task.dueOn) changes.dueOn = draft.dueOn;
  if (task.canEdit && draft.status !== task.status) changes.status = draft.status;
  if (task.canEdit && draft.priority !== task.priority) changes.priority = draft.priority;
  const dirty = Object.keys(changes).length > 0;

  const mine = task.assignees.find((a) => a.id === me.id);
  const meta = taskMeta(task);
  const late = task.status !== "done" && isOverdue(task.dueOn);

  const openConversation = (id: string) => {
    router.back();
    router.push({ pathname: "/c/[conversationId]", params: { conversationId: id } });
  };

  return (
    <>
      <Stack.Screen.Title>{messages.task}</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.close} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      {(task.canEdit || reword) && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={c.save} disabled={!dirty || !title || patch.isPending} variant="prominent" onPress={withTap(() => patch.mutate(changes, { onSuccess: () => (toast.success(), router.back()) }))} />
        </Stack.Toolbar>
      )}
      <KeyboardAwareScrollView bottomOffset={24} contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 px-4 pb-10 pt-4" keyboardDismissMode="interactive">
        <View className="gap-4">
          <TextField isRequired isDisabled={!reword} isInvalid={!title}>
            <Label>{messages.title}</Label>
            {/* The text as children, not `value`: mentions in it are highlighted. */}
            <Input onChangeText={(v) => set("title", v)} maxLength={200} placeholder={messages.titlePlaceholder}>
              <MentionFieldText text={draft.title} />
            </Input>
          </TextField>
          {(reword || !!task.description) && (
            <TextField isDisabled={!reword}>
              <Label>{messages.description}</Label>
              <TextArea onChangeText={(v) => set("description", v)} maxLength={2000}>
                <MentionFieldText text={draft.description} />
              </TextArea>
            </TextField>
          )}
        </View>

        <ListGroup>
          <StatusRow value={draft.status} disabled={!task.canEdit} onChange={(v) => set("status", v)} />
          <Separator className="mx-4" />
          <PriorityRow value={draft.priority} disabled={!task.canEdit} onChange={(v) => set("priority", v)} />
          <Separator className="mx-4" />
          <DueRow value={draft.dueOn} disabled={!reword} onChange={(v) => set("dueOn", v)} />
        </ListGroup>

        <View className="gap-2">
          <Typography type="body-xs" color="muted" className="px-4 uppercase">
            {messages.people}
          </Typography>
          <ListGroup>
            {task.assignees.map((a, i) => (
              <Fragment key={a.id}>
                {i > 0 && <Separator className="ml-16" />}
                <ListGroup.Item disabled>
                  <ListGroup.ItemPrefix>
                    <PersonAvatar person={a} size={32} />
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle className="font-normal">{a.id === me.id ? `${a.name} (${c.you})` : a.name}</ListGroup.ItemTitle>
                    {a.current && <ListGroup.ItemDescription className="text-warning">{messages.now}</ListGroup.ItemDescription>}
                  </ListGroup.ItemContent>
                </ListGroup.Item>
              </Fragment>
            ))}
            {task.canEdit && (
              <>
                <Separator className="mx-4" />
                <AssigneesRow task={task} />
              </>
            )}
          </ListGroup>
          {!!meta && (
            <View className="flex-row items-center gap-1.5 px-4">
              {task.assignedBy?.kind === "agent" && <AgentAvatar agent={task.assignedBy} size={16} />}
              {task.assignedBy?.kind === "user" && <PersonAvatar person={task.assignedBy} size={16} />}
              <Typography type="body-xs" color="muted" className={cn("flex-1", late && "text-danger")}>
                {meta}
              </Typography>
            </View>
          )}
        </View>

        <View className="gap-3">
          {task.canEdit && mine && task.status !== "done" && (
            <Button variant="secondary" isDisabled={work.isPending} onPress={withTap(() => work.mutate(mine.current ? null : task.id))}>
              {mine.current ? rowMessages.stopWorking : rowMessages.workOn}
            </Button>
          )}
          {task.conversationId && (
            <Button variant="tertiary" onPress={withTap(() => openConversation(task.conversationId!))}>
              {messages.openConversation}
            </Button>
          )}
          {task.canDelete && (
            <Button
              variant="danger-soft"
              isDisabled={remove.isPending}
              onPress={withTap(async () => {
                if (await confirmAction({ title: rowMessages.deleteTitle(task.title), description: rowMessages.deleteBody, action: c.delete }))
                  remove.mutate(undefined, { onSuccess: () => (toast.deleted(), router.back()) });
              })}
            >
              {c.delete}
            </Button>
          )}
          {!!(patch.error || remove.error || work.error) && (
            <FieldError isInvalid className="text-center">
              {(patch.error ?? remove.error ?? work.error)?.message || messages.failed}
            </FieldError>
          )}
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}
