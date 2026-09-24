import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import { Alert, Button, Description, FieldError, Input, Label, LinkButton, SkeletonGroup, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { confirmAction } from "@/components/confirm-action";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle, othersOf } from "@/components/participants";
import { MemberRow } from "@/components/group/member-row";
import { Section } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { conversationQuery, conversationsQuery } from "@/lib/queries";

/* apps/web/src/components/MembersPanel.tsx */

const messages = defineMessages({
  en: {
    group: "Group",
    groupName: "Group name",
    groupNameHint: "Everyone in the group sees it. Leaving the field saves it.",
    renamed: "Name saved",
    untitled: "Untitled group",
    members: (n: number) => `Members · ${n}`,
    bot: "Bot",
    me: (name: string) => `${name} (you)`,
    creator: "Created the group",
    leave: "Leave group",
    actionFailed: "Couldn't do that.",
    addMembers: "Add to group…",
    leaveTitle: (group: string) => `Leave "${group}"?`,
    leaveBody: "You'll no longer see its messages. Someone in the group can add you back.",
    leaveLastBody: "You're the last member: the group and its messages will be deleted.",
    leaveAction: "Leave",
    removeTitle: (name: string) => `Remove ${name} from the group?`,
    removeBody: "They'll no longer see its messages. You can add them back later.",
    removeBotBody: "It will no longer answer here. You can add it back later.",
    removeAction: "Remove",
    unavailable: "Conversation unavailable.",
  },
  fr: {
    group: "Groupe",
    groupName: "Nom du groupe",
    groupNameHint: "Tout le groupe le voit. Il est enregistré quand tu quittes le champ.",
    renamed: "Nom enregistré",
    untitled: "Groupe sans nom",
    members: (n: number) => `Membres · ${n}`,
    bot: "Bot",
    me: (name: string) => `${name} (toi)`,
    creator: "A créé le groupe",
    leave: "Quitter le groupe",
    actionFailed: "Action impossible.",
    addMembers: "Ajouter au groupe…",
    leaveTitle: (group: string) => `Quitter « ${group} » ?`,
    leaveBody: "Tu ne verras plus ses messages. Un membre du groupe pourra te rajouter.",
    leaveLastBody: "Tu es le dernier membre : le groupe et ses messages seront supprimés.",
    leaveAction: "Quitter",
    removeTitle: (name: string) => `Retirer ${name} du groupe ?`,
    removeBody: "Cette personne ne verra plus les messages du groupe. Tu pourras la rajouter plus tard.",
    removeBotBody: "Il ne répondra plus ici. Tu pourras le rajouter plus tard.",
    removeAction: "Retirer",
    unavailable: "Conversation indisponible.",
  },
});

