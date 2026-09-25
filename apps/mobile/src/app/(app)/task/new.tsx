import { common } from "@agora/core/i18n";
import { Stack, useRouter } from "expo-router";
import { FieldError, Input, ListGroup, Separator, TextField, Typography } from "heroui-native";
import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { PersonAvatar } from "@/components/conversation-avatar";
import { useMe } from "@/components/server-scope";
import { DueRow, PriorityRow } from "@/components/tasks/task-fields";
import { defineMessages, tr } from "@/lib/i18n";
import { usePeople } from "@/lib/people";
import { parseTags, splitTags, suggestPeople, tagAtCaret, useCreateTasks, type Candidate, type TaskPriority } from "@/lib/tasks";
import { MentionFieldText } from "@/components/mention";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { useAdminToast } from "@/components/admin/ui";

/*
 * apps/web/src/components/QuickAddTask.tsx as a sheet: type the title, "@username" assigns it
 * to that person (one task per person tagged), nobody tagged = for you.
 */

const messages = defineMessages({
  en: {
    title: "New task",
    placeholder: "Add a task, @someone to assign it",
    forYou: "For you",
    forPeople: (names: string) => `For ${names}`,
    failed: "Couldn't add the task.",
    created: (n: number) => (n > 1 ? `${n} tasks created.` : "Task created."),
  },
  fr: {
    title: "Nouvelle tâche",
    placeholder: "Ajouter une tâche, @quelqu'un pour l'assigner",
    forYou: "Pour toi",
    forPeople: (names: string) => `Pour ${names}`,
    failed: "Ajout impossible.",
    created: (n: number) => (n > 1 ? `${n} tâches créées.` : "Tâche créée."),
  },
});

export default function NewTaskSheet() {
  const me = useMe();
  const router = useRouter();
  const c = tr(common);
  const add = useCreateTasks();
  const toast = useAdminToast();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("normal");

  const everyone = usePeople();
  const people = useMemo<Candidate[]>(() => everyone.map((p) => ({ id: p.id, name: p.name, image: p.image, username: p.handle })), [everyone]);

  const { tagged, title } = parseTags(text, people);
  const targets = tagged.length ? tagged : [{ id: me.id, name: me.name }];
  const forYou = targets.length === 1 && targets[0]!.id === me.id;
  const tag = tagAtCaret(text, caret);
  const suggestions = tag ? suggestPeople(people, tag.query) : [];

  const complete = (p: Candidate) => {
    if (!tag) return;
    const inserted = `@${p.username} `;
    const at = tag.start + inserted.length;
    setText(text.slice(0, tag.start) + inserted + text.slice(caret));
    setCaret(at);
    setSelection({ start: at, end: at });
  };

  const submit = () => {
    if (!title || add.isPending) return;
    add.mutate(
      { title, assigneeIds: targets.map((p) => p.id), dueOn: due, priority },
      {
        onSuccess: (tasks) => {
          toast.success(messages.created(tasks.length));
          router.back();
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={c.add} disabled={!title || add.isPending} variant="prominent" onPress={withTap(submit)} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" className="bg-background" contentContainerClassName="gap-5 px-4 pb-10 pt-4">
        <View className="gap-2">
          <TextField>
            <Input
              autoFocus
              selection={selection}
              onChangeText={(v) => {
                setText(v);
                setSelection(undefined);
              }}
              onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
              onSubmitEditing={submit}
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              maxLength={300}
              placeholder={messages.placeholder}
              accessibilityLabel={messages.title}>
              {/* The text as children, not `value`: every mention in it is highlighted, as the web draws them over its field. */}
              <MentionFieldText text={text} />
            </Input>
          </TextField>
          {!!title && (
            <Typography type="body-xs" color="muted" className="px-1" truncate>
              {forYou ? messages.forYou : messages.forPeople(targets.map((p) => (p.id === me.id ? p.name.split(" ")[0] : p.name)).join(", "))}
            </Typography>
          )}
        </View>

        {suggestions.length > 0 && (
          <ListGroup>
            {suggestions.map((p, i) => (
              <Fragment key={p.id}>
                {i > 0 && <Separator className="ml-14" />}
                <ListGroup.Item onPress={withTap(() => complete(p))} className="py-2.5">
                  <ListGroup.ItemPrefix>
                    <PersonAvatar person={p} size={28} />
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle className="font-normal" numberOfLines={1}>
                      {p.name}
                    </ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <Typography type="body-sm" color="muted">
                      @{p.username}
                    </Typography>
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        )}

        <ListGroup>
          <PriorityRow value={priority} onChange={setPriority} />
          <Separator className="mx-4" />
          <DueRow value={due} onChange={setDue} />
        </ListGroup>

        {add.error && (
          <FieldError isInvalid className="text-center">
            {add.error.message || messages.failed}
          </FieldError>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
