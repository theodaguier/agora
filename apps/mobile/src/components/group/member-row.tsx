import { useQuery } from "@tanstack/react-query";
import { Link, type Href } from "expo-router";
import { ListGroup } from "heroui-native";
import { StatusAvatar, useStatus } from "@/components/conversation-avatar";
import { type Participant } from "@/components/participants";
import { PressableItem } from "@/components/people/section";
import { useCurrentTaskTitle } from "@/components/people/working-on";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { usersQuery } from "@/lib/queries";

/* Row of apps/web/src/components/MembersPanel.tsx */

const messages = defineMessages({
  en: { openProfile: "See profile and tasks", remove: "Remove from the group" },
  fr: { openProfile: "Voir le profil et les tâches", remove: "Retirer du groupe" },
});

const AVATAR = 40;

/**
 * A member of the group: avatar with status, name, and a hint (creator, role, status, current task).
 * Tap opens their profile; long press previews it, with "Remove" when you may remove them.
 */
export function MemberRow({ p, name, hint, onRemove }: { p: Participant; name: string; hint?: string; onRemove?: () => void }) {
  const personId = p.kind === "user" ? p.person.id : null;
  const working = useCurrentTaskTitle(personId);
  const { data: people = [] } = useQuery(usersQuery);
  /** Their role (developer, spouse…), as set on their profile. */
  const role = personId ? people.find((u) => u.id === personId)?.title : undefined;
  const status = useStatus(p)?.label;
  const description = [hint, role, status, working].filter(Boolean).join(" · ");
  const href: Href =
    p.kind === "agent"
      ? { pathname: "/agents/[agentId]", params: { agentId: p.agent.id } }
      : { pathname: "/people/[userId]", params: { userId: p.person.id } };

  return (
    <Link href={href} asChild>
      <Link.Trigger>
        <PressableItem accessibilityHint={messages.openProfile}>
          <ListGroup.ItemPrefix>
            <StatusAvatar p={p} size={AVATAR} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>
              {name}
            </ListGroup.ItemTitle>
            {!!description && (
              <ListGroup.ItemDescription numberOfLines={1}>
                {description}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </PressableItem>
      </Link.Trigger>
      <Link.Preview />
      {onRemove && (
        <Link.Menu>
          <Link.MenuAction icon="person.crop.circle.badge.minus" destructive onPress={withTap(onRemove)}>
            {messages.remove}
          </Link.MenuAction>
        </Link.Menu>
      )}
    </Link>
  );
}
