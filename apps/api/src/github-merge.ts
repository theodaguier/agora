import { and, eq, lt, sql } from "drizzle-orm";
import type { CodeMergeMethod, CodePullRequest, ConversationEvent, GitHubMergeRequestDto, GitHubMergeRequestStatus, GitHubPullRequest } from "@agora/core";
import { canUseCodeSessions } from "./code-engines";
import { getPullRequest, GitError, mergePull, parsePullUrl, parseRepo } from "./code-git";
import { db, schema } from "./db";
import { defineMessages, tr } from "./i18n";

/**
 * GitHub pull requests outside a session's panel: a link pasted in a conversation, read and merged
 * by a person, and a bot's request to merge one (agora_code plugin, github_merge), which the person
 * who started its turn answers on a card in the conversation (event github.merge). Agora merges
 * with the instance's token (code-git.ts githubToken), never the bot.
 *
 * Who may merge: admins, and the people who can use code sessions (code-engines.ts
 * canUseCodeSessions), the ones who already merge from a session's panel. A bot's request needs
 * its turn to have been started by one of them, and only that person answers it.
 */

const { agent, conversationMember, githubMergeRequest, user } = schema;

type RequestRow = typeof githubMergeRequest.$inferSelect;
type Viewer = { id: string; role?: string | null; email: string };
/** The turn a bot's tool call comes from (bot-runner.ts turnOfHermesSession), started by a person. */
export type MergeTurn = { conversationId: string; agentId: string; requestedBy: string };

const messages = defineMessages({
  en: {
    notFound: "Request not found",
    alreadyHandled: "Request already handled",
    expired: "This request has expired",
    notYours: "Only the person who asked the bot can answer",
    forbidden: "Only admins and the people who use code sessions can merge pull requests.",
  },
  fr: {
    notFound: "Demande introuvable",
    alreadyHandled: "Demande déjà traitée",
    expired: "Cette demande a expiré",
    notYours: "Seule la personne qui a sollicité le bot peut répondre",
    forbidden: "Seuls les administrateurs et les personnes qui utilisent les sessions de code peuvent merger une PR.",
  },
});

export class GitHubMergeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

/** How long a bot's merge request waits for its person (the plugin waits as long). */
export const MERGE_REQUEST_TTL_MS = 10 * 60_000;

/** Admins, and the people who can use code sessions, may merge a pull request. */
export const canMergePulls = (viewer: { role?: string | null; email: string } | null | undefined) => !!viewer && (viewer.role === "admin" || canUseCodeSessions(viewer));

/**
 * Why `viewer` can't answer this request now (null: they can). Only the person who started the
 * bot's turn answers, a pending request, within MERGE_REQUEST_TTL_MS.
 */
export function decisionError(row: Pick<RequestRow, "requestedBy" | "status" | "createdAt">, viewerId: string, now = Date.now()): { message: string; status: 403 | 409 } | null {
  const t = tr(messages);
  if (row.requestedBy !== viewerId) return { message: t.notYours, status: 403 };
  if (row.status === "expired" || (row.status === "pending" && now - row.createdAt.getTime() > MERGE_REQUEST_TTL_MS)) return { message: t.expired, status: 409 };
  if (row.status !== "pending") return { message: t.alreadyHandled, status: 409 };
  return null;
}

/* ---------- a pull request on its own ---------- */

/** A pull request with what merging it depends on, for a person; null when GitHub (or a token) is missing. */
export async function readPullRequest(viewer: Viewer, repo: string, number: number): Promise<GitHubPullRequest | null> {
  const pr = await getPullRequest(repo, number);
  return pr && { ...pr, repo, canMerge: canMergePulls(viewer) };
}

/** A person merges a pull request (a link unfurled in a conversation). */
export async function mergeAsPerson(viewer: Viewer, repo: string, number: number, method: CodeMergeMethod): Promise<GitHubPullRequest> {
  if (!canMergePulls(viewer)) throw new GitHubMergeError(tr(messages).forbidden, 403);
  const pr = await mergePull(repo, number, method).catch(gitFailure);
  return { ...pr, repo, canMerge: true };
}

const gitFailure = (err: unknown): never => {
  if (err instanceof GitError) throw new GitHubMergeError(err.message, 409);
  throw err;
};

/* ---------- for bots ---------- */

/**
 * The pull request a bot names: its code session's (`sessionId`, in its conversation) or a link.
 * Throws a message for the bot when neither leads to one.
 */
