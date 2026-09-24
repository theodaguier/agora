import { withHandles } from "@agora/core";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useMemo } from "react";
import type { AgentSummary } from "./api";
import type { Mentionable } from "./mentions";
import { agentsQuery, userProfileQuery, usersQuery } from "./queries";

/** Everyone who can be mentioned (colleagues and yourself), with the "@handle" the agents use too. */
export function usePeople() {
  const { user } = useRouteContext({ from: "/app" });
  const { data: others = [] } = useQuery(usersQuery);
  const { data: me } = useQuery(userProfileQuery(user.id));
  return useMemo(() => withHandles([...(me ? [me] : []), ...others.filter((p) => p.id !== user.id)]), [me, others, user.id]);
}

export type MentionablePerson = ReturnType<typeof usePeople>[number];

/** Colleagues as mentions: "@handle", in the brand color. */
export const personMentionables = (people: MentionablePerson[]): Mentionable[] =>
  people.map((p) => ({ name: p.handle, avatar: { color: "var(--brand)" }, target: { kind: "person", person: p } }));

/** Bots of the conversation, every other visible bot and every colleague, to color all mentions in a text. */
export function useMentionables(bots: AgentSummary[]) {
  const people = usePeople();
  const { data: all = [] } = useQuery(agentsQuery);
  return useMemo(() => {
    // The conversation's bots come first: their data is the one the conversation loaded.
    const agents = [...bots, ...all.filter((a) => !bots.some((b) => b.id === a.id))];
    return [...agents.map((agent): Mentionable => ({ ...agent, target: { kind: "agent", agent } })), ...personMentionables(people)];
  }, [bots, all, people]);
}
