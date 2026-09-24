import { common, conversations as conversationMessages } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, router, Stack, type Href } from "expo-router";
import { Button, ListGroup, Separator, SkeletonGroup, Typography } from "heroui-native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ConversationAvatar, StatusAvatar } from "@/components/conversation-avatar";
import { conversationTitle, type Participant } from "@/components/participants";
import { PressableItem, Section } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { agentsQuery, conversationsQuery, usersQuery } from "@/lib/queries";

/*
 * Search across the colleagues, the bots and your conversations, by name, handle and title.
 * The API has no message search: conversations match on their title and participants.
 * With nothing typed, the tab is the directory of bots and colleagues.
 */

const messages = defineMessages({
  en: {
    title: "Search",
    placeholder: "People, Bots, conversations",
    bots: "Bots",
    colleagues: "Colleagues",
    conversations: "Conversations",
    noMatch: "No one matches.",
  },
  fr: {
    title: "Rechercher",
    placeholder: "Personnes, Bots, conversations",
    bots: "Bots",
    colleagues: "Collègues",
    conversations: "Conversations",
    noMatch: "Personne ne correspond.",
  },
});

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function Search() {
  const me = useMe();
  const t = { ...messages, search: tr(common).search, newConversation: tr(conversationMessages).newConversation };
  const [q, setQ] = useState("");
  const { data: agents = [], isPending: agentsPending } = useQuery(agentsQuery);
  const { data: people = [], isPending: peoplePending } = useQuery(usersQuery);
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const query = fold(q.trim());

  const results = useMemo(() => {
    const has = (...fields: (string | null | undefined)[]) => !query || fields.some((f) => !!f && fold(f).includes(query));
    return {
      bots: agents.filter((a) => has(a.name)),
      people: people.filter((p) => has(p.name, p.username, p.title)),
      // Only once something is typed: the Chats tab already lists them all.
      conversations: query
        ? conversations.filter((c) => has(conversationTitle(c, me.id), ...c.members.map((m) => m.name), ...c.agents.map((a) => a.name)))
        : [],
    };
  }, [agents, people, conversations, query, me.id]);
  const empty = !results.bots.length && !results.people.length && !results.conversations.length;

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.SearchBar
        placeholder={t.placeholder}
        autoFocus
        autoCapitalize="none"
        onChangeText={(e) => setQ(e.nativeEvent.text)}
        onCancelButtonPress={() => setQ("")}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 px-4 pb-12 pt-2"
      >
        {results.conversations.length > 0 && (
          <Section title={t.conversations} inset="ml-16">
            {results.conversations.map((c) => (
              <ResultRow
                key={c.id}
                href={{ pathname: "/c/[conversationId]", params: { conversationId: c.id } }}
                avatar={<ConversationAvatar conversation={c} me={me.id} className="size-10" status />}
                title={conversationTitle(c, me.id)}
              />
            ))}
          </Section>
        )}
        {results.bots.length > 0 && (
          <Section title={t.bots} inset="ml-16">
            {results.bots.map((agent) => (
              <ResultRow
                key={agent.id}
                href={{ pathname: "/agents/[agentId]", params: { agentId: agent.id } }}
                avatar={<Avatar p={{ kind: "agent", agent }} />}
                title={agent.name}
              />
            ))}
          </Section>
        )}
        {results.people.length > 0 && (
          <Section title={t.colleagues} inset="ml-16">
            {results.people.map((person) => (
              <ResultRow
                key={person.id}
                href={{ pathname: "/people/[userId]", params: { userId: person.id } }}
                avatar={<Avatar p={{ kind: "user", person }} />}
                title={person.name}
                subtitle={[person.title, person.username && `@${person.username}`].filter(Boolean).join(" · ")}
              />
            ))}
          </Section>
        )}
        {empty && !query && (agentsPending || peoplePending) && (
          <ListGroup>
            {[0, 1, 2].map((i) => (
              <View key={i}>
                {i > 0 && <Separator className="ms-16 me-4" />}
                <SkeletonGroup isLoading isSkeletonOnly className="flex-row items-center gap-3 p-4">
                  <SkeletonGroup.Item className="size-10 rounded-full" />
                  <SkeletonGroup.Item className="h-4 w-1/2 rounded-md" />
                </SkeletonGroup>
              </View>
            ))}
          </ListGroup>
        )}
        {empty && !!query && (
          <View className="items-center gap-4 px-6 py-12">
            <Typography color="muted" align="center">
              {t.noMatch}
            </Typography>
            <Button variant="secondary" onPress={withTap(() => router.push("/new"))}>
              {t.newConversation}
            </Button>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Avatar({ p }: { p: Participant }) {
  return (
    <StatusAvatar p={p} size={40} />
  );
}

function ResultRow({ href, avatar, title, subtitle }: { href: Href; avatar: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Link href={href} asChild>
      <Link.Trigger>
        <PressableItem>
          <ListGroup.ItemPrefix>{avatar}</ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>
              {title}
            </ListGroup.ItemTitle>
            {!!subtitle && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {subtitle}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </PressableItem>
      </Link.Trigger>
      <Link.Preview />
    </Link>
  );
}
