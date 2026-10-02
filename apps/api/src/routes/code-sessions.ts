import { and, eq, inArray } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { attachCodeSession, turnOfHermesSession } from "../bot-runner";
import { claudeProfiles } from "../claude-accounts";
import { canUseClaudeCode, resolveClaudeCodeModel } from "../claude-code";
import {
  announceCodeSession,
  answerCodeApproval,
  CodeSessionError,
  codeSessionReport,
  commitMessageFor,
  deleteCodeSession,
  refreshCodeSessionGit,
  removeCodeSessionWorktree,
  getCodeSession,
  listCodeSessions,
  runGitAction,
  sendToCodeSession,
  switchCodeSessionAccount,
  setCodeSessionMode,
  setCodeSessionModel,
  startCodeSession,
  stopCodeSession,
} from "../code-sessions";
import { listRepos, parseRepo } from "../code-git";
import { internalToken } from "../code-plugin";
import { loadConversation } from "../conversations";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";
import { allowedClaudeCodeModels } from "../models";
import { repoEnv, RepoEnvError, saveRepoEnv } from "../repo-env";

const TEXT_MAX = 20_000;
const MODE = z.enum(["default", "acceptEdits", "plan", "bypassPermissions"]);
/** Files uploaded to the conversation (POST /conversations/:id/attachments), joined to an instruction. */
const ATTACHMENTS = z.array(z.string().uuid()).max(10).default([]);

/** The conversation's attachments named, all of them or null. */
async function attachmentsOf(conversationId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.select().from(schema.attachment).where(and(eq(schema.attachment.conversationId, conversationId), inArray(schema.attachment.id, ids)));
  return rows.length === new Set(ids).size ? ids.map((id) => rows.find((r) => r.id === id)!) : null;
}

function failure(c: Context, err: unknown) {
  if (err instanceof CodeSessionError) {
    const status = err.code === "not_found" ? 404 : err.code === "gone" || err.code === "busy" ? 409 : 400;
    // `message`: read by the agora_code plugin; `error`: shown by the clients.
    return c.json({ error: err.detail ?? err.code, ...(err.detail && { message: err.detail }) }, status);
  }
  throw err;
}

/**
 * Claude Code sessions of a conversation: every member watches them; only
 * the owner of the subscription who started them drives them.
 */
