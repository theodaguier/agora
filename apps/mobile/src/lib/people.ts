import { withHandles } from "@agora/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useMe } from "@/components/server-scope";
import type { Mentionable } from "./mentions";
import { agentsQuery, userProfileQuery, usersQuery } from "./queries";
import type { AgentSummary } from "./types";

/* apps/web/src/lib/people.ts */

/** Everyone who can be mentioned (colleagues and yourself), with the "@handle" the agents use too. */
export function usePeople() {
  const user = useMe();
  const { data: others = [] } = useQuery(usersQuery);
  const { data: me } = useQuery(userProfileQuery(user.id));
  return useMemo(() => withHandles([...(me ? [me] : []), ...others.filter((p) => p.id !== user.id)]), [me, others, user.id]);
}

export type MentionablePerson = ReturnType<typeof usePeople>[number];

/** Colleagues as mentions: "@handle", in the brand color (`brand` is resolved from the theme where it's drawn). */
export const personMentionables = (people: MentionablePerson[]): Mentionable[] =>
  people.map((p) => ({ name: p.handle, avatar: { color: "brand" }, target: { kind: "person", person: p } }));

/** Bots of the conversation, every other visible bot and every colleague, to color all mentions in a text. */
export function useMentionables(bots: AgentSummary[]) {
  const people = usePeople();
  const { data: all = [] } = useQuery(agentsQuery);
  return useMemo(() => {
    const agents = [...bots, ...all.filter((a) => !bots.some((b) => b.id === a.id))];
    return [...agents.map((agent): Mentionable => ({ ...agent, target: { kind: "agent", agent } })), ...personMentionables(people)];
  }, [bots, all, people]);
}
