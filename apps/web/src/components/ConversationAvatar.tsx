import type { AgentSummary, Person } from "../lib/api";
import BoringAvatar from "boring-avatars";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { avatarShapes } from "../lib/agent-avatar";
import { othersOf, type Participant } from "@/lib/participants";
import { defineMessages, useT } from "@/i18n";
import { conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { presenceLabel } from "@/lib/dates";
import { availabilityLabel, availabilityTitle, isAway, useAvailability } from "@/lib/availability";
import { presenceQuery, useAgentWorking, useMinuteTick, usePresence } from "@/lib/presence";

const messages = defineMessages({
  en: { justYou: conversations.en.justYou, online: "Online", working: "Working", workingNow: "Working…" },
  fr: { justYou: conversations.fr.justYou, online: "En ligne", working: "Au travail", workingNow: "Au travail…" },
});

/** Colleague: photo if there is one, otherwise a marble generated from their id. */
export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  if (person.image) return <img src={person.image} alt="" className={cn("shrink-0 rounded-full object-cover", className ?? "size-10")} />;
  return <BoringAvatar variant="marble" name={person.id} size="100%" className={cn("shrink-0 rounded-full", className ?? "size-10")} aria-hidden />;
}

export function ParticipantAvatar({ p, className }: { p: Participant; className?: string }) {
  return p.kind === "agent" ? <AgentAvatar agent={p.agent} className={className} /> : <PersonAvatar person={p.person} className={className} />;
}

/**
 * Dot at the bottom right of an avatar: green when a colleague has the app open,
 * red with a bar while they're absent or in "do not disturb", pulsing when a bot is working on a reply. The ring takes the background color
 * of the place (`ring` class, e.g. `ring-sidebar`).
 */
export function StatusDot({ p, ring = "ring-background" }: { p: Participant; ring?: string }) {
  return p.kind === "agent" ? <AgentDot id={p.agent.id} ring={ring} /> : <PersonDot id={p.person.id} ring={ring} />;
}

const dot = "absolute bottom-0 right-0 size-[30%] min-h-2 min-w-2 rounded-full ring-2";

function PersonDot({ id, ring }: { id: string; ring: string }) {
  const t = useT(messages);
  const away = useAvailability(id);
  const online = usePresence(id).online;
  if (isAway(away))
    return (
      <span role="img" aria-label={availabilityTitle(away)!} className={cn(dot, ring, "flex items-center justify-center bg-destructive")}>
        <span className="h-[18%] min-h-px w-1/2 rounded-full bg-background" />
      </span>
    );
  if (!online) return null;
  return <span role="img" aria-label={t.online} className={cn(dot, ring, "bg-success")} />;
}

function AgentDot({ id, ring }: { id: string; ring: string }) {
  const t = useT(messages);
  if (!useAgentWorking(id)) return null;
  return <span role="img" aria-label={t.working} className={cn(dot, ring, "bg-brand motion-safe:animate-pulse")} />;
}

export type StatusTone = "online" | "working" | "away" | "dnd";

/**
 * "Online" / "Seen 5 min ago" for a colleague, or why they can't be disturbed ("On leave until…");
 * "Working…" for a busy bot, nothing for an idle bot; `tone` matches the status dot.
 */
export function useStatus(p: Participant): { label: string; tone: StatusTone } | null {
  const t = useT(messages);
  useMinuteTick();
  const presence = usePresence(p.kind === "user" ? p.person.id : "");
  const working = useAgentWorking(p.kind === "agent" ? p.agent.id : "");
  const available = useAvailability(p.kind === "user" ? p.person.id : "");
  if (p.kind === "agent") return working ? { label: t.workingNow, tone: "working" } : null;
  const away = availabilityLabel(available);
  if (away) return { label: away, tone: isAway(available) ? "dnd" : presence.online ? "online" : "away" };
  return { label: presenceLabel(presence), tone: presence.online ? "online" : "away" };
}

export const useStatusLabel = (p: Participant) => useStatus(p)?.label ?? null;

/** Avatar with its status dot. */
export function StatusAvatar({ p, className, ring }: { p: Participant; className?: string; ring?: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <ParticipantAvatar p={p} className={className} />
      <StatusDot p={p} ring={ring} />
    </span>
  );
}

/** One avatar for a direct conversation, two overlapping for a group. `status` (ring class) adds the status dot. */
export function ConversationAvatar({
  conversation,
  me,
  className,
  status,
}: {
  conversation: { kind: string; members: Person[]; agents: AgentSummary[] };
  me: string;
  className?: string;
  status?: string;
}) {
  const others = othersOf(conversation, me);
  if (conversation.kind !== "group" || others.length < 2) {
    const first = others[0];
    if (!first) return <span className={cn("shrink-0 rounded-full bg-secondary", className ?? "size-10")} />;
    return status ? <StatusAvatar p={first} className={className} ring={status} /> : <ParticipantAvatar p={first} className={className} />;
  }
  return (
    <span className={cn("relative shrink-0", className ?? "size-10")}>
      <span className="absolute left-0 top-0 size-[70%]" style={{ mask: cutout(others[1]!), WebkitMask: cutout(others[1]!) }} aria-hidden>
        <ParticipantAvatar p={others[0]!} className="size-full" />
      </span>
      <span aria-hidden>
        <ParticipantAvatar p={others[1]!} className="absolute bottom-0 right-0 size-[70%]" />
      </span>
      {status && <GroupWorkingDot agentIds={conversation.agents.map((a) => a.id)} ring={status} />}
    </span>
  );
}

/** In a group, the dot only says that one of its bots is working. */
function GroupWorkingDot({ agentIds, ring }: { agentIds: string[]; ring: string }) {
  const t = useT(messages);
  const ids = new Set(agentIds);
  const working = useQuery({ ...presenceQuery, select: (s) => s.workingAgents.some((id) => ids.has(id)) }).data;
  if (!working) return null;
  return <span role="img" aria-label={t.working} className={cn(dot, ring, "bg-brand motion-safe:animate-pulse")} />;
}

const circlePath = "M16 0a16 16 0 1 1 0 32a16 16 0 0 1 0-32Z";

/**
 * Cuts the back avatar along the silhouette of the front one, widened by a thin border,
 * whatever the background (hovered row, selected…); a colored ring would not follow it.
 * Coordinates: back avatar = 100 × 100, front one offset by 42.9 at the same scale (70% each).
 */
function cutout(front: Participant) {
  const d = front.kind === "agent" ? (avatarShapes[front.agent.avatar.shape] ?? avatarShapes.bean) : circlePath;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><mask id='m'>" +
    "<rect width='100' height='100' fill='white'/>" +
    `<path d='${d}' transform='translate(42.9 42.9) scale(3.125)' fill='black' stroke='black' stroke-width='5' stroke-linejoin='round'/>` +
    "</mask></defs><rect width='100' height='100' mask='url(#m)'/></svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`;
}
