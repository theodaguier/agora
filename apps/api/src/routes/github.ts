import { Hono, type Context } from "hono";
import { z } from "zod";
import { turnOfHermesSession } from "../bot-runner";
import { internalToken } from "../code-plugin";
import { parseRepo } from "../code-git";
import { botMergeStatus, botPullRequest, decideMergeRequest, getMergeRequest, GitHubMergeError, mergeAsPerson, readPullRequest, requestMerge } from "../github-merge";
import { requireUser, type AppEnv } from "../middleware";

const METHOD = z.enum(["squash", "merge", "rebase"]);

/** owner/repo and number of the path, or null. */
function target(c: Context) {
  const repo = parseRepo(`${c.req.param("owner")}/${c.req.param("repo")}`);
  const number = Number(c.req.param("number"));
  return repo && Number.isInteger(number) && number > 0 ? { repo, number } : null;
}

/** GitHub pull requests for the people (github-merge.ts): links unfurled in conversations, bots' merge requests. */
export const github = new Hono<AppEnv>()
  .use(requireUser)
  .onError((err, c) => {
    if (err instanceof GitHubMergeError) return c.json({ error: err.message }, err.status);
    console.error("github", err);
    return c.json({ error: "internal" }, 500);
  })

  /** 404 without a token or for a pull request GitHub doesn't know (the card stays hidden). */
  .get("/pulls/:owner/:repo/:number", async (c) => {
    const t = target(c);
    if (!t) return c.json({ error: "not_found" }, 404);
    const pr = await readPullRequest(c.get("user"), t.repo, t.number);
    return pr ? c.json(pr) : c.json({ error: "not_found" }, 404);
  })
  .post("/pulls/:owner/:repo/:number/merge", async (c) => {
    const t = target(c);
    if (!t) return c.json({ error: "not_found" }, 404);
    const body = z.object({ method: METHOD.default("squash") }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return c.json(await mergeAsPerson(c.get("user"), t.repo, t.number, body.data.method));
  })

  .get("/merge-requests/:requestId", async (c) => c.json(await getMergeRequest(c.get("user"), c.req.param("requestId"))))
  .post("/merge-requests/:requestId/approve", async (c) => c.json(await decideMergeRequest(c.get("user"), c.req.param("requestId"), true)))
  .post("/merge-requests/:requestId/deny", async (c) => c.json(await decideMergeRequest(c.get("user"), c.req.param("requestId"), false)));

/* ---------- for the agora_code Hermes plugin ---------- */

const hermesSession = z.string().min(1).max(300);
const failure = (c: Context, err: unknown) => {
  // `message`: what the bot reads.
  if (err instanceof GitHubMergeError) return c.json({ error: err.message, message: err.message }, err.status);
  throw err;
};

/** The running turn of a Hermes session, started by a person. */
function turnOf(session: string) {
  const turn = turnOfHermesSession(session);
  if (!turn?.requestedBy) return { error: "no_turn" as const, message: "GitHub merges can only be asked while replying to a person." };
  return { conversationId: turn.conversationId, agentId: turn.agentId, requestedBy: turn.requestedBy };
}

/**
 * Called by the agora_code plugin (github_pull_request, github_merge), mounted under
 * /api/internal/code/github with the same token and checks as its sessions' routes.
 */
export const internalGithub = new Hono()
  .use(async (c, next) => {
    const token = internalToken();
    if (c.req.header("x-forwarded-for") || !token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "forbidden" }, 403);
    await next();
  })

  .post("/pull", async (c) => {
    const body = z.object({ hermes_session: hermesSession, session_id: z.string().max(100).optional(), url: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid", message: "session_id or url is required" }, 400);
    const turn = turnOf(body.data.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return botPullRequest(turn.conversationId, { sessionId: body.data.session_id, url: body.data.url }).then((pr) => c.json(pr), (err) => failure(c, err));
  })

  .post("/merge-requests", async (c) => {
    const body = z
      .object({
        hermes_session: hermesSession,
        session_id: z.string().max(100).optional(),
        url: z.string().max(500).optional(),
        method: METHOD.optional(),
        reason: z.string().trim().min(1).max(500),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid", message: "reason, and session_id or url, are required" }, 400);
    const turn = turnOf(body.data.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return requestMerge(turn, { sessionId: body.data.session_id, url: body.data.url, method: body.data.method, reason: body.data.reason }).then(
      ({ row, pr }) => c.json({ request_id: row.id, status: row.status, repo: row.repo, number: row.number, method: row.method, pull_request: { ...pr, repo: row.repo } }),
      (err) => failure(c, err),
    );
  })

  /** Polled by the plugin while it waits for the person's answer. */
  .get("/merge-requests/:requestId", async (c) => {
    const turn = turnOf(c.req.query("hermes_session") ?? "");
    if ("error" in turn) return c.json(turn, 403);
    return botMergeStatus(turn, c.req.param("requestId")).then((r) => c.json(r), (err) => failure(c, err));
  });
