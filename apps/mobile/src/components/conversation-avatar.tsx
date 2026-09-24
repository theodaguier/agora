import MaskedView from "@react-native-masked-view/masked-view";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Avatar } from "heroui-native";
import { useEffect, useState, type ReactNode } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, Defs, Mask, Path, Rect } from "react-native-svg";
import { useResolveClassNames } from "uniwind";
import { AgentAvatar, useSize } from "@/components/agent-avatar";
import { avatarShapes } from "@/components/agent-avatar-shapes";
import { Marble } from "@/components/marble";
import { apiUrl, authHeaders } from "@/lib/api";
import { availabilityLabel, isAway, useAvailability } from "@/lib/availability";
import { presenceLabel } from "@/lib/dates";
import { defineMessages } from "@/lib/i18n";
import { presenceQuery, useAgentWorking, useMinuteTick, usePresence } from "@/lib/presence";
import type { AgentSummary, Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Participant, othersOf } from "@/components/participants";

/* apps/web/src/components/ConversationAvatar.tsx */

/** Colleague: photo if there is one (HeroUI Avatar.Image), otherwise a marble generated from their id (Avatar.Fallback). */
export function PersonAvatar({ person, className, size: px }: { person: Person; className?: string; size?: number }) {
  const resolved = useSize(className ?? "size-10", 40);
  const size = px ?? resolved;
  return (
    <Avatar alt={person.name} variant="soft" color="default" className={cn("shrink-0", className)} style={{ width: size, height: size }}>
      {!!person.image && (
        <Avatar.Image source={{ uri: apiUrl(person.image.replace(/^\/api/, "")), headers: authHeaders() }} asChild>
          <Image style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" />
        </Avatar.Image>
      )}
      <Avatar.Fallback animation="disabled">
        <Marble name={person.id} size={size} />
      </Avatar.Fallback>
    </Avatar>
  );
}

export function ParticipantAvatar({ p, className, size }: { p: Participant; className?: string; size?: number }) {
  return p.kind === "agent" ? <AgentAvatar agent={p.agent} className={className} size={size} /> : <PersonAvatar person={p.person} className={className} size={size} />;
}

const messages = defineMessages({
  en: { workingNow: "Working…" },
  fr: { workingNow: "Au travail…" },
});

export type StatusTone = "online" | "working" | "away" | "dnd";

/**
 * "Online" / "Seen 5 min ago" for a colleague, or why they can't be disturbed ("On leave until…");
 * "Working…" for a busy bot, nothing for an idle bot; `tone` matches the status dot.
 */
export function useStatus(p: Participant): { label: string; tone: StatusTone } | null {
  useMinuteTick();
  const presence = usePresence(p.kind === "user" ? p.person.id : "");
  const working = useAgentWorking(p.kind === "agent" ? p.agent.id : "");
  const available = useAvailability(p.kind === "user" ? p.person.id : "");
  if (p.kind === "agent") return working ? { label: messages.workingNow, tone: "working" } : null;
  const away = availabilityLabel(available);
  if (away) return { label: away, tone: isAway(available) ? "dnd" : presence.online ? "online" : "away" };
  return { label: presenceLabel(presence), tone: presence.online ? "online" : "away" };
}

/**
 * A plain colored dot (SVG, like the icons: HeroUI has no badge): `color` is a text color class
 * (`text-success`), `bar` the white bar of "do not disturb". The unread dot of the lists and the
 * status dot of the avatars.
 */
export function ColorDot({ size, color, bar }: { size: number; color: string; bar?: boolean }) {
  const fill = (useResolveClassNames(color) as { color?: string }).color ?? "#000";
  const barColor = (useResolveClassNames("text-danger-foreground") as { color?: string }).color ?? "#fff";
  const r = size / 2;
  const thickness = Math.max(1.5, size * 0.18);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r} fill={fill} />
      {bar && <Rect x={r / 2} y={r - thickness / 2} width={r} height={thickness} rx={thickness / 2} fill={barColor} />}
    </Svg>
  );
}

type DotSpec = { color: string; bar?: boolean; pulse?: boolean };

const working: DotSpec = { color: "text-accent", pulse: true };

/** The dot of a participant: green when online, red with a bar when away, accent while a bot works. */
function useDot(p: Participant): DotSpec | null {
  const away = useAvailability(p.kind === "user" ? p.person.id : "");
  const online = usePresence(p.kind === "user" ? p.person.id : "").online;
  const busy = useAgentWorking(p.kind === "agent" ? p.agent.id : "");
  if (p.kind === "agent") return busy ? working : null;
  if (isAway(away)) return { color: "text-danger", bar: true };
  return online ? { color: "text-success" } : null;
}

/** 30% of the avatar, never below 8pt. */
const dotSize = (avatar: number) => Math.max(8, Math.round(avatar * 0.3));