/** Group info: name (renamed in place), members (colleagues and bots), add, remove, leave. */
export default function GroupInfo() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = messages;
  const { data: conv, error } = useQuery(conversationQuery(conversationId));
  const [title, setTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState<string | null | undefined>(undefined);
  if (conv?.title !== savedTitle) {
    setSavedTitle(conv?.title);
    setTitle(conv?.title ?? "");
  }

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: conversationQuery(conversationId).queryKey }), qc.invalidateQueries({ queryKey: conversationsQuery.queryKey })]);

  const rename = useMutation({
    mutationFn: (next: string) => api(conversationPath(conversationId), { method: "PATCH", body: JSON.stringify({ title: next }) }),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.renamed });
      await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (m: { kind: "user" | "agent"; id: string }) =>
      api(conversationPath(conversationId, `/members/${m.kind}/${encodeURIComponent(m.id)}`), { method: "DELETE" }),
    onSuccess: async (_, m) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (m.kind === "user" && m.id === me.id) {
        await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
        router.dismissTo("/");
        return;
      }
      await refresh();
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: t.actionFailed });
    },
  });

  if (error)
    return (
      <>
        <Stack.Screen options={{ title: t.group }} />
        <View className="flex-1 px-4 py-6">
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{t.unavailable}</Alert.Title>
            </Alert.Content>
          </Alert>
        </View>
      </>
    );
  if (!conv)
    return (
      <>
        <Stack.Screen options={{ title: t.group }} />
        <SkeletonGroup isLoading isSkeletonOnly className="flex-1 items-center gap-6 px-4 pt-4">
          <SkeletonGroup.Item className="size-24" />
          <SkeletonGroup.Item className="h-12 w-full" />
          <SkeletonGroup.Item className="h-40 w-full" />
        </SkeletonGroup>
      </>
    );

  // A direct conversation has no group info: the other participant's profile stands for it.
  if (conv.kind !== "group") {
    const other = othersOf(conv, me.id)[0];
    if (!other) return <Redirect href="/" />;
    return other.kind === "agent" ? (
      <Redirect href={{ pathname: "/agents/[agentId]", params: { agentId: other.agent.id, conversationId } }} />
    ) : (
      <Redirect href={{ pathname: "/people/[userId]", params: { userId: other.person.id } }} />
    );
  }

  const canRemove = conv.createdBy === me.id || me.role === "admin";
  const save = () => {
    const next = title.trim();
    if (next !== (conv.title ?? "")) rename.mutate(next);
  };

  return (
    <>
      <Stack.Screen options={{ title: t.group }} />
      <KeyboardAwareScrollView bottomOffset={24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        className="bg-background"
        contentContainerClassName="gap-6 px-4 pb-12 pt-4"
      >
        <View className="items-center">
          <ConversationAvatar conversation={conv} me={me.id} className="size-24" />
        </View>

        {/* Renamed in place: "Done" or leaving the field saves. */}
        <TextField isInvalid={rename.isError} isDisabled={rename.isPending}>
          <Label>{t.groupName}</Label>
          <Input value={title} onChangeText={setTitle} maxLength={80} placeholder={t.untitled} returnKeyType="done" onEndEditing={save} />
          <Description hideOnInvalid>{t.groupNameHint}</Description>
          <FieldError>{t.actionFailed}</FieldError>
        </TextField>

        <View className="gap-2">
          <Section title={t.members(conv.members.length + conv.agents.length)} inset="ml-16">
          {conv.agents.map((a) => (
            <MemberRow
              key={`a:${a.id}`}
              p={{ kind: "agent", agent: a }}
              name={a.name}
              hint={t.bot}
              onRemove={
                canRemove
                  ? async () =>
                      (await confirmAction({ title: t.removeTitle(a.name), description: t.removeBotBody, action: t.removeAction })) &&
                      remove.mutate({ kind: "agent", id: a.id })
                  : undefined
              }
            />
          ))}
          {conv.members.map((m) => (
            <MemberRow
              key={`u:${m.id}`}
              p={{ kind: "user", person: m }}
              name={m.id === me.id ? t.me(m.name) : m.name}
              hint={m.id === conv.createdBy ? t.creator : undefined}
              onRemove={
                canRemove && m.id !== me.id
                  ? async () =>
                      (await confirmAction({ title: t.removeTitle(m.name), description: t.removeBody, action: t.removeAction })) &&
                      remove.mutate({ kind: "user", id: m.id })
                  : undefined
              }
            />
          ))}
          </Section>
          <LinkButton className="ms-2 self-start" onPress={withTap(() => router.push({ pathname: "/info/[conversationId]/add", params: { conversationId } }))}>
            {t.addMembers}
          </LinkButton>
        </View>

        <Button
          variant="danger-soft"
          isDisabled={remove.isPending}
          onPress={withTap(async () =>
            (await confirmAction({
              title: t.leaveTitle(conversationTitle(conv, me.id)),
              description: conv.members.length <= 1 ? t.leaveLastBody : t.leaveBody,
              action: t.leaveAction,
            })) && remove.mutate({ kind: "user", id: me.id }))
          }
        >
          {t.leave}
        </Button>
      </KeyboardAwareScrollView>
    </>
  );
}
