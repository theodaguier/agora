import { VAULT_ITEM_KINDS, type VaultItemKind } from "@agora/core";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { activeTurns, turnOfHermesSession } from "../bot-runner";
import { codeSessionAwaitsVault } from "../code-sessions";
import { requireUser, type AppEnv } from "../middleware";
import { vaultInternalToken } from "../vault-plugin";
import {
  answerLoginRequest,
  askLogin,
  botContact,
  botRequestStatus,
  botSearch,
  createItem,
  createSharedVault,
  decideVaultRequest,
  deleteItem,
  deleteVault,
  getVaultRequest,
  itemInput,
  itemPatch,
  listItems,
  listVaults,
  loginAnswer,
  requestLogin,
  revealItem,
  updateItem,
  updateVault,
  VaultError,
  vaultInput,
  vaultPatch,
  vaultTurn,
} from "../vaults";

const fail = (c: Context, err: unknown) => {
  if (err instanceof VaultError) return c.json({ error: err.message, message: err.message }, err.status);
  throw err;
};

async function parse<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T> | null> {
  const body = schema.safeParse(await c.req.json().catch(() => ({})));
  return body.success ? body.data : null;
}

const invalid = (c: Context) => c.json({ error: "invalid" }, 400);

/** The bot's turn (or the code session that asked, code-sessions.ts) still runs: the card's answer reaches whoever waits for it. */
const turnLive = (r: { id: string; conversationId: string; agentId: string; requestedBy: string | null }) =>
  codeSessionAwaitsVault(r.id) || activeTurns(r.conversationId).some((t) => t.agentId === r.agentId && t.requestedBy === r.requestedBy);

/** Coffre-fort, for the people (vaults.ts). */
export const vaults = new Hono<AppEnv>()
  .use(requireUser)
  .onError((err, c) => {
    if (err instanceof VaultError) return c.json({ error: err.message }, err.status);
    console.error("vaults", err);
    return c.json({ error: "internal" }, 500);
  })

  .get("/requests/:requestId", async (c) => c.json(await getVaultRequest(c.get("user"), c.req.param("requestId"))))
  .post("/requests/:requestId/approve", async (c) => c.json(await decideVaultRequest(c.get("user"), c.req.param("requestId"), true, turnLive)))
  .post("/requests/:requestId/answer", async (c) => {
    const body = await parse(c, loginAnswer);
    if (!body) return invalid(c);
    return c.json(await answerLoginRequest(c.get("user"), c.req.param("requestId"), body, turnLive));
  })
  .post("/requests/:requestId/deny", async (c) => c.json(await decideVaultRequest(c.get("user"), c.req.param("requestId"), false)))

  .get("/", async (c) => c.json(await listVaults(c.get("user").id)))
  .post("/", async (c) => {
    const body = await parse(c, vaultInput);
    if (!body) return invalid(c);
    return c.json(await createSharedVault(c.get("user"), body), 201);
  })
  .patch("/:id", async (c) => {
    const body = await parse(c, vaultPatch);
    if (!body) return invalid(c);
    const next = await updateVault(c.get("user"), c.req.param("id"), body);
    return next ? c.json(next) : c.body(null, 204);
  })
  .delete("/:id", async (c) => {
    await deleteVault(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  })

  .get("/:id/items", async (c) => c.json(await listItems(c.get("user").id, c.req.param("id"))))
  .post("/:id/items", async (c) => {
    const body = await parse(c, itemInput);
    if (!body) return invalid(c);
    return c.json(await createItem(c.get("user").id, c.req.param("id"), body), 201);
  })
  .patch("/:id/items/:itemId", async (c) => {
    const body = await parse(c, itemPatch);
    if (!body) return invalid(c);
    return c.json(await updateItem(c.get("user").id, c.req.param("id"), c.req.param("itemId"), body));
  })
  .delete("/:id/items/:itemId", async (c) => {
    await deleteItem(c.get("user").id, c.req.param("id"), c.req.param("itemId"));
    return c.body(null, 204);
  })
  .post("/:id/items/:itemId/reveal", async (c) => c.json(await revealItem(c.get("user").id, c.req.param("id"), c.req.param("itemId"))));

/* ---------- for the agora_vault Hermes plugin ---------- */

const hermesSession = z.string().min(1).max(300);
const kind = z.enum(VAULT_ITEM_KINDS as [VaultItemKind, ...VaultItemKind[]]);

const turnOf = (session: string) => vaultTurn(turnOfHermesSession(session));

/**
 * Called by the agora_vault plugin from the Hermes gateway, on 127.0.0.1, with the token the API
 * wrote for it (vault-plugin.ts). Never through the public proxy: a request Caddy forwarded carries
 * X-Forwarded-For. `message` is what the bot reads.
 */
export const internalVault = new Hono()
  .use(async (c, next) => {
    const token = vaultInternalToken();
    if (c.req.header("x-forwarded-for") || !token || c.req.header("authorization") !== `Bearer ${token}`) return c.json({ error: "forbidden" }, 403);
    await next();
  })

  .post("/search", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession, query: z.string().max(200).optional(), kind: kind.optional() }));
    if (!body) return invalid(c);
    const turn = turnOf(body.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return botSearch(turn, body.query, body.kind).then((items) => c.json({ items }), (err) => fail(c, err));
  })

  .post("/contact", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession, item_id: z.string().min(1).max(100) }));
    if (!body) return invalid(c);
    const turn = turnOf(body.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return botContact(turn, body.item_id).then((item) => c.json({ item }), (err) => fail(c, err));
  })

  .post("/requests", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession, item_id: z.string().min(1).max(100), reason: z.string().trim().min(1).max(500) }));
    if (!body) return c.json({ error: "invalid", message: "item_id and reason are required" }, 400);
    const turn = turnOf(body.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return requestLogin(turn, body.item_id, body.reason).then((r) => c.json({ request_id: r.id, status: r.status }), (err) => fail(c, err));
  })

  /** A login the bot doesn't have, for a site: its person types it on a card, then it is saved in their vault. */
  .post("/ask", async (c) => {
    const body = await parse(c, z.object({ hermes_session: hermesSession, website: z.string().trim().min(1).max(500), reason: z.string().trim().min(1).max(500) }));
    if (!body) return c.json({ error: "invalid", message: "website and reason are required" }, 400);
    const turn = turnOf(body.hermes_session);
    if ("error" in turn) return c.json(turn, 403);
    return askLogin(turn, body.website, body.reason).then((r) => c.json({ request_id: r.id, status: r.status }), (err) => fail(c, err));
  })

  /** Polled by the plugin while it waits for the person's answer. */
  .get("/requests/:requestId", async (c) => {
    const turn = turnOf(c.req.query("hermes_session") ?? "");
    if ("error" in turn) return c.json(turn, 403);
    return botRequestStatus(turn, c.req.param("requestId")).then((r) => c.json(r), (err) => fail(c, err));
  });
