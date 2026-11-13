import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, Input, LinkButton, Spinner, Surface, Typography } from "heroui-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAdminToast } from "@/components/admin/ui";
import { codeSessionHref, ENGINE_PROVIDER } from "@/components/code-session";
import { TaskStatusIcon } from "@/components/code-session-marks";
import { AttachMenu } from "@/components/composer/attach-menu";
import { PendingFiles, usePendingFiles } from "@/components/composer/pending-files";
import { PersonAvatar } from "@/components/conversation-avatar";
import { EmptyState } from "@/components/empty-state";
import { ArrowUpIcon, MailIcon, TerminalIcon } from "@/components/icons";
import { Face, inboxMessages, useInboxItem } from "@/components/inbox-item";
import { MessageText } from "@/components/message-text";
import { ModelLogo } from "@/components/model-logo";
import { conversationTitle } from "@/components/participants";
import { useMe } from "@/components/server-scope";
import { sendMessage } from "@/lib/api";
import { codeSessionsQuery } from "@/lib/code-sessions";
import { ageLabel } from "@/lib/dates";
import { withTap } from "@/lib/haptics";
import { inboxQuery, type InboxItem } from "@/lib/inbox";
import { useMentionables } from "@/lib/people";
import { conversationsQuery, messagesQuery } from "@/lib/queries";
import { statusMessages } from "@/lib/task-status";
import { userTasksQuery } from "@/lib/tasks";
import type { Message } from "@/lib/types";

/*
 * apps/web/src/screens/Inbox.tsx `InboxItemView`, pushed from the list as the web opens an item on a
 * narrow screen: where it comes from (the web header's link), its title, its properties (the web's side
 * column, above the activity at phone width), then the activity: who created it, the message behind
 * it, and a reply sent into that conversation, files included.
 */

const t = inboxMessages;
const noAgents: never[] = [];

export default function InboxItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { data: item, isPending } = useQuery({ ...inboxQuery(), select: (d) => d.items.find((i) => i.id === itemId) });
  if (!item)
    return (
      <KeyboardAwareScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="flex-1 items-center justify-center">
        {isPending ? <Spinner /> : <EmptyState icon={MailIcon} description={t.missing} />}
      </KeyboardAwareScrollView>
    );
  return <ItemView key={item.id} item={item} />;
}

function ItemView({ item }: { item: InboxItem }) {
  const me = useMe();
  const status = statusMessages;
  const mentionables = useMentionables(noAgents);
  const { onTask, place, title, open } = useInboxItem(item);
  const { data: task } = useQuery({ ...userTasksQuery(me.id), enabled: onTask && !!item.task, select: (list) => list.find((x) => x.id === item.task?.id) });
  // A task's notification may not say where it came from; the task does.
  const conversationId = item.conversationId ?? task?.conversationId ?? null;
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = conversationId ? conversations?.find((c) => c.id === conversationId) : undefined;
  const convName = conv ? conversationTitle(conv, me.id) : place;
  const { data: thread = [] } = useQuery({ ...messagesQuery(conversationId ?? ""), enabled: !!conversationId });
  // The words behind the item: the message itself, or for a task the last thing its author said there.
  const said: Message | undefined = item.messageId
    ? thread.find((m) => m.id === item.messageId)
    : [...thread].reverse().find((m) => m.kind === "bot" && m.author?.id === item.actor?.id && !!m.text);
  // The code session it is about: the last one its author started in that conversation.
  const session = [...thread].reverse().find((m) => m.author?.id === item.actor?.id && m.data?.codeSessions?.length)?.data?.codeSessions?.at(-1);
  const { data: engine } = useQuery({
    ...codeSessionsQuery(conversationId ?? ""),
    enabled: !!session && !!conversationId,
    select: (list) => list.find((x) => x.id === session?.id)?.engine,
  });
  // Only what the page doesn't already say: who wrote it is on its card, a message's conversation is the link above the title.
  const showConversation = onTask && !!convName && !!conversationId;
  const hasProperties = !!item.task || (!!task && task.assignees.length > 0) || (!!session && !!conversationId) || showConversation;
  const crumb = onTask ? t.tasks : place;

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      className="bg-background"
      contentContainerClassName="gap-7 px-5 pt-3 pb-10"
    >
      <View className="items-start gap-1.5">
        {!!crumb && (
          <LinkButton size="sm" onPress={withTap(open)}>
            <LinkButton.Label className="text-muted" numberOfLines={1}>
              {crumb}
            </LinkButton.Label>
          </LinkButton>
        )}
        <Typography.Heading type="h4">{title}</Typography.Heading>
      </View>

      {hasProperties && (
        <View>
          <Typography type="body-xs" weight="medium" className="pb-1 text-subtle">
            {t.properties}
          </Typography>
          {item.task && (
            <Property label={t.status}>
              <Mark>
                <TaskStatusIcon status={item.task.status} />
              </Mark>
              <Typography type="body-sm" numberOfLines={1} className={item.task.status === "done" ? "text-state-merged" : item.task.status === "in_progress" ? "text-warning" : undefined}>
                {status.label[item.task.status]}
              </Typography>
            </Property>
          )}
          {task && task.assignees.length > 0 && (
            <Property label={t.assignees}>
              <View className="min-w-0 flex-1">
                {task.assignees.map((a) => (
                  <View key={a.id} className="min-h-8 flex-row items-center gap-2">
                    <Mark>
                      <PersonAvatar person={a} size={16} />
                    </Mark>
                    <Typography type="body-sm" numberOfLines={1} className="shrink">
                      {a.name}
                    </Typography>
                  </View>
                ))}
              </View>
            </Property>
          )}
          {session && conversationId ? (
            <Property label={t.session}>
              <Mark>{engine ? <ModelLogo model={engine === "cursor" ? undefined : engine} provider={ENGINE_PROVIDER[engine]} size={14} /> : <TerminalIcon size={14} className="text-muted" />}</Mark>
              <LinkButton size="sm" className="shrink" onPress={withTap(() => router.push(codeSessionHref(conversationId, session.id)))}>
                <LinkButton.Label numberOfLines={1}>{session.title}</LinkButton.Label>
              </LinkButton>
            </Property>
          ) : (
            showConversation && (
              <Property label={t.conversation}>
                <LinkButton size="sm" className="shrink" onPress={withTap(() => router.push({ pathname: "/c/[conversationId]", params: { conversationId: conversationId! } }))}>
                  <LinkButton.Label numberOfLines={1}>{convName}</LinkButton.Label>
                </LinkButton>
              </Property>
            )
          )}
        </View>
      )}

      <View className="gap-3.5" accessibilityLabel={t.activity}>
        <Typography type="body-sm" weight="medium">
          {t.activity}
        </Typography>
        {onTask && (
          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Face author={item.actor} />
            <Typography type="body-sm" weight="medium">
              {item.actor?.name ?? t.someone}
            </Typography>
            <Typography type="body-sm" color="muted">
              {t.created(item.kind === "task.assigned")}
            </Typography>
            <Typography type="body-sm" className="text-subtle">
              · {ageLabel(new Date(item.createdAt))}
            </Typography>
          </View>
        )}
        {said && (
          <Card variant="transparent" className="gap-3 border border-border">
            <View className="flex-row items-center gap-2">
              <Face author={said.author} />
              <Typography type="body-sm" weight="medium" numberOfLines={1} className="shrink">
                {said.author?.name ?? t.someone}
              </Typography>
              <Typography type="body-sm" className="text-subtle">
                {ageLabel(new Date(said.createdAt))}
              </Typography>
            </View>
            <MessageText text={said.text} plain={said.kind === "user"} mentionables={mentionables} textClassName="text-callout" />
          </Card>
        )}
        {conversationId && <Reply conversationId={conversationId} mention={item.actor?.kind === "agent" ? item.actor.id : undefined} />}
      </View>
    </KeyboardAwareScrollView>
  );
}

