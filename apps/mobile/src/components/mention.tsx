import { useQuery } from "@tanstack/react-query";
import { Button, Popover } from "heroui-native";
import { useState, type ReactNode } from "react";
import { Text as NativeText, View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { PersonAvatar } from "@/components/conversation-avatar";
import { TaskRef } from "@/components/task-ref";
import { EntityText, InlineBox, ResetTextStyle, useEm } from "@/components/text-entities";
import { boxText } from "@/components/text-style";
import { withTap } from "@/lib/haptics";
import { defineMessages } from "@/lib/i18n";
import { splitMentions, type Mentionable, type MentionTarget } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { openAgentProfile, openProfile, useOpenDirect } from "@/lib/profile";
import { userProfileQuery } from "@/lib/queries";
import type { AgentSummary } from "@/lib/types";
import { splitTaskRefs } from "@/lib/task-refs";
import { usePopoverInsets } from "@/lib/popover-insets";
import { contentKeys } from "@/lib/utils";
import { useAdminToast } from "@/components/admin/ui";
import { safeColor } from "@/components/mention-style";

/*
 * apps/web/src/components/Mention.tsx and the components of apps/web/src/lib/mentions.tsx.
 * The card shown on hover on the web shows on a tap here, in a HeroUI Popover.
 */

const messages = defineMessages({
  en: { bot: "Bot", viewProfile: "View profile", message: "Send a message" },
  fr: { bot: "Bot", viewProfile: "Voir le profil", message: "Envoyer un message" },
});

/**
 * A "@Name" as the web's Mention: medium weight in the brand blue, bots and colleagues alike (the
 * bot's own colour is never used), no pill, no face; a tap shows their card.
 */
export function Mention({ text, target }: { text: string; color?: string; target?: MentionTarget }) {
  const insets = usePopoverInsets();
  const em = useEm();
  const [open, setOpen] = useState(false);
  const label = (
    <NativeText style={boxText(em, 1)} className="font-medium text-brand">
      {text}
    </NativeText>
  );
  if (!target) return <InlineBox>{label}</InlineBox>;
  return (
    <InlineBox>
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Popover.Trigger accessibilityRole="button" accessibilityLabel={text}>
          {label}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Overlay />
          <Popover.Content presentation="popover" placement="top" align="start" width={288} insets={insets} className="gap-3">
            <ResetTextStyle>
              {target.kind === "agent" ? (
                <AgentCard agent={target.agent} onClose={() => setOpen(false)} />
              ) : (
                <PersonCard person={target.person} onClose={() => setOpen(false)} />
              )}
            </ResetTextStyle>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </InlineBox>
  );
}

/** A bot's card: its avatar and name, its profile, a message to it. */
function AgentCard({ agent, onClose }: { agent: Extract<MentionTarget, { kind: "agent" }>["agent"]; onClose: () => void }) {
  const t = messages;
  const openDirect = useOpenDirect();
  const toast = useAdminToast();
  return (
    <>
      <View className="flex-row items-center gap-3">
        <AgentAvatar agent={agent} size={40} />
        <View className="min-w-0 flex-1">
          <Popover.Title numberOfLines={1}>{agent.name}</Popover.Title>
          <Popover.Description>{t.bot}</Popover.Description>
        </View>
      </View>
      {/* One button per row: side by side at the card's width, "Envoyer un message" wraps. */}
      <View className="gap-2">
        <Button
          variant="secondary"
          size="sm"
          onPress={withTap(() => {
            onClose();
            openAgentProfile(agent.id);
          })}
        >
          {t.viewProfile}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={openDirect.isPending}
          onPress={withTap(() => openDirect.mutate({ agentId: agent.id }, { onSuccess: onClose, onError: (e) => toast.failed(e) }))}
        >
          {t.message}
        </Button>
      </View>
    </>
  );
}

/** A colleague's card: avatar, name, role and handle, bio (fetched once the card is open), their profile. */
function PersonCard({ person, onClose }: { person: Extract<MentionTarget, { kind: "person" }>["person"]; onClose: () => void }) {
  const t = messages;
  const { data: profile } = useQuery(userProfileQuery(person.id));
  const title = profile?.title || person.title;
  return (
    <>
      <View className="flex-row items-center gap-3">
        <PersonAvatar person={person} size={40} />
        <View className="min-w-0 flex-1">
          <Popover.Title numberOfLines={1}>{person.name}</Popover.Title>
          <Popover.Description numberOfLines={1}>{[title, `@${person.handle}`].filter(Boolean).join(" · ")}</Popover.Description>
        </View>
      </View>
      {!!profile?.bio && <Popover.Description numberOfLines={3}>{profile.bio}</Popover.Description>}
      <Button
        variant="secondary"
        size="sm"
        onPress={withTap(() => {
          onClose();
          openProfile(person.id);
        })}
      >
        {t.viewProfile}
      </Button>
    </>
  );
}

/**
 * Plain text with colored mentions, each with its avatar and card, its links and paths marked.
 * `flat`: color only, to overlay the input field character for character: plain strings and nested
 * texts, which keep the size of the field's text. Hence React Native's Text there, the one exception
 * to Typography: Typography sets its own size and weight, which would shift the overlay off the text typed.
 */
export function MentionText({ text, mentionables, flat }: { text: string; mentionables: Mentionable[]; flat?: boolean }): ReactNode {
  if (!flat && text.includes("[[task:")) {
    const refs = splitTaskRefs(text);
    const refKeys = contentKeys(refs, (s) => (typeof s === "string" ? `t:${s}` : `r:${s.taskId}`));
    return (
      <>
        {refs.map((s, i) =>
          typeof s === "string" ? <MentionText key={refKeys[i]} text={s} mentionables={mentionables} /> : <TaskRef key={refKeys[i]} taskId={s.taskId} />,
        )}
      </>
    );
  }
  const segments = splitMentions(text, mentionables);
  const keys = contentKeys(segments, (s) => (typeof s === "string" ? `t:${s}` : `m:${s.text}`));
  return <>{segments.map((s, i) => {
    if (typeof s === "string") return flat ? s : <EntityText key={keys[i]} text={s} />;
    const color = safeColor(s.color);
    if (flat) {
      // Highlighted as on the web: medium weight in the brand blue, bots and colleagues alike.
      return (
        <NativeText key={keys[i]} className={color ? "font-medium text-brand" : undefined}>
          {s.text}
        </NativeText>
      );
    }
    return color ? <Mention key={keys[i]} text={s.text} color={color} target={s.target} /> : s.text;
  })}</>;
}

/**
 * The text of a field with every mention highlighted (colleagues, and bots: `bots` first, then all
 * the visible ones), as the field's children in place of `value`: a native field takes styled text
 * that way, and the highlight follows the text typed at the field's own size.
 */
export function MentionFieldText({ text, bots = NO_BOTS }: { text: string; bots?: AgentSummary[] }) {
  const mentionables = useMentionables(bots);
  return <MentionText text={text} mentionables={mentionables} flat />;
}

const NO_BOTS: AgentSummary[] = [];