export const codeSessions = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    return c.json(await listCodeSessions(conv.conversation.id));
  })

  /** A session the owner starts from the panel, without a bot: Claude Code names it from its first instruction. */
  .post("/", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({ task: z.string().trim().max(TEXT_MAX).default(""), attachmentIds: ATTACHMENTS, repo: z.string().trim().max(300).optional(), model: z.string().max(100).optional(), mode: MODE.optional() })
      .refine((b) => b.task || b.attachmentIds.length)
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const files = await attachmentsOf(conv.conversation.id, body.data.attachmentIds);
    if (!files) return c.json({ error: "unknown_attachment" }, 400);
    if (body.data.model && !(await allowedClaudeCodeModels(me.id).catch(() => [])).some((m) => m.id === body.data.model)) return c.json({ error: "unknown_model" }, 400);
    return startCodeSession({
      conversationId: conv.conversation.id,
      agentId: null,
      requestedBy: me.id,
      by: me.name,
      botName: null,
      announce: true,
      title: "",
      task: body.data.task,
      model: body.data.model,
      repo: body.data.repo,
      mode: body.data.mode,
      files,
    }).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** Models the owner may give a session (Claude Code's list minus the ones an admin blocked for them). */
  .get("/models", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    return c.json(await allowedClaudeCodeModels(me.id).catch((err) => (console.error("code sessions: models", err), [])));
  })

  /** The owner's Claude accounts signed in, the active one first: a session can move to another when one runs out. */
  .get("/accounts", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    return c.json(await claudeProfiles().catch((err) => (console.error("code sessions: accounts", err), [])));
  })

  /** GitHub repositories a new session can clone: the ones the instance's token reaches. */
  .get("/repos", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    return c.json(await listRepos().catch((err) => (console.error("code sessions: repos", err), [])));
  })

  /** A repository's credentials, written into the worktree of every session started on it: its owner's .env, in clear. */
  .get("/repo-env", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    const repo = parseRepo(c.req.query("repo") ?? "");
    if (!repo) return c.json({ error: "invalid" }, 400);
    console.info(`code sessions: credentials of ${repo} viewed by ${me.email}`);
    return c.json({ repo, env: await repoEnv(repo) });
  })

  /** Replaces them (empty: none); sessions started from now on get them. */
  .put("/repo-env", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    const body = z.object({ repo: z.string().max(300), env: z.string().max(100_000) }).safeParse(await c.req.json().catch(() => ({})));
    const repo = body.success ? parseRepo(body.data.repo) : null;
    if (!body.success || !repo) return c.json({ error: "invalid" }, 400);
    try {
      return c.json({ repo, env: await saveRepoEnv(repo, body.data.env, me.id) });
    } catch (err) {
      if (err instanceof RepoEnvError) return c.json({ error: err.message }, 400);
      throw err;
    }
  })

  .get("/:sessionId", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    return getCodeSession(c.req.param("sessionId"), conv.conversation.id).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** An instruction for Claude Code, taken into account at its next step if it is working. */
  .post("/:sessionId/messages", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z
      .object({ text: z.string().trim().max(TEXT_MAX).default(""), attachmentIds: ATTACHMENTS })
      .refine((b) => b.text || b.attachmentIds.length)
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const files = await attachmentsOf(owned.conversationId, body.data.attachmentIds);
    if (!files) return c.json({ error: "unknown_attachment" }, 400);
    return sendToCodeSession(owned.sessionId, body.data.text, c.get("user").name, owned.conversationId, files).then((s) => c.json(s), (err) => failure(c, err));
  })

  .post("/:sessionId/approval", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z
      .object({
        approvalId: z.string().uuid(),
        choice: z.enum(["once", "session", "deny"]),
        /** A question's answers, keyed by question. */
        answers: z.record(z.string().max(2_000), z.string().max(2_000)).optional(),
        /** What to change in a plan sent back. */
        feedback: z.string().max(TEXT_MAX).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const { approvalId, ...answer } = body.data;
    return answerCodeApproval(owned.sessionId, approvalId, answer, owned.conversationId).then(
      (s) => c.json(s),
      (err) => failure(c, err),
    );
  })

  /** Its permission mode (plan, accept edits, ask, on its own): right away if it works, for the next run otherwise. */
  .put("/:sessionId/mode", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z.object({ mode: MODE }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return setCodeSessionMode(owned.sessionId, body.data.mode, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  .put("/:sessionId/model", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z.object({ model: z.string().min(1).max(100) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const allowed = await allowedClaudeCodeModels(c.get("user").id).catch(() => []);
    if (!allowed.some((m) => m.id === body.data.model)) return c.json({ error: "unknown_model" }, 400);
    return setCodeSessionModel(owned.sessionId, body.data.model, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  .post("/:sessionId/stop", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    return stopCodeSession(owned.sessionId, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** Its owner is done with it: its worktree is deleted (the branch stays), and what it left running stops. */
  .delete("/:sessionId/worktree", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    return removeCodeSessionWorktree(owned.sessionId, c.get("user").name, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** Its owner deletes it: its run stops, its worktree and its steps go. */
  .delete("/:sessionId", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    return deleteCodeSession(owned.sessionId, owned.conversationId).then(() => c.body(null, 204), (err) => failure(c, err));
  })

  /** Moves Claude Code to another account; a session stopped by the limit picks up where it was. */
  .put("/:sessionId/account", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z.object({ id: z.string().max(100).nullable() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const me = c.get("user");
    return switchCodeSessionAccount(owned.sessionId, body.data.id, { id: me.id, name: me.name }, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** Its branch and pull request read again (throttled): every member watching it sees a PR merged on GitHub. */
  .post("/:sessionId/git/refresh", async (c) => {
    const conv = await loadConversation(c.get("user").id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    return refreshCodeSessionGit(c.req.param("sessionId")!, conv.conversation.id).then((s) => c.json(s), (err) => failure(c, err));
  })

  /** A commit message for the clone's changes, written by Claude Code from the diff: the owner edits it before committing. */
  .post("/:sessionId/git/message", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    return commitMessageFor(owned.sessionId, owned.conversationId).then((message) => c.json({ message }), (err) => failure(c, err));
  })

  /** Commit, push, pull, pull request, merge: run by Agora in the session's clone, between two runs. */
  .post("/:sessionId/git", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = gitRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return runGitAction(owned.sessionId, body.data, c.get("user").name, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  });

const gitRequest = z.discriminatedUnion("action", [
  // Empty: Claude Code writes it.
  z.object({ action: z.literal("commit"), message: z.string().trim().max(5_000).default("") }),
  z.object({ action: z.literal("push") }),
  z.object({ action: z.literal("pull") }),
  z.object({ action: z.literal("pr"), title: z.string().trim().min(1).max(250), body: z.string().max(60_000).default(""), draft: z.boolean().default(false) }),
  z.object({ action: z.literal("merge"), method: z.enum(["squash", "merge", "rebase"]).default("squash") }),
]);

/** The session runs on the requester's personal subscription: nobody else drives it. */
async function ownerOnly(c: Context<AppEnv>) {
  const me = c.get("user");
  const conv = await loadConversation(me.id, c.req.param("id")!);
  if (!conv) return c.json({ error: "not_found" }, 404);
  const session = await getCodeSession(c.req.param("sessionId")!, conv.conversation.id).catch(() => null);
  if (!session) return c.json({ error: "not_found" }, 404);
  if (session.requestedBy !== me.id || !canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
  return { conversationId: conv.conversation.id, sessionId: session.id };
}

/* ---------- for the agora_code Hermes plugin ---------- */

const hermesSession = z.string().min(1).max(300);

/**
 * Called by the agora_code plugin from the Hermes gateway, on 127.0.0.1 (the API shares its
 * network), with the token the API wrote for it (code-plugin.ts). Never through the public
 * proxy: a request Caddy forwarded carries X-Forwarded-For.
 *
 * A bot acts for the turn it is running: starting, instructing or stopping needs that turn to
 * have been started by the owner of the Claude Code subscription.
 */
export const internalCode = new Hono()
  .use(async (c, next) => {
    const token = internalToken();
    if (c.req.header("x-forwarded-for") || !token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "forbidden" }, 403);
    await next();
  })

  .post("/sessions", async (c) => {
    const body = z
      .object({
        hermes_session: hermesSession,
        task: z.string().trim().min(1).max(TEXT_MAX),
        title: z.string().max(200).optional(),
        project: z.string().max(64).optional(),
        model: z.string().max(100).optional(),
        repo: z.string().max(300).optional(),
        branch: z.string().max(200).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid", detail: body.error.issues[0]?.message }, 400);
    const turn = await ownerTurn(body.data.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    const model = body.data.model ? await allowedModel(turn.requestedBy, body.data.model) : undefined;
    if (model && "error" in model) return c.json(model, 400);
    const [bot] = await db.select({ name: schema.agent.name }).from(schema.agent).where(eq(schema.agent.id, turn.agentId));
    return startCodeSession({
      conversationId: turn.conversationId,
      agentId: turn.agentId,
      requestedBy: turn.requestedBy,
      by: bot?.name ?? "bot",
      botName: bot?.name ?? null,
      announce: false,
      title: body.data.title ?? "",
      task: body.data.task,
      project: body.data.project,
      model: model?.id,
      repo: body.data.repo,
      branch: body.data.branch,
    }).then(
      async (s) => {
        // Its card goes into the bot's reply, where the bot is in its text; the turn just ended: a line of its own.
        if (!(await attachCodeSession(body.data.hermes_session, { id: s.id, title: s.title }))) await announceCodeSession(s.conversationId, s.id, s.title, bot?.name ?? null);
        return c.json(await codeSessionReport(s.id));
      },
      (err) => failure(c, err),
    );
  })

  /** Status, last answer and recent actions: the bot polls it while it waits. */
  .get("/sessions/:sessionId", async (c) => {
    const conversationId = conversationOf(c.req.query("hermes_session") ?? "");
    if (!conversationId) return c.json({ error: "forbidden" }, 403);
    const session = await getCodeSession(c.req.param("sessionId"), conversationId).catch(() => null);
    if (!session) return c.json({ error: "not_found" }, 404);
    return c.json(await codeSessionReport(session.id));
  })

  .post("/sessions/:sessionId/messages", async (c) => {
    const body = z.object({ hermes_session: hermesSession, text: z.string().trim().min(1).max(TEXT_MAX) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const turn = await ownerTurn(body.data.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    const sessionId = c.req.param("sessionId");
    // Its pull request merged or closed: its task is done. Another task goes into a new session, a
    // line of its own under the conversation's sessions, and not under an older task's title.
    const pr = await refreshCodeSessionGit(sessionId, turn.conversationId).then(
      (s) => s.git?.pr,
      () => null,
    );
    if (pr && pr.state !== "open") {
      return c.json(
        {
          error: "done",
          message: `This session's pull request #${pr.number} is ${pr.state}: its task is over. Start a new session with claude_code_start for any further work (it gets a worktree of its own).`,
        },
        409,
      );
    }
    const [bot] = await db.select({ name: schema.agent.name }).from(schema.agent).where(eq(schema.agent.id, turn.agentId));
    return sendToCodeSession(sessionId, body.data.text, bot?.name ?? "bot", turn.conversationId).then(
      async (s) => {
        // The reply that puts it back to work carries its card too.
        await attachCodeSession(body.data.hermes_session, { id: s.id, title: s.title });
        return c.json(await codeSessionReport(s.id));
      },
      (err) => failure(c, err),
    );
  })

  .post("/sessions/:sessionId/stop", async (c) => {
    const body = z.object({ hermes_session: hermesSession }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    const turn = await ownerTurn(body.data.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return stopCodeSession(c.req.param("sessionId"), turn.conversationId).then(
      (s) => codeSessionReport(s.id).then((r) => c.json(r)),
      (err) => failure(c, err),
    );
  });

/** The model a bot asked for (an alias like "opus" or an exact id), if the owner may use it. */
async function allowedModel(userId: string, requested: string) {
  const allowed = await allowedClaudeCodeModels(userId).catch(() => []);
  const id = resolveClaudeCodeModel(requested.trim());
  const found = allowed.find((m) => m.id === id) ?? allowed.find((m) => m.id.startsWith(id) || m.label?.toLowerCase().includes(requested.trim().toLowerCase()));
  if (found) return { id: found.id };
  return { error: "unknown_model" as const, message: `Model not available. Available: ${allowed.map((m) => m.id).join(", ")}. Or leave it out for Claude Code's default.` };
}

/** "agora-<conversation>[-…]" (company.ts hermesSessionId): the conversation a Hermes session belongs to. */
function conversationOf(session: string) {
  return /^agora-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-|$)/.exec(session)?.[1] ?? null;
}

async function ownerTurn(session: string) {
  const turn = turnOfHermesSession(session);
  if (!turn || !turn.requestedBy) return { error: "no_turn" as const, message: "Claude Code can only be used during a reply to a person." };
  const [requester] = await db.select().from(schema.user).where(eq(schema.user.id, turn.requestedBy));
  if (!canUseClaudeCode(requester)) {
    return {
      error: "not_owner" as const,
      message: "Claude Code runs on its owner's personal subscription: only turns its owner started can use it.",
    };
  }
  return { ...turn, requestedBy: turn.requestedBy };
}
