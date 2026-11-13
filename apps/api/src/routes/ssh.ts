import { Hono, type Context } from "hono";
import { z } from "zod";
import { turnOfHermesSession } from "../bot-runner";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { addHostForAgent, botHosts, createHost, deleteHost, forgetHostKey, hostInput, hostLog, hostPatch, hostsStatus, listHosts, probe, runOnHost, SshError, testHost, testHostForAgent, updateHost } from "../ssh";
import { sshInternalToken } from "../ssh-plugin";

const fail = (c: Context, err: unknown) => {
  if (err instanceof SshError) return c.json({ error: err.message, message: err.message }, err.status);
  throw err;
};

async function parse<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const body = schema.safeParse(await c.req.json().catch(() => ({})));
  return body.success ? body.data : null;
}

/** Machines SSH, for the admins (ssh.ts). */
export const sshHosts = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .onError((err, c) => {
    if (err instanceof SshError) return c.json({ error: err.message }, err.status);
    console.error("ssh", err);
    return c.json({ error: "internal" }, 500);
  })
  .get("/", async (c) => c.json(await listHosts()))
  /** Whether each machine's server answers (TCP + SSH banner, no login). */
  .get("/status", async (c) => c.json(await hostsStatus()))
  /** The same for an address not saved yet: the dialog's test before creating. */
  .post("/probe", async (c) => {
    const body = await parse(c, z.object({ host: z.string().trim().min(1).max(253), port: z.number().int().min(1).max(65535) }));
    if (!body) return c.json({ error: "invalid" }, 400);
    return c.json(await probe(body.host, body.port));
  })
  .post("/", async (c) => {
    const body = await parse(c, hostInput);
    if (!body) return c.json({ error: "invalid" }, 400);
    return c.json(await createHost(body, c.get("user").id), 201);
  })
  .patch("/:id", async (c) => {
    const body = await parse(c, hostPatch);
    if (!body) return c.json({ error: "invalid" }, 400);
    return c.json(await updateHost(c.req.param("id"), body));
  })
  .delete("/:id", async (c) => {
    await deleteHost(c.req.param("id"));
    return c.json({ ok: true });
  })
  .post("/:id/test", async (c) => c.json(await testHost(c.req.param("id"))))
  .post("/:id/forget-host-key", async (c) => c.json(await forgetHostKey(c.req.param("id"))))
  .get("/:id/log", async (c) => c.json(await hostLog(c.req.param("id"))));

/* ---------- for the agora_ssh Hermes plugin ---------- */

const hermesSession = z.string().min(1).max(300);

/** The bot's running turn: a command only runs while it replies (to a person, a routine or a webhook). */
function actorOf(session: string) {
  const turn = turnOfHermesSession(session);
  if (!turn) return null;
  return { agentId: turn.agentId, userId: turn.requestedBy, conversationId: turn.conversationId };
}

const noTurn = { error: "no_turn", message: "Machines can only be used during a reply." };

/**
 * Called by the agora_ssh plugin from the Hermes gateway, on 127.0.0.1, with the token the API wrote
 * for it (ssh-plugin.ts). Never through the public proxy: a request Caddy forwarded carries
 * X-Forwarded-For. `message` is what the bot reads.
 */
export const internalSsh = new Hono()
  .use(async (c, next) => {
    const token = sshInternalToken();
    if (c.req.header("x-forwarded-for") || !token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "forbidden" }, 403);
    await next();
  })

  .post("/hosts", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession }));
    if (!body) return c.json({ error: "invalid" }, 400);
    const actor = actorOf(body.hermes_session);
    if (!actor) return c.json(noTurn, 403);
    return c.json({ hosts: await botHosts(actor.agentId) });
  })

  /** An agent declares a machine (every bot reaches it once tested): it gets the public key to install. */
  .post("/add", async (c) => {
    const body = await c.req.json().catch(() => null);
    const session = hermesSession.safeParse(body?.hermes_session);
    if (!session.success) return c.json({ error: "invalid" }, 400);
    const actor = actorOf(session.data);
    if (!actor) return c.json(noTurn, 403);
    return addHostForAgent(actor, body).then(
      (r) => c.json(r),
      (err) => fail(c, err),
    );
  })

  .post("/test", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession, host: z.string().min(1).max(40) }));
    if (!body) return c.json({ error: "invalid", message: "host is required" }, 400);
    const actor = actorOf(body.hermes_session);
    if (!actor) return c.json(noTurn, 403);
    return testHostForAgent(actor, body.host).then(
      ({ result }) => c.json(result),
      (err) => fail(c, err),
    );
  })

  .post("/run", async (c) => {
    const body = await parse(
      c,
      z.object({
        hermes_session: hermesSession,
        host: z.string().min(1).max(40),
        command: z.string().min(1).max(20_000),
        timeout_seconds: z.number().int().min(1).max(600).optional(),
        stdin: z.string().max(5_000_000).optional(),
      }),
    );
    if (!body) return c.json({ error: "invalid", message: "host and command are required" }, 400);
    const actor = actorOf(body.hermes_session);
    if (!actor) return c.json(noTurn, 403);
    return runOnHost(actor, body.host, body.command, { timeoutSeconds: body.timeout_seconds, stdin: body.stdin }).then(
      (r) => c.json(r),
      (err) => fail(c, err),
    );
  });