/*
 * The avatar with its status dot, as in iOS: the dot sits on the circle's edge at 45° and bites
 * a transparent notch into the avatar (a mask, not a ring painted in some background color), so it
 * reads right on any background, a list row as well as the header's glass. The mask is always
 * there, only its hole comes and goes: the avatar isn't remounted when the status changes.
 * A working bot's dot breathes.
 */
function Notched({ size, dot, dotPx = dotSize(size), children }: { size: number; dot: DotSpec | null; dotPx?: number; children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const pulse = !!dot?.pulse;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [pulse, opacity]);
  const center = (size * (1 + Math.SQRT1_2)) / 2;
  const hole = dotPx / 2 + 2;
  const box = `M0 0H${size}V${size}H0Z`;
  const notch = dot ? `M${center - hole} ${center}a${hole} ${hole} 0 1 0 ${hole * 2} 0a${hole} ${hole} 0 1 0 ${-hole * 2} 0Z` : "";
  return (
    <View className="shrink-0" style={{ width: size, height: size }}>
      <MaskedView
        style={{ width: size, height: size }}
        maskElement={
          <Svg width={size} height={size}>
            <Path d={box + notch} fillRule="evenodd" fill="black" />
          </Svg>
        }
      >
        {children}
      </MaskedView>
      {dot && (
        <Animated.View pointerEvents="none" className="absolute" style={{ left: center - dotPx / 2, top: center - dotPx / 2, opacity }}>
          <ColorDot size={dotPx} color={dot.color} bar={dot.bar} />
        </Animated.View>
      )}
    </View>
  );
}

/** A participant's avatar with its status dot (presence, leave, a bot at work). */
export function StatusAvatar({ p, size }: { p: Participant; size: number }) {
  return (
    <Notched size={size} dot={useDot(p)}>
      <ParticipantAvatar p={p} size={size} />
    </Notched>
  );
}

/** In a group, the dot only says that one of its bots is working. */
function useGroupDot(agentIds: string[]): DotSpec | null {
  const busy = useQuery({ ...presenceQuery, select: (s) => s.workingAgents.some((id) => agentIds.includes(id)) }).data;
  return busy ? working : null;
}

const circlePath = "M16 0a16 16 0 1 1 0 32a16 16 0 0 1 0-32Z";

/** One avatar for a direct conversation, two overlapping for a group. `status` adds the status dot. */
export function ConversationAvatar({
  conversation,
  me,
  className,
  status,
}: {
  conversation: { kind: string; members: Person[]; agents: AgentSummary[] };
  me: string;
  className?: string;
  status?: boolean;
}) {
  const size = useSize(className ?? "size-10", 40);
  const others = othersOf(conversation, me);
  if (conversation.kind !== "group" || others.length < 2) {
    const first = others[0];
    if (!first) return <Avatar alt="" variant="soft" color="default" animation="disable-all" className="shrink-0" style={{ width: size, height: size }} />;
    return status ? <StatusAvatar p={first} size={size} /> : <ParticipantAvatar p={first} size={size} />;
  }
  return <GroupAvatar others={others} agentIds={conversation.agents.map((a) => a.id)} size={size} status={status} />;
}

function GroupAvatar({ others, agentIds, size, status }: { others: Participant[]; agentIds: string[]; size: number; status?: boolean }) {
  const dot = useGroupDot(status ? agentIds : []);
  // The back avatar is cut along the silhouette of the front one, widened by a thin border.
  const small = size * 0.7;
  const front = others[1]!;
  const d = front.kind === "agent" ? (avatarShapes[front.agent.avatar.shape] ?? avatarShapes.bean) : circlePath;
  return (
    <View className="relative shrink-0" style={{ width: size, height: size }}>
      <MaskedView
        style={{ position: "absolute", left: 0, top: 0, width: small, height: small }}
        maskElement={
          <Svg width={small} height={small} viewBox="0 0 100 100">
            <Defs>
              <Mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                <Rect width="100" height="100" fill="white" />
                <Path d={d} transform="translate(42.9 42.9) scale(3.125)" fill="black" stroke="black" strokeWidth={5} strokeLinejoin="round" />
              </Mask>
            </Defs>
            <Rect width="100" height="100" fill="black" mask="url(#cut)" />
          </Svg>
        }
      >
        <ParticipantAvatar p={others[0]!} size={small} />
      </MaskedView>
      <View className="absolute right-0 bottom-0" style={{ width: small, height: small }}>
        {status ? (
          <Notched size={small} dot={dot} dotPx={dotSize(size)}>
            <ParticipantAvatar p={front} size={small} />
          </Notched>
        ) : (
          <ParticipantAvatar p={front} size={small} />
        )}
      </View>
    </View>
  );
}
