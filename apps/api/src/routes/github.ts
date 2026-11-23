import { Hono, type Context } from "hono";
import { z } from "zod";
import { turnOfHermesSession } from "../bot-runner";
import { internalToken } from "../code-plugin";
import { canUseCodeSessions } from "../code-engines";
import { forgetRepos, githubToken, listRepos, parseRepo } from "../code-git";
import { env } from "../env";
import { defineMessages, tr } from "../i18n";
import { createFromCode, forgetInstallations, manifestForm, orgHandle, takeState } from "../github-app";
import { botMergeStatus, botPullRequest, decideMergeRequest, getMergeRequest, GitHubMergeError, mergeAsPerson, readPullRequest, requestMerge } from "../github-merge";
import { requireUser, type AppEnv } from "../middleware";

const METHOD = z.enum(["squash", "merge", "rebase"]);

const messages = defineMessages({
  en: {
    badOrg: "Expected the organization's GitHub handle, as in github.com/E-Do-Studio.",
    noOrg: (org: string) => `GitHub has no organization named “${org}”: use its handle, as in github.com/E-Do-Studio.`,
    badName: "The app's name is required, 34 characters at most.",
  },
  fr: {
    badOrg: "Le nom GitHub de l'organisation est attendu, comme dans github.com/E-Do-Studio.",
    noOrg: (org: string) => `GitHub ne connaît aucune organisation « ${org} » : utilise son nom GitHub, comme dans github.com/E-Do-Studio.`,
    badName: "Le nom de l'app est obligatoire, 34 caractères au plus.",
  },
});

/** Back to Settings › Integrations in the web app, saying how connecting GitHub went. */
const settingsUrl = (github: "connected" | "failed") => `${env.WEB_ORIGIN.replace(/\/$/, "")}/?settings=integrations&github=${github}`;

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

  /* Agora's GitHub App (github-app.ts): created and installed from Settings › Integrations. */

  /** The form the browser posts to GitHub to create the app: on `org`, else on the admin's account. */
  .post("/app/manifest", async (c) => {
    if (c.get("user").role !== "admin") return c.json({ error: "forbidden" }, 403);
    const t = tr(messages);
    const body = z.object({ org: z.string().max(200).default(""), name: z.string().trim().min(1).max(34) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: t.badName }, 400);
    const org = orgHandle(body.data.org) || null;
    if (org && !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(org)) return c.json({ error: t.badOrg }, 400);
    // A wrong handle would end on GitHub's 404 page: checked here first (public, no token needed).
    if (org) {
      const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "agora" },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (res?.status === 404) return c.json({ error: t.noOrg(org) }, 400);
    }
    return c.json(manifestForm(c.get("user").id, org, body.data.name));
  })
  /** GitHub created the app: its credentials are kept, then the browser goes on to install it. */
  .get("/app/created", async (c) => {
    const me = c.get("user");
    const code = c.req.query("code");
    if (me.role !== "admin" || !code || !takeState(c.req.query("state"), me.id)) return c.redirect(settingsUrl("failed"));
    const install = await createFromCode(code, me.id).catch((err) => (console.error("github app: creation", err), null));
    return c.redirect(install ?? settingsUrl("failed"));
  })
  /** GitHub installed (or updated) the app: its installations are read again from GitHub. */
  .get("/app/installed", async (c) => {
    forgetInstallations();
    forgetRepos();
    return c.redirect(settingsUrl("connected"));
  })

  /**
   * The GitHub integration, for a project's repository: whether it is connected, and the repositories
   * its token reaches (listed to the people who can start code sessions only).
   */
  .get("/repos", async (c) => {
    const connected = !!(await githubToken());
    const repos = connected && canUseCodeSessions(c.get("user")) ? await listRepos().catch((err) => (console.error("github: repos", err), [])) : [];
    return c.json({ connected, repos });
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
