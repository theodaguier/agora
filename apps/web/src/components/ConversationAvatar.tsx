import type { AgentSummary, Person } from "../lib/api";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./AgentAvatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, othersOf, type Participant } from "@/lib/participants";
import { FolderIcon } from "@/components/icons";
import { defineMessages, useT } from "@/i18n";
import { conversations } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { personTint } from "@agora/core";
import { presenceLabel } from "@/lib/dates";
import { availabilityLabel, availabilityTitle, isAway, useAvailability } from "@/lib/availability";
import { presenceQuery, useAgentWorking, useMinuteTick, usePresence } from "@/lib/presence";

const messages = defineMessages({
  en: { justYou: conversations.en.justYou, online: "Online", working: "Working", workingNow: "Working…" },
  fr: { justYou: conversations.fr.justYou, online: "En ligne", working: "Au travail", workingNow: "Au travail…" },
});

/**
 * Colleague: photo if there is one, otherwise their initials (never a coloured gradient).
 * `size` picks a stock Avatar size; `className` carries a `size-*` the stock sizes don't cover.
 */
/** The stock Avatar size matching a `size-*` layout class, so the initials keep the right text size. */
function avatarSize(className?: string): "sm" | "default" | "lg" {
  const px = Number(/\bsize-(\d+(?:\.\d+)?)\b/.exec(className ?? "")?.[1] ?? 10);
  // sm is exactly 24 px and lg 40 px: any other size is the class itself, over the default.
  return px === 6 ? "sm" : px === 10 ? "lg" : "default";
}
/** Below 24 px the initials shrink with the face (Figma: 8 px in a 16 to 20 px avatar). */
const tiny = (className?: string) => Number(/\bsize-(\d+(?:\.\d+)?)\b/.exec(className ?? "")?.[1] ?? 10) < 6;

export function PersonAvatar({ person, className, size }: { person: Person; className?: string; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar aria-hidden size={size ?? avatarSize(className)} className={cn(!size && !className && "size-10", className)}>
      {person.image && <AvatarImage src={person.image} alt="" />}
      <AvatarFallback className={cn("font-semibold text-white/90", tiny(className) && "text-2xs")} style={{ backgroundColor: personTint(person.id) }}>
        {initials(person.name)}
      </AvatarFallback>
    </Avatar>
  );
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

const dot = "absolute bottom-0 right-0 size-2.5 rounded-full ring-2";

function PersonDot({ id, ring }: { id: string; ring: string }) {
  const t = useT(messages);
  const away = useAvailability(id);
  const online = usePresence(id).online;
  if (isAway(away))
    return (
      <span role="img" aria-label={availabilityTitle(away)!} className={cn(dot, ring, "flex items-center justify-center bg-destructive")}>
        <span className="h-0.5 w-1/2 rounded-full bg-background" />
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

/** One avatar for a direct conversation; a project shows its logo, or a folder. `status` (ring class) adds the status dot. */
export function ConversationAvatar({
  conversation,
  me,
  className,
  status,
}: {
  conversation: { kind: string; title?: string | null; image?: string | null; members: Person[]; agents: AgentSummary[] };
  me: string;
  className?: string;
  status?: string;
}) {
  // A project with its own logo: the logo, not the faces of who is in it.
  if (conversation.kind === "group" && conversation.image) {
    return (
      <span className={cn("relative shrink-0", className ?? "size-10")}>
        <Avatar aria-hidden className="size-full">
          <AvatarImage src={conversation.image} alt="" />
          <AvatarFallback />
        </Avatar>
        {status && <GroupWorkingDot agentIds={conversation.agents.map((a) => a.id)} ring={status} />}
      </span>
    );
  }
  // A project without a logo: a folder (it holds the project's discussions), not the faces of who is in it.
  if (conversation.kind === "group") {
    return (
      <span className={cn("relative shrink-0", className ?? "size-10")}>
        <Avatar aria-hidden className="size-full">
          <AvatarFallback>
            <FolderIcon className="size-1/2" />
          </AvatarFallback>
        </Avatar>
        {status && <GroupWorkingDot agentIds={conversation.agents.map((a) => a.id)} ring={status} />}
      </span>
    );
  }
  const first = othersOf(conversation, me)[0];
  if (!first)
    return (
      <Avatar aria-hidden className={className ?? "size-10"}>
        <AvatarFallback />
      </Avatar>
    );
  return status ? <StatusAvatar p={first} className={className} ring={status} /> : <ParticipantAvatar p={first} className={className} />;
}

/** In a group, the dot only says that one of its bots is working. */
function GroupWorkingDot({ agentIds, ring }: { agentIds: string[]; ring: string }) {
  const t = useT(messages);
  const ids = new Set(agentIds);
  const working = useQuery({ ...presenceQuery, select: (s) => s.workingAgents.some((id) => ids.has(id)) }).data;
  if (!working) return null;
  return <span role="img" aria-label={t.working} className={cn(dot, ring, "bg-brand motion-safe:animate-pulse")} />;
}
