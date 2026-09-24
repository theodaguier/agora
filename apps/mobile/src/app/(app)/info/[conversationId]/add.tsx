import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ListGroup, SearchField, Spinner, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ParticipantAvatar } from "@/components/conversation-avatar";
import { type Participant } from "@/components/participants";
import { Section } from "@/components/people/section";
import { api, conversationPath } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { agentsQuery, conversationQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* AddMembers of apps/web/src/components/MembersPanel.tsx: several can be added in a row. */

const messages = defineMessages({
  en: {
    addToGroup: "Add to group…",
    noMatch: "No one matches.",
    everyoneHere: "Everyone is already here.",
    bots: "Bots",
    colleagues: "Colleagues",
    addFailed: "Couldn't add them.",
    added: (name: string) => `${name} joined the group`,
  },
  fr: {
    addToGroup: "Ajouter au groupe…",
    noMatch: "Personne ne correspond.",
    everyoneHere: "Tout le monde est déjà là.",
    bots: "Bots",
    colleagues: "Collègues",
    addFailed: "Ajout impossible.",
    added: (name: string) => `${name} a rejoint le groupe`,
  },
});

export default function AddMembers() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const t = messages;
  const c = tr(common);
  const [q, setQ] = useState("");
  const { data: conv } = useQuery(conversationQuery(conversationId));
  const { data: people = [] } = useQuery(usersQuery);
  const { data: bots = [] } = useQuery(agentsQuery);
  const botsLeft = bots.filter((b) => !b.onboarding && !conv?.agents.some((a) => a.id === b.id));
  const peopleLeft = people.filter((p) => !conv?.members.some((m) => m.id === p.id));
  const query = q.trim().toLowerCase();
  const botsShown = botsLeft.filter((b) => b.name.toLowerCase().includes(query));
  const peopleShown = peopleLeft.filter((p) => p.name.toLowerCase().includes(query));

  const add = useMutation({
    mutationFn: (body: { userIds: string[]; agentIds: string[]; name: string }) =>
      api(conversationPath(conversationId, "/members"), { method: "POST", body: JSON.stringify({ userIds: body.userIds, agentIds: body.agentIds }) }),
    onSuccess: (_, { name }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.added(name) });
      return Promise.all([
        qc.invalidateQueries({ queryKey: conversationQuery(conversationId).queryKey }),
        qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }),
      ]);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ variant: "danger", label: t.addFailed });
    },
  });
  const pending = add.isPending ? (add.variables.agentIds[0] ?? add.variables.userIds[0]) : null;

  const row = (key: string, p: Participant, name: string, body: { userIds: string[]; agentIds: string[] }) => (
    <ListGroup.Item key={key} disabled={add.isPending} onPress={withTap(() => add.mutate({ ...body, name }))}>
      <ListGroup.ItemPrefix>
        <ParticipantAvatar p={p} size={36} />
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>
          {name}
        </ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>{pending === (p.kind === "agent" ? p.agent.id : p.person.id) ? <Spinner size="sm" /> : <View />}</ListGroup.ItemSuffix>
    </ListGroup.Item>
  );

  return (
    <>
      <Stack.Screen options={{ title: c.add }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={c.close} variant="prominent" onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24} contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-6 p-4 pb-12" keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <SearchField value={q} onChange={setQ}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder={t.addToGroup} autoCorrect={false} />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        {botsShown.length > 0 && (
          <Section title={t.bots} inset="ml-14">
            {botsShown.map((b) => row(`a:${b.id}`, { kind: "agent", agent: b }, b.name, { userIds: [], agentIds: [b.id] }))}
          </Section>
        )}
        {peopleShown.length > 0 && (
          <Section title={t.colleagues} inset="ml-14">
            {peopleShown.map((p) => row(`u:${p.id}`, { kind: "user", person: p }, p.name, { userIds: [p.id], agentIds: [] }))}
          </Section>
        )}
        {!botsShown.length && !peopleShown.length && (
          <Typography color="muted" align="center" className="px-6 py-12">
            {botsLeft.length + peopleLeft.length ? t.noMatch : t.everyoneHere}
          </Typography>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
