import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import { Alert, PressableFeedback, SkeletonGroup, Typography, useToast } from "heroui-native";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { confirmAction } from "@/components/confirm-action";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle, othersOf } from "@/components/participants";
import { MemberRow } from "@/components/group/member-row";
import { headerIcon } from "@/components/header-button";
import { MenuButton } from "@/components/menus";
import { Section } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { conversationQuery, conversationsQuery } from "@/lib/queries";

/* apps/web/src/components/MembersPanel.tsx */

const messages = defineMessages({
  en: {
    group: "Project",
    groupName: "Project name",
    untitled: "Untitled project",
    count: (n: number) => `${n} member${n > 1 ? "s" : ""}`,
    you: "you",
    more: "More actions",
    edit: "Edit the project",
    leave: "Leave project",
    actionFailed: "Couldn't do that.",
    addMembers: "Add to project",
    leaveTitle: (group: string) => `Leave "${group}"?`,
    leaveBody: "You'll no longer see its messages. Someone in the project can add you back.",
    leaveLastBody: "You're the last member: the project and its messages will be deleted.",
    leaveAction: "Leave",
    removeTitle: (name: string) => `Remove ${name} from the project?`,
    removeBody: "They'll no longer see its messages. You can add them back later.",
    removeBotBody: "It will no longer answer here. You can add it back later.",
    removeAction: "Remove",
    unavailable: "Conversation unavailable.",
  },
  fr: {
    group: "Projet",
    groupName: "Nom du projet",
    untitled: "Projet sans nom",
    count: (n: number) => `${n} membre${n > 1 ? "s" : ""}`,
    you: "toi",
    more: "Plus d'actions",
    edit: "Modifier le projet",
    leave: "Quitter le projet",
    actionFailed: "Action impossible.",
    addMembers: "Ajouter au projet",
    leaveTitle: (group: string) => `Quitter « ${group} » ?`,
    leaveBody: "Tu ne verras plus ses messages. Un membre du projet pourra te rajouter.",
    leaveLastBody: "Tu es le dernier membre : le projet et ses messages seront supprimés.",
    leaveAction: "Quitter",
    removeTitle: (name: string) => `Retirer ${name} du projet ?`,
    removeBody: "Cette personne ne verra plus les messages du projet. Tu pourras la rajouter plus tard.",
    removeBotBody: "Il ne répondra plus ici. Tu pourras le rajouter plus tard.",
    removeAction: "Retirer",
    unavailable: "Conversation indisponible.",
  },
});

/** Project info (web: MembersPanel): logo, name and description (edited on their own screen), members (colleagues and bots), add, remove, leave. */
export default function GroupInfo() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = messages;
  const { data: conv, error } = useQuery(conversationQuery(conversationId));
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: conversationQuery(conversationId).queryKey }), qc.invalidateQueries({ queryKey: conversationsQuery.queryKey })]);

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
  const edit = () => router.push({ pathname: "/info/[conversationId]/edit", params: { conversationId } });
  const leave = async () =>
    (await confirmAction({
      title: t.leaveTitle(conversationTitle(conv, me.id)),
      description: conv.members.length <= 1 ? t.leaveLastBody : t.leaveBody,
      action: t.leaveAction,
    })) && remove.mutate({ kind: "user", id: me.id });

  // As the web's group panel: who it is first (faces, name), then its count once and its members, one
  // line each. Adding is the header's « + »; editing the project and leaving are in its « … ».
  return (
    <>
      <Stack.Screen options={{ title: t.group }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.plus}
          iconRenderingMode="template"
          accessibilityLabel={t.addMembers}
          onPress={withTap(() => router.push({ pathname: "/info/[conversationId]/add", params: { conversationId } }))}
        />
        <Stack.Toolbar.View>
          <MenuButton
            icon="ellipsis"
            label={t.more}
            actions={[
              { label: t.edit, icon: "pencil", onPress: edit },
              { label: t.leave, icon: "rectangle.portrait.and.arrow.right", destructive: true, onPress: () => void leave() },
            ]}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        className="bg-background"
        contentContainerClassName="gap-6 px-4 pb-12 pt-4"
      >
        <View className="items-center gap-3">
          <ConversationAvatar conversation={conv} me={me.id} className="size-24" />
          <PressableFeedback onPress={withTap(edit)} accessibilityRole="button" accessibilityHint={t.edit} className="max-w-full items-center gap-1 px-2">
            <Typography.Heading type="h3" align="center" numberOfLines={2}>
              {conv.title || t.untitled}
            </Typography.Heading>
            {!!conv.description && (
              <Typography type="body-sm" color="muted" align="center">
                {conv.description}
              </Typography>
            )}
          </PressableFeedback>
        </View>

        <Section title={t.count(conv.members.length + conv.agents.length)} inset="ml-16">
          {conv.agents.map((a) => (
            <MemberRow
              key={`a:${a.id}`}
              p={{ kind: "agent", agent: a }}
              name={a.name}
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
              name={m.name}
              me={m.id === me.id}
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
      </KeyboardAwareScrollView>
    </>
  );
}
