import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CodeApproval, CodeSession, CodeSessionDetail, CodeStep } from "@agora/core";
import { api, conversationPath } from "./api";

/** Claude Code sessions of a conversation (apps/api/src/code-sessions.ts): list for the cards, detail with steps for the panel. */

const path = (conversationId: string, rest = "") => conversationPath(conversationId, `/code-sessions${rest}`);

export const codeSessionsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["code-sessions", conversationId],
    queryFn: () => api<CodeSession[]>(path(conversationId)),
  });

export const codeSessionQuery = (conversationId: string, id: string) =>
  queryOptions({
    queryKey: ["code-session", conversationId, id],
    queryFn: () => api<CodeSessionDetail>(path(conversationId, `/${encodeURIComponent(id)}`)),
  });

const upsert = <T extends { id: string }>(list: T[], item: T) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

/** A session's state from the stream (`code.session`), or from a mutation's answer. */
export function applyCodeSession(qc: QueryClient, session: CodeSession) {
  const cid = session.conversationId;
  qc.setQueryData<CodeSessionDetail>(codeSessionQuery(cid, session.id).queryKey, (old) => old && { ...old, ...session });
  qc.setQueryData<CodeSession[]>(codeSessionsQuery(cid).queryKey, (old) => (old ? upsert(old, session) : old));
  // A new session (its card) or one this client never loaded.
  if (!qc.getQueryData(codeSessionsQuery(cid).queryKey)?.some((s) => s.id === session.id)) void qc.invalidateQueries({ queryKey: codeSessionsQuery(cid).queryKey });
}

/** One step added or changed (`code.step`): only the open panels hold steps. */
export function applyCodeStep(qc: QueryClient, conversationId: string, sessionId: string, step: CodeStep) {
  qc.setQueryData<CodeSessionDetail>(codeSessionQuery(conversationId, sessionId).queryKey, (old) => old && { ...old, steps: upsert(old.steps, step) });
}

export const sendToCodeSession = (conversationId: string, id: string, text: string) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/messages`), { method: "POST", body: JSON.stringify({ text }) });

export const answerCodeApproval = (conversationId: string, id: string, approvalId: string, choice: CodeApproval["choices"][number]) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/approval`), { method: "POST", body: JSON.stringify({ approvalId, choice }) });

export const stopCodeSession = (conversationId: string, id: string) => api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/stop`), { method: "POST" });

/** Models the owner may give a session (the Claude Code engine's list, minus blocked ones). */
export const codeModelsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["code-models", conversationId],
    queryFn: () => api<{ id: string; label?: string; description?: string; reasoning?: boolean }[]>(path(conversationId, "/models")),
    staleTime: 10 * 60_000,
  });

export const setCodeSessionModel = (conversationId: string, id: string, model: string) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/model`), { method: "PUT", body: JSON.stringify({ model }) });