export async function resolveTarget(conversationId: string, input: { sessionId?: string; url?: string }): Promise<{ repo: string; number: number; sessionId: string | null }> {
  if (input.sessionId) {
    const { refreshCodeSessionGit } = await import("./code-sessions");
    const s = await refreshCodeSessionGit(input.sessionId, conversationId).catch(() => null);
    if (!s) throw new GitHubMergeError("Session not found in this conversation.", 404);
    const pr = s.git?.pr;
    if (!pr) throw new GitHubMergeError("This session has no pull request yet.", 404);
    const link = parsePullUrl(pr.url);
    const repo = link?.repo ?? (s.git?.repo ? parseRepo(s.git.repo) : null);
    if (!repo) throw new GitHubMergeError("This session's pull request is not on GitHub.", 400);
    return { repo, number: pr.number, sessionId: s.id };
  }
  const link = input.url ? parsePullUrl(input.url) : null;
  if (!link) throw new GitHubMergeError("Give session_id, or url: a pull request link (https://github.com/owner/repo/pull/123).", 400);
  return { ...link, sessionId: null };
}

/** What a bot reads of a pull request: state, size, checks, review, mergeability (no secrets). */
export function pullForBot(repo: string, pr: CodePullRequest) {
  return { repo, ...pr };
}

export async function botPullRequest(conversationId: string, input: { sessionId?: string; url?: string }) {
  const target = await resolveTarget(conversationId, input);
  const pr = await getPullRequest(target.repo, target.number);
  if (!pr) throw new GitHubMergeError("Pull request not found, or no GitHub access (GH_TOKEN).", 404);
  return { ...pullForBot(target.repo, pr), ...(target.sessionId && { session_id: target.sessionId }) };
}

type Announce = (conversationId: string, event: ConversationEvent) => Promise<unknown>;
const postEvent: Announce = async (conversationId, event) => (await import("./messages")).postEvent(conversationId, event);

/** Pending requests older than the TTL become expired. */
async function expireStale(where = sql`true`) {
  await db
    .update(githubMergeRequest)
    .set({ status: "expired", decidedAt: new Date() })
    .where(and(eq(githubMergeRequest.status, "pending"), lt(githubMergeRequest.createdAt, new Date(Date.now() - MERGE_REQUEST_TTL_MS)), where));
}

async function loadRequest(id: string) {
  await expireStale(eq(githubMergeRequest.id, id));
  const [row] = await db.select().from(githubMergeRequest).where(eq(githubMergeRequest.id, id));
  if (!row) throw new GitHubMergeError(tr(messages).notFound, 404);
  return row;
}

/**
 * A bot asks to merge a pull request: a card its person answers in the conversation. The same
 * pending request is reused when the bot asks again for the same pull request.
 */
export async function requestMerge(turn: MergeTurn, input: { sessionId?: string; url?: string; method?: CodeMergeMethod; reason: string }, announce: Announce = postEvent) {
  const [requester] = await db.select({ role: user.role, email: user.email }).from(user).where(eq(user.id, turn.requestedBy));
  if (!canMergePulls(requester)) throw new GitHubMergeError(tr(messages, "en").forbidden, 403);
  const target = await resolveTarget(turn.conversationId, input);
  const pr = await getPullRequest(target.repo, target.number);
  if (!pr) throw new GitHubMergeError("Pull request not found, or no GitHub access (GH_TOKEN).", 404);
  if (pr.state !== "open") throw new GitHubMergeError(`Pull request #${pr.number} is ${pr.state}: nothing to merge.`, 409);
  const method = input.method && (!pr.methods || pr.methods.includes(input.method)) ? input.method : (pr.methods?.[0] ?? "squash");
  await expireStale(and(eq(githubMergeRequest.repo, target.repo), eq(githubMergeRequest.number, target.number)));
  const [pending] = await db
    .select()
    .from(githubMergeRequest)
    .where(
      and(
        eq(githubMergeRequest.repo, target.repo),
        eq(githubMergeRequest.number, target.number),
        eq(githubMergeRequest.agentId, turn.agentId),
        eq(githubMergeRequest.conversationId, turn.conversationId),
        eq(githubMergeRequest.requestedBy, turn.requestedBy),
        eq(githubMergeRequest.status, "pending"),
      ),
    );
  if (pending) return { row: pending, pr };
  const [created] = await db
    .insert(githubMergeRequest)
    .values({
      id: crypto.randomUUID(),
      repo: target.repo,
      number: target.number,
      title: pr.title,
      url: pr.url,
      headSha: pr.head ?? null,
      method,
      agentId: turn.agentId,
      conversationId: turn.conversationId,
      sessionId: target.sessionId,
      requestedBy: turn.requestedBy,
      reason: input.reason.trim().slice(0, 500),
    })
    .returning();
  const [bot] = await db.select({ name: agent.name }).from(agent).where(eq(agent.id, turn.agentId));
  await announce(turn.conversationId, { type: "github.merge", bot: bot?.name ?? "bot", repo: target.repo, number: target.number, title: pr.title, requestId: created!.id });
  return { row: created!, pr };
}

