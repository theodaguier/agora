import type { ReactNode } from "react";
import { Chip, Popover, Typography } from "heroui-native";
import { View } from "react-native";
import { StatusAvatar, useStatus, type StatusTone } from "@/components/conversation-avatar";
import { type Participant } from "@/components/participants";
import { defineMessages } from "@/lib/i18n";

const AVATAR = 96;

const messages = defineMessages({
  en: {
    statusHelp: "What this status means",
    tone: {
      online: "Active in the app right now.",
      away: "Not in the app right now: your message will wait for them.",
      dnd: "Unavailable for now: an answer may only come once they're back.",
      working: "Answering in a conversation right now.",
    } as Record<StatusTone, string>,
  },
  fr: {
    statusHelp: "Ce que veut dire ce statut",
    tone: {
      online: "Actif dans l'app en ce moment.",
      away: "Pas dans l'app en ce moment : ton message l'attendra.",
      dnd: "Indisponible pour l'instant : la réponse viendra peut-être à son retour.",
      working: "Répond dans une conversation en ce moment.",
    },
  },
});

/** One Chip color per status, as the avatar's dot. */
const toneColor = { online: "success", away: "default", dnd: "danger", working: "accent" } as const;

/**
 * Top of a profile, like an iOS contact card: big HeroUI Avatar with its status dot, name,
 * subtitle, and the status as a Chip whose Popover says what it means. `children`: the actions.
 */
export function ProfileHeader({ p, name, subtitle, children }: { p: Participant; name: string; subtitle?: string | null; children?: ReactNode }) {
  const status = useStatus(p);
  return (
    <View className="items-center gap-1 px-4 pt-2">
      <View className="mb-2">
        <StatusAvatar p={p} size={AVATAR} />
      </View>
      <Typography.Heading type="h3" align="center" numberOfLines={2}>
        {name}
      </Typography.Heading>
      {!!subtitle && (
        <Typography.Paragraph type="body-sm" color="muted" align="center" numberOfLines={2}>
          {subtitle}
        </Typography.Paragraph>
      )}
      {!!status && (
        <Popover>
          <Popover.Trigger asChild>
            <Chip size="sm" variant="soft" color={toneColor[status.tone]} className="mt-1" accessibilityHint={messages.statusHelp}>
              <Chip.Label numberOfLines={1}>{status.label}</Chip.Label>
            </Chip>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Overlay />
            <Popover.Content presentation="popover" width={280} placement="bottom" className="gap-1 px-5 py-4">
              <Popover.Title>{status.label}</Popover.Title>
              <Popover.Description>{messages.tone[status.tone]}</Popover.Description>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      )}
      {children}
    </View>
  );
}
