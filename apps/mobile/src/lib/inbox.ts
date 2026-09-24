import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { AgentAvatarSpec, TaskStatus } from "./types";

/* apps/web/src/lib/api.ts (InboxItem) + queries.ts (inboxQuery) + screens/Inbox.tsx (POST /inbox/read). */

export type InboxKind = "mention" | "reply" | "task.assigned" | "task.done";

/** A mention, a reply or a task that concerns you. */
export type InboxItem = {
  id: string;
  kind: InboxKind;
  /** Excerpt of the message, or the task's title when it was sent. */
  text: string;
  read: boolean;
  createdAt: string;
  conversationId: string | null;
  messageId: string | null;
  task: { id: string; title: string; status: TaskStatus } | null;
  actor: { kind: "agent"; id: string; name: string; avatar: AgentAvatarSpec } | { kind: "user"; id: string; name: string; image: string | null } | null;
};

export type Inbox = { items: InboxItem[]; unread: number };

/** Your inbox; `unread`: unread items only. The unread count comes with both. Refreshed by "inbox.changed". */
export const inboxQuery = (unread = false) =>
  queryOptions({
    queryKey: ["inbox", unread ? "unread" : "all"],
    queryFn: () => api<Inbox>(`/inbox${unread ? "?unread=1" : ""}`),
  });

/** Number of unread items, for the badge. */
export const useInboxUnread = () => useQuery({ ...inboxQuery(true), select: (d) => d.unread }).data ?? 0;

/** Marks items read or unread; no `ids`: every item read. */
export function useMarkInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids?: string[]; read?: boolean }) => api("/inbox/read", { method: "POST", body: JSON.stringify(body) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}
