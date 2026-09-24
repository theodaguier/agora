import { conversations } from "@agora/core/i18n";
import { tr } from "@/lib/i18n";
import type { AgentSummary, Person } from "@/lib/types";

export type Participant = { kind: "agent"; agent: AgentSummary } | { kind: "user"; person: Person };

/** The other participants of a conversation (excluding yourself), bots first. */
export function othersOf(c: { members: Person[]; agents: AgentSummary[] }, me: string): Participant[] {
  return [
    ...c.agents.map((agent) => ({ kind: "agent" as const, agent })),
    ...c.members.filter((m) => m.id !== me).map((person) => ({ kind: "user" as const, person })),
  ];
}

export function conversationTitle(c: { kind: string; title: string | null; members: Person[]; agents: AgentSummary[] }, me: string) {
  if (c.title) return c.title;
  const names = othersOf(c, me).map((p) => (p.kind === "agent" ? p.agent.name : p.person.name.split(" ")[0]!));
  return names.join(", ") || tr(conversations).justYou;
}
