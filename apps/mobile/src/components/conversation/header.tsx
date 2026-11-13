import { codeSessions } from "@agora/core/i18n";
import { router } from "expo-router";
import { PressableFeedback, Typography } from "heroui-native";
import { View } from "react-native";
import { useCodeSessions } from "@/components/code-session";
import { ConversationAvatar, ParticipantAvatar, useStatus } from "@/components/conversation-avatar";
import { infoHref } from "@/components/conversation/info-href";
import { othersOf, type Participant } from "@/components/participants";
import { Shimmer } from "@/components/shimmer";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import type { ConversationDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * The title of the conversation's native header (web: the 46 px header of screens/Conversation.tsx,
 * Figma « Conversation · Dev »): the face and the name on one line, what they are doing after it in its
 * colour; a group's members as a small pile. A tap opens the info screen (members of a group, the
 * colleague's profile, the bot's page). The code sessions started here follow as their count in grey,
 * which opens their list.
 */

const messages = defineMessages({
  en: { waitingYou: "Waits for your answer" },
  fr: { waitingYou: "Attend ta réponse" },
});

/** Faces of the pile; the others as "+N". */
const FACEPILE = 3;

export function HeaderTitle({
  conversation: conv,
  me,
  title,
  label,
  waiting,
  onSessions,
}: {
  conversation?: ConversationDetail;
  me: string;
  title: string;
  label?: string;
  /** A bot waits for an approval: said instead of what it does. */
  waiting?: boolean;
  /** Opens the list of the conversation's code sessions. */
  onSessions?: () => void;
}) {
  const t = messages;
  const group = conv?.kind === "group";
  const other = conv && !group ? othersOf(conv, me)[0] : undefined;
  const everyone = conv && group ? othersOf(conv, "") : [];
  const href = conv ? infoHref(conv, me) : null;
  return (
    <View className="max-w-72 flex-row items-center gap-2">
      <PressableFeedback
        isDisabled={!href}
        onPress={withTap(() => href && router.push(href))}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="min-w-0 shrink flex-row items-center gap-2"
      >
        {/* A group's members are the pile after its name: no tile repeating them. */}
        {conv && !group && <ConversationAvatar conversation={conv} me={me} className="size-5" />}
        <Typography weight="medium" numberOfLines={1} className="shrink">
          {title}
        </Typography>
        {waiting ? (
          <Typography numberOfLines={1} className="shrink text-warning">
            {t.waitingYou}
          </Typography>
        ) : (
          other && <HeaderStatus p={other} />
        )}
        {everyone.length > 0 && (
          <View className="flex-row items-center">
            {everyone.slice(0, FACEPILE).map((p, i) => (
              <View key={p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`} className={cn(i > 0 && "-ml-1")}>
                <ParticipantAvatar p={p} size={18} />
              </View>
            ))}
            {everyone.length > FACEPILE && (
              <Typography type="body-xs" color="muted" className="pl-1 tabular-nums">
                +{everyone.length - FACEPILE}
              </Typography>
            )}
          </View>
        )}
      </PressableFeedback>
      {conv && onSessions && <SessionsCount conversationId={conv.id} onPress={onSessions} />}
    </View>
  );
}

/** Colored like the avatar's dot: green when online, brand while a bot works, red when not to be disturbed, grey for "Seen…". */
function HeaderStatus({ p }: { p: Participant }) {
  const status = useStatus(p);
  if (!status) return null;
  return (
    <Typography numberOfLines={1} className={cn("shrink", { online: "text-success", working: "text-brand", dnd: "text-danger", away: "text-subtle" }[status.tone])}>
      {status.label}
    </Typography>
  );
}

/** The code sessions started here, as their count in grey (web: CodeSessionsButton asCount); a light passes over it while one works. */
function SessionsCount({ conversationId, onPress }: { conversationId: string; onPress: () => void }) {
  const t = tr(codeSessions);
  const sessions = useCodeSessions(conversationId);
  if (!sessions) return null;
  const working = sessions.some((s) => s.status === "running");
  const count = t.sessionsCount(sessions.length);
  return (
    <PressableFeedback onPress={withTap(onPress)} accessibilityRole="button" accessibilityLabel={working ? t.sessionsWorking : t.sessions} className="shrink-0">
      {working ? (
        <Shimmer type="body">{count}</Shimmer>
      ) : (
        <Typography numberOfLines={1} className="text-subtle">
          {count}
        </Typography>
      )}
    </PressableFeedback>
  );
}
