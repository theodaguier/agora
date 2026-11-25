import { isSimple } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { api, type AgentSummary, type ConversationSummary } from "@/lib/api";
import { agentsQuery, conversationsQuery } from "@/lib/queries";

/*
 * The simple interface (@agora/core isSimple): one chat with an assistant and its history, like ChatGPT.
 * AppShell swaps the workspace for it (components/SimpleShell.tsx); apps/mobile/src/lib/simple.ts is its twin.
 */

/** Does the signed-in account get the simple interface? */
export function useSimple() {
  const { user } = useRouteContext({ from: "/app" });
  return isSimple(user);
}

/** The bots the person can talk to, set up. */
export function useAssistants() {
  return useQuery({ ...agentsQuery, select: (list: AgentSummary[]) => list.filter((a) => !a.onboarding) });
}

/** A conversation with one bot only: a chat of the history. */
const isBotChat = (c: ConversationSummary) => c.kind === "direct" && c.agents.length === 1 && c.members.length <= 2;

/** The assistant a new chat starts with: the one of the latest chat, else the first. */
export function defaultAssistant(agents: AgentSummary[], chats: ConversationSummary[]) {
  const latest = chats.filter(isBotChat).find((c) => agents.some((a) => a.id === c.agents[0]!.id));
  return latest?.agents[0]!.id ?? agents[0]?.id ?? null;
}

/** "New chat" with a bot: opens it (the empty one from last time comes back). */
export function useNewChat() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (agentId: string) => api<{ id: string }>("/conversations/chat", { method: "POST", body: JSON.stringify({ agentId }) }),
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      void navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    },
  });
}

/** "Save to the second brain": a message, or one of its files. */
export const remember = (conversationId: string, messageId: string, attachmentId?: string) =>
  api<{ path: string }>(`/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/remember`, {
    method: "POST",
    body: JSON.stringify(attachmentId ? { attachmentId } : {}),
  });
