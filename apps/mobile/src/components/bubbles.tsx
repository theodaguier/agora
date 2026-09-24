import { useQuery } from "@tanstack/react-query";
import { Chip, Spinner, Surface, Typography } from "heroui-native";
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { BrandLogo } from "@/components/brand-logo";
import { brandsQuery, toolServer } from "@/components/brand-logos";
import { CheckIcon, ClockIcon, ToolIcon } from "@/components/icons";
import { MessageText } from "@/components/message-text";
import { defineMessages } from "@/lib/i18n";
import type { Mentionable } from "@/lib/mentions";
import { cn } from "@/lib/utils";

/*
 * apps/web/src/components/Bubbles.tsx: HeroUI surfaces as bubbles, in the web's neutral grays —
 * yours on the right a shade darker, everyone else's (colleagues and bots) on the left.
 */

const messages = defineMessages({
  en: { using: "Using", used: "Used", and: "and" },
  fr: { using: "Utilise", used: "A utilisé", and: "et" },
});

/**
 * A bubble: HeroUI's Surface, `secondary` for everyone else's (colleagues and bots), `tertiary` for
 * yours, the web's two grays.
 */
export function Bubble({ mine, className, children }: { mine?: boolean; className?: string; children: ReactNode }) {
  return (
    <Surface variant={mine ? "tertiary" : "secondary"} className={cn("min-w-0", mine ? "self-end" : "self-start", className)}>
      {children}
    </Surface>
  );
}

export function BotBubble({ text, streaming, mentionables, className }: { text: string; streaming?: boolean; mentionables?: Mentionable[]; className?: string }) {
  return (
    <Bubble className={cn("px-3.5 py-2", className)}>
      <MessageText text={text} streaming={streaming} mentionables={mentionables} className="min-w-0" />
    </Bubble>
  );
}

export function UserBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <Bubble mine className={cn("px-3.5 py-2", className)}>
      <MessageText plain text={text} mentionables={mentionables} className="min-w-0" />
    </Bubble>
  );
}

/** Message from another employee, left-aligned. */
export function PeerBubble({ text, mentionables, className }: { text: string; mentionables?: Mentionable[]; className?: string }) {
  return (
    <Bubble className={cn("px-3.5 py-2", className)}>
      <MessageText plain text={text} mentionables={mentionables} className="min-w-0" />
    </Bubble>
  );
}

/** One dot of the typing indicator, each one 120 ms after the previous. */
function BounceDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(delay, withRepeat(withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })), -1)));
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={style}>
      <Typography color="muted" weight="bold">
        •
      </Typography>
    </Animated.View>
  );
}

export function TypingBubble({ label }: { label: string }) {
  return (
    <Bubble className="px-3.5 py-1">
      <View accessibilityLabel={label} className="flex-row gap-1">
        {[0, 1, 2].map((d) => (
          <BounceDot key={d} delay={d * 120} />
        ))}
      </View>
    </Bubble>
  );
}

/** Tools used by the agent during a reply (hermes.tool.progress events). */
export function ToolLine({ tools, running }: { tools: { name: string; status: string }[]; running?: boolean }) {
  const t = messages;
  const { data: brands } = useQuery(brandsQuery);
  const servers = Object.keys(brands?.servers ?? {});
  const names = [...new Set(tools.map((tool) => tool.name))];
  if (!names.length) return null;
  return (
    <View className="my-0.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-1 self-start">
      {running ? <Spinner size="sm" /> : <CheckIcon className="size-4 text-muted" />}
      <Typography color="muted">
        {running ? t.using : t.used}
      </Typography>
      {names.map((n) => (
        <Chip key={n} size="sm" variant="secondary" color="default">
          <BrandLogo server={toolServer(n, servers)} fallback={<ToolIcon name={n} className="size-3.5 text-muted" />} className="size-3.5 rounded-[3px]" />
          <Chip.Label>{n}</Chip.Label>
        </Chip>
      ))}
    </View>
  );
}

export function EventLine({ label, routines }: { label: string; routines: string[] }) {
  const t = messages;
  return (
    <View className="my-2 flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-6">
      <Typography color="muted" align="center" >
        {label}
      </Typography>
      {routines.map((r, i) => (
        <View key={r} className="flex-row items-center gap-1.5">
          {i > 0 && (
            <Typography color="muted">
              {t.and}
            </Typography>
          )}
          <ClockIcon className="size-3.5 text-muted" />
          <Typography weight="medium">
            {r}
          </Typography>
        </View>
      ))}
    </View>
  );
}

/** "Today 11:45" between two runs of messages, as iOS Messages centers it. */
export function DateDivider({ label }: { label: string }) {
  return (
    <Typography color="muted" align="center" weight="medium" className="mt-4 mb-1">
      {label}
    </Typography>
  );
}

/** Something that happened in the conversation (joined, renamed…): centered, small, muted. */
export function SystemEvent({ label }: { label: string }) {
  return (
    <Typography color="muted" align="center" className="my-2 px-8">
      {label}
    </Typography>
  );
}

/** Author at the start of a run of messages, in a group: above the bubble, like iOS Messages. */
export function AuthorLine({ avatar, name }: { avatar: ReactNode; name: string }) {
  return (
    <View className="mt-3 flex-row items-center gap-1.5 pl-1">
      {avatar}
      <Typography color="muted">
        {name}
      </Typography>
    </View>
  );
}
