import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ListGroup } from "heroui-native";
import { ConversationAvatar } from "@/components/conversation-avatar";
import { conversationTitle } from "@/components/participants";
import { PressableItem, Section } from "@/components/people/section";
import { useMe } from "@/components/server-scope";
import { defineMessages } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";

/* CommonConversations of apps/web/src/components/ProfileSheet.tsx */

const messages = defineMessages({
  en: {
    common: (n: number) => `Conversations in common · ${n}`,
    members: (n: number) => `${n} members`,
  },
  fr: {
    common: (n: number) => `Conversations en commun · ${n}`,
    members: (n: number) => `${n} membres`,
  },
});

/** Group conversations you both belong to. */
export function CommonConversations({ userId }: { userId: string }) {
  const me = useMe();
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const shared = conversations.filter((c) => c.kind === "group" && c.members.some((m) => m.id === userId));
  if (!shared.length) return null;
  return (
    <Section title={messages.common(shared.length)} inset="ml-16">
      {shared.map((c) => (
        <Link key={c.id} href={{ pathname: "/c/[conversationId]", params: { conversationId: c.id } }} asChild>
          <PressableItem>
            <ListGroup.ItemPrefix>
              <ConversationAvatar conversation={c} me={me.id} className="size-10" />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle numberOfLines={1}>
                {conversationTitle(c, me.id)}
              </ListGroup.ItemTitle>
              <ListGroup.ItemDescription>{messages.members(c.members.length + c.agents.length)}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableItem>
        </Link>
      ))}
    </Section>
  );
}
