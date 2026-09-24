import { router } from "expo-router";
import { Chip, PressableFeedback, Typography } from "heroui-native";
import { View } from "react-native";
import { ConversationAvatar, useStatus } from "@/components/conversation-avatar";
import { othersOf, type Participant } from "@/components/participants";
import { withTap } from "@/lib/haptics";
import type { ConversationDetail } from "@/lib/types";
import { infoHref } from "@/components/conversation/info-href";

/*
 * The title of the conversation's native header, as in iOS Messages: the avatar, the name and, for
 * a direct conversation, the colleague's presence or the bot's activity. A tap opens the info
 * screen (members of a group, the colleague's profile, the bot's page).
 */

export function HeaderTitle({ conversation: conv, me, title, label }: { conversation?: ConversationDetail; me: string; title: string; label?: string }) {
  const group = conv?.kind === "group";
  const other = conv && !group ? othersOf(conv, me)[0] : undefined;
  const href = conv ? infoHref(conv, me) : null;
  return (
    <PressableFeedback
      isDisabled={!href}
      onPress={withTap(() => href && router.push(href))}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="max-w-64 flex-row items-center gap-2"
    >
      {conv && <ConversationAvatar conversation={conv} me={me} className="size-8" status />}
      <View className="min-w-0 shrink">
        <Typography weight="semibold" numberOfLines={1}>
          {title}
        </Typography>
        {other ? (
          <Status p={other} />
        ) : (
          group && (
            <Typography type="body-xs" color="muted" numberOfLines={1}>
              {othersOf(conv, me)
                .map((o) => (o.kind === "agent" ? o.agent.name : o.person.name.split(" ")[0]))
                .join(", ")}
            </Typography>
          )
        )}
      </View>
    </PressableFeedback>
  );
}

/** A chip colored like the avatar's dot: green when online, accent while a bot works, neutral for "Seen…". */
function Status({ p }: { p: Participant }) {
  const status = useStatus(p);
  if (!status) return null;
  return (
    <Chip size="sm" variant="soft" color={({ online: "success", working: "accent", away: "default", dnd: "danger" } as const)[status.tone]} className="self-start">
      <Chip.Label numberOfLines={1}>{status.label}</Chip.Label>
    </Chip>
  );
}
