/* Requests a bot makes in a conversation (a connector, a skill, bots), read by their cards. */
import type { CodeMergeMethod, GitHubMergeRequestDto, GitHubPullRequest, VaultRequestDto } from "@agora/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { BotRequest, McpRequest, SkillRequest } from "./types";

export const mcpRequestQuery = (id: string) => ({
  queryKey: ["mcp-request", id],
  queryFn: () => api<McpRequest>(`/mcp-requests/${id}`),
});

export const skillRequestQuery = (id: string) => ({
  queryKey: ["skill-request", id],
  queryFn: () => api<SkillRequest>(`/skill-requests/${id}`),
});

export const botRequestQuery = (id: string) => ({
  queryKey: ["bot-request", id],
  queryFn: () => api<BotRequest>(`/bot-requests/${id}`),
});

/** A bot asking to use (or for) a login of the vault; followed while it waits for an answer. */
export const vaultRequestQuery = (id: string) =>
  queryOptions({
    queryKey: ["vault-request", id],
    queryFn: () => api<VaultRequestDto>(`/vaults/requests/${encodeURIComponent(id)}`),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 3_000 : false),
  });

const pullPath = (repo: string, number: number) => `/github/pulls/${repo.split("/").map(encodeURIComponent).join("/")}/${number}`;

/** A pull request read on its own (a link in a message, a bot's merge request); hidden when GitHub doesn't answer. */
export const githubPullQuery = (repo: string, number: number) =>
  queryOptions({
    queryKey: ["github-pull", repo, number],
    queryFn: () => api<GitHubPullRequest>(pullPath(repo, number)),
    staleTime: 30_000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.state === "open" && q.state.data.checks?.state === "pending" ? 30_000 : false),
  });

export const mergeGithubPull = (repo: string, number: number, method: CodeMergeMethod) =>
  api<GitHubPullRequest>(`${pullPath(repo, number)}/merge`, { method: "POST", body: JSON.stringify({ method }) });

/** A bot asking to merge a pull request, shown as a card in the thread; followed while it waits for an answer. */
export const githubMergeRequestQuery = (id: string) =>
  queryOptions({
    queryKey: ["github-merge-request", id],
    queryFn: () => api<GitHubMergeRequestDto>(`/github/merge-requests/${encodeURIComponent(id)}`),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 3_000 : false),
  });

/** After a merge: the code sessions (one may work on that pull request) are read again. */
export const invalidateSessions = (qc: QueryClient) => void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("code-session") });