/** A property on one line, as Linear's: its name in grey, then its value after a 16 pt mark. */
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-8 flex-row items-start">
      <View className="h-8 w-28 shrink-0 justify-center">
        <Typography type="body-sm" color="muted" numberOfLines={1}>
          {label}
        </Typography>
      </View>
      <View className="min-h-8 min-w-0 flex-1 flex-row items-center gap-2">{children}</View>
    </View>
  );
}

/** The slot of a value's mark: 16 pt, whatever it holds (a state, a face, a logo), so the words line up. */
function Mark({ children }: { children: ReactNode }) {
  return <View className="size-4 shrink-0 items-center justify-center">{children}</View>;
}

/** Answering where it was said, from here: the conversation gets the reply (files too), the bot is called when it's one. */
function Reply({ conversationId, mention }: { conversationId: string; mention?: string }) {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const { files, setFiles, addFiles, removeFile } = usePendingFiles(conversationId, t);
  const ids = files.flatMap((f) => (f.status === "ready" && f.attachment ? [f.attachment.id] : []));
  const send = useMutation({
    mutationFn: () => sendMessage(conversationId, { text: text.trim(), attachmentIds: ids, invocations: [], mentions: mention ? [mention] : [] }),
    onSuccess: () => {
      setText("");
      setFiles([]);
      toast.success(t.sent);
      void qc.invalidateQueries({ queryKey: messagesQuery(conversationId).queryKey });
    },
    onError: (e) => toast.failed(e, t.sendFailed),
  });
  const ready = (!!text.trim() || ids.length > 0) && !files.some((f) => f.status === "uploading") && !send.isPending;
  return (
    <Surface variant="transparent" className="gap-1 rounded-2xl border border-border p-1.5">
      <PendingFiles items={files} onRemove={removeFile} />
      <View className="flex-row items-end gap-1">
        <Input
          multiline
          value={text}
          onChangeText={setText}
          placeholder={t.comment}
          className="max-h-[152px] flex-1 bg-transparent px-2.5 py-2 text-callout shadow-none ios:focus:outline-transparent android:focus:border-transparent"
        />
        <AttachMenu open={attachOpen} onOpenChange={setAttachOpen} onFiles={addFiles} />
        <Button isIconOnly size="sm" variant={ready ? "primary" : "secondary"} accessibilityLabel={t.send} isDisabled={!ready} onPress={withTap(() => ready && send.mutate())}>
          <ArrowUpIcon className={ready ? "size-[18px] text-accent-foreground" : "size-[18px] text-muted"} strokeWidth={2.25} />
        </Button>
      </View>
    </Surface>
  );
}
