import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { PressableFeedback, Typography } from "heroui-native";
import { View } from "react-native";
import { ConversationAvatar, ParticipantAvatar, useStatus } from "@/components/conversation-avatar";
import { infoHref } from "@/components/conversation/info-href";
import { conversationTitle, othersOf, type Participant } from "@/components/participants";
import { useHeaderTitleWidth } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";
import type { ConversationDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HeaderTitle as AppHeaderTitle } from "@/components/app-header";

/*
 * The title of the conversation's native header (web: the 46 px header of screens/Conversation.tsx,
 * Figma « Conversation · Dev »), on two lines for a phone: the face and the name, then in small type
 * what they are doing in its colour (a group's members as a small pile). The code sessions started
 * here are in the « … » menu: their count, truncated, crowded the line. A tap on the name opens the info screen.
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
}: {
  conversation?: ConversationDetail;
  me: string;
  title: string;
  label?: string;
  /** A bot waits for an approval: said instead of what it does. */
  waiting?: boolean;
}) {
  const t = messages;
  const group = conv?.kind === "group";
  const other = conv && !group ? othersOf(conv, me)[0] : undefined;
  const everyone = conv && group ? othersOf(conv, "") : [];
  const href = conv ? infoHref(conv, me) : null;
  // A phone's header is too narrow for the web's single line: the name on top, what is going on
  // under it in small type, both centred, as iOS stacks a title and its subtitle.
  const width = useHeaderTitleWidth(2);
  // A discussion says its project first, « Agora / », a tap away from the project's discussions.
  const { data: project } = useQuery({ ...conversationsQuery, enabled: !!conv?.parentId, select: (list) => list.find((c) => c.id === conv?.parentId) });
  return (
    <View style={{ maxWidth: width }} className="items-center">
      <View className="min-w-0 max-w-full flex-row items-center gap-1">
      {project && (
        <PressableFeedback
          onPress={withTap(() => router.push({ pathname: "/project/[projectId]", params: { projectId: project.id } }))}
          accessibilityRole="button"
          className="min-w-0 shrink flex-row items-center gap-1"
        >
          <Typography type="body-sm" color="muted" numberOfLines={1} className="shrink">
            {conversationTitle(project, me)}
          </Typography>
          <Typography type="body-sm" color="muted">
            /
          </Typography>
        </PressableFeedback>
      )}
      <PressableFeedback
        isDisabled={!href}
        onPress={withTap(() => href && router.push(href))}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="min-w-0 max-w-full flex-row items-center gap-1.5"
      >
        {conv && !group && <ConversationAvatar conversation={conv} me={me} className="size-5" />}
        <Typography type="body-sm" weight="semibold" numberOfLines={1} className="shrink">
          {title}
        </Typography>
      </PressableFeedback>
      </View>
      <View className="max-w-full flex-row items-center gap-2">
        {everyone.length > 0 && (
          <PressableFeedback isDisabled={!href} onPress={withTap(() => href && router.push(href))} accessibilityElementsHidden className="flex-row items-center">
            {everyone.slice(0, FACEPILE).map((p, i) => (
              <View key={p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`} className={cn(i > 0 && "-ml-1")}>
                <ParticipantAvatar p={p} size={14} />
              </View>
            ))}
            {everyone.length > FACEPILE && (
              <Typography type="body-xs" color="muted" className="pl-1 tabular-nums">
                +{everyone.length - FACEPILE}
              </Typography>
            )}
          </PressableFeedback>
        )}
        {waiting ? (
          <Typography type="body-xs" numberOfLines={1} className="shrink text-warning">
            {t.waitingYou}
          </Typography>
        ) : (
          other && <HeaderStatus p={other} />
        )}
      </View>
    </View>
  );
}

/** Colored like the avatar's dot: green when online, brand while a bot works, red when not to be disturbed, grey for "Seen…". */
function HeaderStatus({ p }: { p: Participant }) {
  const status = useStatus(p);
  if (!status) return null;
  return (
    <Typography type="body-xs" numberOfLines={1} className={cn("shrink", { online: "text-success", working: "text-brand", dnd: "text-danger", away: "text-subtle" }[status.tone])}>
      {status.label}
    </Typography>
  );
}

/** A participant for the status hook when there is no one else (a project): its status is never shown. */
const FALLBACK = { kind: "user", person: { id: "", name: "" } } as unknown as Participant;

const homeMessages = defineMessages({
  en: { members: (n: number) => `${n} member${n > 1 ? "s" : ""}` },
  fr: { members: (n: number) => `${n} membre${n > 1 ? "s" : ""}` },
});

/**
 * Figma « Mobile — ChatGPT 1:1 »: the home conversation's title, in the middle of its header (components/
 * app-header.tsx). The name with its chevron, then what is going on in small type: the bot waiting for
 * you in orange, a project's members, a person's status in its colour. A tap opens the info screen.
 */
export function HomeTitle({ conversation: conv, me, title, waiting }: { conversation?: ConversationDetail; me: string; title: string; waiting?: boolean }) {
  const group = conv?.kind === "group";
  const other = conv && !group ? othersOf(conv, me)[0] : undefined;
  const href = conv ? infoHref(conv, me) : null;
  const status = useStatus(other ?? FALLBACK);
  const subtitle = waiting ? messages.waitingYou : group && conv ? homeMessages.members(othersOf(conv, "").length) : other ? (status?.label ?? null) : null;
  const tone = waiting ? "text-warning" : group ? "text-muted" : status ? { online: "text-success", working: "text-brand", dnd: "text-danger", away: "text-subtle" }[status.tone] : "text-muted";
  return (
    <AppHeaderTitle
      title={title}
      subtitle={subtitle}
      subtitleClassName={cn("text-caption1", tone)}
      chevron={!!href}
      onPress={href ? () => router.push(href) : undefined}
    />
  );
}