/** Where a bot's request stands, polled by the plugin while it waits. Approved: the merged pull request. */
export async function botMergeStatus(turn: MergeTurn, id: string) {
  const row = await loadRequest(id).catch(() => null);
  if (!row || row.agentId !== turn.agentId || row.conversationId !== turn.conversationId || row.requestedBy !== turn.requestedBy)
    throw new GitHubMergeError(tr(messages, "en").notFound, 404);
  if (row.status === "approved") {
    const pr = await getPullRequest(row.repo, row.number).catch(() => null);
    return { status: row.status, pull_request: pr ? pullForBot(row.repo, pr) : { repo: row.repo, number: row.number, url: row.url, state: "merged" } };
  }
  return { status: row.status, ...(row.error && { error: row.error }) };
}

async function requestDto(row: RequestRow): Promise<GitHubMergeRequestDto> {
  const [bot] = await db.select({ name: agent.name }).from(agent).where(eq(agent.id, row.agentId));
  return {
    id: row.id,
    status: row.status,
    repo: row.repo,
    number: row.number,
    title: row.title,
    url: row.url,
    method: row.method,
    agentId: row.agentId,
    agentName: bot?.name ?? "",
    sessionId: row.sessionId,
    reason: row.reason,
    requestedBy: row.requestedBy,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

const isMember = async (conversationId: string, userId: string) =>
  (await db.select().from(conversationMember).where(and(eq(conversationMember.conversationId, conversationId), eq(conversationMember.userId, userId)))).length > 0;

/** Its requester, the conversation's members (read-only) and admins see a request. */
export async function getMergeRequest(viewer: Viewer, id: string) {
  const row = await loadRequest(id);
  if (viewer.role !== "admin" && viewer.id !== row.requestedBy && !(await isMember(row.conversationId, viewer.id))) throw new GitHubMergeError(tr(messages).notFound, 404);
  return requestDto(row);
}

/**
 * The person who started the bot's turn agrees or refuses. Agreed: Agora merges at once, on the
 * head commit the bot saw (a branch that moved since is refused by GitHub); refused by GitHub,
 * the request is failed with its reason and the error is thrown.
 */
export async function decideMergeRequest(viewer: Viewer, id: string, approve: boolean, merge: typeof mergePull = mergePull) {
  const row = await loadRequest(id);
  const refusal = decisionError(row, viewer.id);
  if (refusal) {
    // Someone who can't see the request doesn't learn it exists.
    if (refusal.status === 403 && viewer.role !== "admin" && !(await isMember(row.conversationId, viewer.id))) throw new GitHubMergeError(tr(messages).notFound, 404);
    throw new GitHubMergeError(refusal.message, refusal.status);
  }
  if (approve && !canMergePulls(viewer)) throw new GitHubMergeError(tr(messages).forbidden, 403);
  const status: GitHubMergeRequestStatus = approve ? "approved" : "denied";
  // Claimed first: a second click never merges twice.
  const [claimed] = await db
    .update(githubMergeRequest)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(githubMergeRequest.id, id), eq(githubMergeRequest.status, "pending")))
    .returning();
  if (!claimed) throw new GitHubMergeError(tr(messages).alreadyHandled, 409);
  if (!approve) return requestDto(claimed);
  let pr: CodePullRequest;
  try {
    pr = await merge(claimed.repo, claimed.number, claimed.method, claimed.headSha);
  } catch (err) {
    const message = err instanceof GitError ? err.message : "GitHub";
    if (!(err instanceof GitError)) console.error("github merge", err);
    await db.update(githubMergeRequest).set({ status: "failed", error: message.slice(0, 1000) }).where(eq(githubMergeRequest.id, id));
    throw new GitHubMergeError(message, 409);
  }
  if (claimed.sessionId) {
    const [who] = await db.select({ name: user.name }).from(user).where(eq(user.id, viewer.id));
    const { noteCodeSessionMerge } = await import("./code-sessions");
    await noteCodeSessionMerge(claimed.sessionId, claimed.conversationId, who?.name ?? "", pr, claimed.method).catch((err) => console.error("github merge: session", err));
  }
  return requestDto(claimed);
}
