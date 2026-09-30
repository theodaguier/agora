import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CodeAccount, CodeApprovalAnswer, CodePermissionMode, CodeRepo, CodeSession, CodeSessionDetail, CodeStep } from "@agora/core";
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

/** A session the owner starts without a bot: Claude Code names it from its first instruction. */
export const startCodeSession = (conversationId: string, req: { task: string; repo?: string; model?: string; mode?: CodePermissionMode }) =>
  api<CodeSession>(path(conversationId), { method: "POST", body: JSON.stringify(req) });

/** GitHub repositories a new session can clone (the instance's token reaches them), the latest pushed first. */
export const codeReposQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["code-repos", conversationId],
    queryFn: () => api<CodeRepo[]>(path(conversationId, "/repos")),
    staleTime: 5 * 60_000,
  });

export const sendToCodeSession = (conversationId: string, id: string, text: string) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/messages`), { method: "POST", body: JSON.stringify({ text }) });

/** An action allowed or denied, questions answered, a plan approved or sent back with what to change. */
export const answerCodeApproval = (conversationId: string, id: string, approvalId: string, answer: CodeApprovalAnswer) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/approval`), { method: "POST", body: JSON.stringify({ approvalId, ...answer }) });

/** Its permission mode: right away if it works, for the next run otherwise. */
export const setCodeSessionMode = (conversationId: string, id: string, mode: CodePermissionMode) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/mode`), { method: "PUT", body: JSON.stringify({ mode }) });

export type CodeGitRequest =
  /** An empty message: Claude Code writes it from the diff. */
  | { action: "commit"; message: string }
  | { action: "push" }
  | { action: "pull" }
  | { action: "pr"; title: string; body: string; draft: boolean }
  | { action: "merge"; method: "squash" | "merge" | "rebase" };

/** Commit, push, pull, pull request, merge in the session's clone (between two runs). */
export const runCodeGit = (conversationId: string, id: string, req: CodeGitRequest) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/git`), { method: "POST", body: JSON.stringify(req) });

/** A commit message for the clone's changes, written by Claude Code from the diff. */
export const writeCommitMessage = (conversationId: string, id: string) =>
  api<{ message: string }>(path(conversationId, `/${encodeURIComponent(id)}/git/message`), { method: "POST" }).then((r) => r.message);

/** Its branch and pull request read again by the server (throttled there): a PR merged on GitHub shows up. */
export const refreshCodeSessionGit = (conversationId: string, id: string) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/git/refresh`), { method: "POST" });

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

/** The owner's Claude accounts signed in, the active one first (Settings › Models). */
export const codeAccountsQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["code-accounts", conversationId],
    queryFn: () => api<(CodeAccount & { active: boolean })[]>(path(conversationId, "/accounts")),
    staleTime: 60_000,
  });

/** Moves Claude Code to another account; a session stopped by the limit picks up where it was. */
export const switchCodeSessionAccount = (conversationId: string, id: string, accountId: string | null) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/account`), { method: "PUT", body: JSON.stringify({ id: accountId }) });

/** Its owner is done with it: its worktree is deleted (the branch stays in the clone). */
export const removeCodeSessionWorktree = (conversationId: string, id: string) =>
  api<CodeSession>(path(conversationId, `/${encodeURIComponent(id)}/worktree`), { method: "DELETE" });

/** A repository's credentials: the .env written into the worktree of every session started on it. */
export const repoEnvQuery = (conversationId: string, repo: string) =>
  queryOptions({
    queryKey: ["code-repo-env", repo],
    queryFn: () => api<{ repo: string; env: string }>(path(conversationId, `/repo-env?repo=${encodeURIComponent(repo)}`)),
    staleTime: 0,
    gcTime: 0,
  });

export const saveRepoEnv = (conversationId: string, repo: string, env: string) =>
  api<{ repo: string; env: string }>(path(conversationId, "/repo-env"), { method: "PUT", body: JSON.stringify({ repo, env }) });
