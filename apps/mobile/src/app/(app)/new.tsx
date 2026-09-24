import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar, Checkbox, Chip, Input, Label, ListGroup, ScrollShadow, SearchField, Spinner, TextField, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ParticipantAvatar, StatusAvatar } from "@/components/conversation-avatar";
import { type Participant } from "@/components/participants";
import { CheckIcon, ChevronLeftIcon, CloseIcon, PlusIcon, UsersIcon } from "@/components/icons";
import { PressableItem, Section } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { agentsQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/screens/NewChat.tsx: same rows, same calls; the group is composed with checkboxes. */

const messages = defineMessages({
  en: {
    creatingBot: "Creating Bot…",
    createBot: "Create a new Bot",
    createGroup: "Create a group conversation",
    newConversation: "New conversation",
    newGroup: "New group",
    removeName: (name: string) => `Remove ${name}`,
    searchOrCreate: "Search or create Bots",
    groupMembers: "Group Bots and colleagues",
    groupName: "Group name",
    pickTwo: "Pick at least two participants",
    noMatch: "No one matches.",
    bots: "Bots",
    colleagues: "Colleagues",
  },
  fr: {
    creatingBot: "Création du Bot…",
    createBot: "Créer un nouveau Bot",
    createGroup: "Créer une conversation de groupe",
    newConversation: "Nouvelle conversation",
    newGroup: "Nouveau groupe",
    removeName: (name: string) => `Retirer ${name}`,
    searchOrCreate: "Rechercher ou créer des Bots",
    groupMembers: "Bots et collègues du groupe",
    groupName: "Nom du groupe",
    pickTwo: "Choisis au moins deux participants",
    noMatch: "Personne ne correspond.",
    bots: "Bots",
    colleagues: "Collègues",
  },
});

const participantKey = (p: Participant) => (p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`);
const participantName = (p: Participant) => (p.kind === "agent" ? p.agent.name : p.person.name);

/** Find a bot or a colleague, create a bot that configures itself through conversation, or compose a group. */
export default function NewChat() {
  const me = useMe();
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: agents = [] } = useQuery(agentsQuery);
  const { data: people = [] } = useQuery(usersQuery);
  const [q, setQ] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [picked, setPicked] = useState<Participant[]>([]);
  const [title, setTitle] = useState("");
  const { toast } = useToast();
  const failed = (error: Error) => toast.show({ variant: "danger", label: error.message || c.unknownError });

  /** The sheet closes, then the new conversation is pushed over the list (a card, not a sheet). */
  const goTo = async (conversationId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
    router.back();
    router.push({ pathname: "/c/[conversationId]", params: { conversationId } });
  };

  const createBot = useMutation({
    mutationFn: () => api<{ id: string; conversationId: string }>("/agents", { method: "POST" }),
    onSuccess: async ({ conversationId }) => {
      await qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      await goTo(conversationId);
    },
    onError: failed,
  });

  const openDirect = useMutation({
    mutationFn: (body: { agentId: string } | { userId: string }) =>
      api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ id }) => goTo(id),
    onError: failed,
  });

  const createGroup = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/conversations/group", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || undefined,
          userIds: picked.flatMap((p) => (p.kind === "user" ? [p.person.id] : [])),
          agentIds: picked.flatMap((p) => (p.kind === "agent" ? [p.agent.id] : [])),
        }),
      }),
    onSuccess: ({ id }) => goTo(id),
    onError: failed,
  });

  const query = q.trim().toLowerCase();
  const matches = (p: Participant) => participantName(p).toLowerCase().includes(query);
  // A bot still being configured does not join groups.
  const bots: Participant[] = agents.filter((a) => !(groupMode && a.onboarding)).map((agent) => ({ kind: "agent", agent }));
  const colleagues: Participant[] = people.map((person) => ({ kind: "user", person }));
  const botsShown = bots.filter(matches);
  const colleaguesShown = colleagues.filter(matches);
  const isPicked = (p: Participant) => picked.some((x) => participantKey(x) === participantKey(p));
  const toggle = (p: Participant) => {
    Haptics.selectionAsync();
    setPicked((xs) => (isPicked(p) ? xs.filter((x) => participantKey(x) !== participantKey(p)) : [...xs, p]));
  };
  const canCreate = picked.length >= 2 && !createGroup.isPending;
  const busy = createBot.isPending || openDirect.isPending || createGroup.isPending;

  const row = (p: Participant) => {
    const key = participantKey(p);
    const pending = openDirect.isPending && key === (openDirect.variables && ("agentId" in openDirect.variables ? `a:${openDirect.variables.agentId}` : `u:${openDirect.variables.userId}`));
    return (
      <PressableItem
        key={key}
        isDisabled={busy}
        onPress={() => (groupMode ? toggle(p) : openDirect.mutate(p.kind === "agent" ? { agentId: p.agent.id } : { userId: p.person.id }))}
        accessibilityState={groupMode ? { checked: isPicked(p) } : undefined}
      >
        <ListGroup.ItemPrefix>
          <StatusAvatar p={p} size={40} />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>
            {participantName(p)}
          </ListGroup.ItemTitle>
          {p.kind === "user" && !!p.person.title && (
            <ListGroup.ItemDescription numberOfLines={1}>
              {p.person.title}
            </ListGroup.ItemDescription>
          )}
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          {groupMode ? <Checkbox isSelected={isPicked(p)} onSelectedChange={() => toggle(p)} /> : pending ? <Spinner size="sm" /> : <View />}
        </ListGroup.ItemSuffix>
      </PressableItem>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: groupMode ? t.newGroup : t.newConversation }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={groupMode ? headerIcon.chevronLeft : headerIcon.close} iconRenderingMode="template" accessibilityLabel={groupMode ? c.back : c.close} onPress={withTap(() => {
              if (!groupMode) return router.back();
              setGroupMode(false);
              setPicked([]);
              setQ("");
            })} />
      </Stack.Toolbar>
      {groupMode && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={createGroup.isPending ? c.creating : c.create} disabled={!canCreate} variant="prominent" onPress={withTap(() => createGroup.mutate())} />
        </Stack.Toolbar>
      )}
      <KeyboardAwareScrollView bottomOffset={24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        className="bg-background"
        contentContainerClassName="gap-6 p-4 pb-12"
      >
        {groupMode && (
          <TextField>
            <Label>{t.groupName}</Label>
            <Input value={title} onChangeText={setTitle} maxLength={80} placeholder={t.groupName} returnKeyType="done" />
          </TextField>
        )}

        <SearchField value={q} onChange={setQ}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder={groupMode ? t.groupMembers : t.searchOrCreate} autoCorrect={false} autoFocus={!groupMode} />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>

        {/* Who is in the group so far, in a row that scrolls sideways (HeroUI ScrollShadow). */}
        {groupMode && picked.length > 0 && (
          <ScrollShadow LinearGradientComponent={LinearGradient}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2">
              {picked.map((p) => (
                <Chip key={participantKey(p)} variant="secondary" color="default" accessibilityLabel={t.removeName(participantName(p))} onPress={() => toggle(p)}>
                  <ParticipantAvatar p={p} size={18} />
                  <Chip.Label>{participantName(p)}</Chip.Label>
                  <CloseIcon className="size-3.5 text-muted" />
                </Chip>
              ))}
            </ScrollView>
          </ScrollShadow>
        )}

        {!groupMode && !query && (
          <Section inset="ml-16">
            {me.role === "admin" && (
              <PressableItem key="bot" isDisabled={busy} onPress={() => createBot.mutate()}>
                <ListGroup.ItemPrefix>
                  <Avatar alt="" size="sm" variant="soft" color="accent" animation="disable-all">
                    <Avatar.Fallback>{createBot.isPending ? <Spinner size="sm" /> : <PlusIcon className="size-5 text-accent" />}</Avatar.Fallback>
                  </Avatar>
                </ListGroup.ItemPrefix>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle>{createBot.isPending ? t.creatingBot : t.createBot}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableItem>
            )}
            <PressableItem
              key="group"
              isDisabled={busy}
              onPress={() => {
                setGroupMode(true);
                setQ("");
              }}
            >
              <ListGroup.ItemPrefix>
                <Avatar alt="" size="sm" variant="soft" color="accent" animation="disable-all">
                  <Avatar.Fallback>
                    <UsersIcon className="size-5 text-accent" />
                  </Avatar.Fallback>
                </Avatar>
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t.createGroup}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </PressableItem>
          </Section>
        )}

        {botsShown.length > 0 && (
          <Section title={t.bots} inset="ml-16">
            {botsShown.map(row)}
          </Section>
        )}
        {colleaguesShown.length > 0 && (
          <Section title={t.colleagues} inset="ml-16" footer={groupMode && picked.length < 2 ? t.pickTwo : undefined}>
            {colleaguesShown.map(row)}
          </Section>
        )}
        {!botsShown.length && !colleaguesShown.length && (
          <Typography color="muted" align="center" className="px-6 py-12">
            {t.noMatch}
          </Typography>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
