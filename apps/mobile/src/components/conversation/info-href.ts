import { type Href } from "expo-router";
import type { ConversationDetail } from "@/lib/types";

/** Where the conversation's info lives: the members of a group, the colleague, or the bot. */
export function infoHref(conv: ConversationDetail, me: string): Href | null {
  if (conv.kind === "group") return `/info/${conv.id}` as Href;
  // With the conversation: the bot's sheet also shows its screen and its routines there.
  if (conv.agents.length === 1) return { pathname: "/agents/[agentId]", params: { agentId: conv.agents[0]!.id, conversationId: conv.id } };
  const person = conv.members.find((m) => m.id !== me);
  return person ? (`/people/${person.id}` as Href) : null;
}
