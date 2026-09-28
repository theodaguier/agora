import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { attachCodeSession, turnOfHermesSession } from "../bot-runner";
import { canUseClaudeCode, resolveClaudeCodeModel } from "../claude-code";
import {
  announceCodeSession,
  answerCodeApproval,
  CodeSessionError,
  codeSessionReport,
  getCodeSession,
  listCodeSessions,
  sendToCodeSession,
  setCodeSessionModel,
  startCodeSession,
  stopCodeSession,
} from "../code-sessions";
import { internalToken } from "../code-plugin";
import { loadConversation } from "../conversations";
import { db, schema } from "../db";
import { requireUser, type AppEnv } from "../middleware";
import { allowedClaudeCodeModels } from "../models";

const TEXT_MAX = 20_000;

function failure(c: Context, err: unknown) {
  if (err instanceof CodeSessionError) {
    const status = err.code === "not_found" ? 404 : err.code === "gone" ? 409 : 400;
    return c.json({ error: err.code }, status);
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

  /** Models the owner may give a session (Claude Code's list minus the ones an admin blocked for them). */
  .get("/models", async (c) => {
    const me = c.get("user");
    const conv = await loadConversation(me.id, c.req.param("id")!);
    if (!conv) return c.json({ error: "not_found" }, 404);
    if (!canUseClaudeCode(me)) return c.json({ error: "forbidden" }, 403);
    return c.json(await allowedClaudeCodeModels(me.id).catch((err) => (console.error("code sessions: models", err), [])));
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
    const body = z.object({ text: z.string().trim().min(1).max(TEXT_MAX) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return sendToCodeSession(owned.sessionId, body.data.text, c.get("user").name, owned.conversationId).then((s) => c.json(s), (err) => failure(c, err));
  })

  .post("/:sessionId/approval", async (c) => {
    const owned = await ownerOnly(c);
    if (owned instanceof Response) return owned;
    const body = z
      .object({ approvalId: z.string().uuid(), choice: z.enum(["once", "session", "deny"]) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid" }, 400);
    return answerCodeApproval(owned.sessionId, body.data.approvalId, body.data.choice, owned.conversationId).then(
      (s) => c.json(s),
      (err) => failure(c, err),
    );
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
  });

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
    const [bot] = await db.select({ name: schema.agent.name }).from(schema.agent).where(eq(schema.agent.id, turn.agentId));
    return sendToCodeSession(c.req.param("sessionId"), body.data.text, bot?.name ?? "bot", turn.conversationId).then(
      (s) => codeSessionReport(s.id).then((r) => c.json(r)),
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
