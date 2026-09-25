import { MCP_ENV_VALUE_MAX } from "@agora/core";
import { Hono } from "hono";
import { z } from "zod";
import { HermesError } from "../hermes-admin";
import { cancelOAuth, createCustom, decide, getRequest, install, listRequests, oauthStatus, relayOAuthCallback, startOAuth } from "../mcp-requests";
import { mcpRequestSchema } from "../mcp-requests";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { errors } from "../errors.messages";
import { currentLocale, defineMessages, tr, type Locale } from "../i18n";

const messages = defineMessages({
  en: {
    authorized: "Connection authorized",
    authorizedBody: "You can close this tab and go back to Agora.",
    denied: "Authorization denied",
    deniedBody: "Go back to the conversation and restart the connection.",
  },
  fr: {
    authorized: "Connexion autorisée",
    authorizedBody: "Tu peux fermer cet onglet et revenir à Agora.",
    denied: "Autorisation refusée",
    deniedBody: "Reviens dans la conversation et relance la connexion.",
  },
});

/** MCP connector requests issued by bots. */
export const mcpRequests = new Hono<AppEnv>()
  .use(requireUser)
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    console.error("mcp requests", err);
    return c.json({ error: tr(errors).hermesUnreachable }, 502);
  })

  .get("/", requireAdmin, async (c) => c.json(await listRequests(c.get("user"))))

  /** Custom connector declared by an admin (marketplace), with its integration type. */
  .post("/custom", requireAdmin, async (c) => {
    const body = mcpRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success || !body.data.type) throw new HermesError(tr(errors).invalidRequest, 400);
    return c.json(await createCustom({ ...body.data, type: body.data.type }, c.get("user")), 201);
  })

  .get("/:id", async (c) => c.json(await getRequest(c.req.param("id"), c.get("user"))))

  .post("/:id/approve", requireAdmin, async (c) => {
    await decide(c.req.param("id"), c.get("user").id, true);
    return c.json(await getRequest(c.req.param("id"), c.get("user")));
  })

  .post("/:id/reject", requireAdmin, async (c) => {
    await decide(c.req.param("id"), c.get("user").id, false);
    return c.json(await getRequest(c.req.param("id"), c.get("user")));
  })

  /** Secrets entered by the employee: forwarded to Hermes, never stored here. */
  .post("/:id/install", async (c) => {
    const id = c.req.param("id");
    if (!(await getRequest(id, c.get("user"))).canConnect) throw new HermesError(tr(errors).notAllowed, 403);
    const body = z
      .object({
        env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(MCP_ENV_VALUE_MAX)).default({}),
        bearer_token: z.string().min(1).max(4000).optional(),
        /** Client registered by hand with the provider (no dynamic registration). */
        oauth_client: z
          .object({
            client_id: z.string().trim().min(1).max(500),
            client_secret: z.string().max(4000).optional(),
            scope: z.string().trim().max(1000).optional(),
          })
          .optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw new HermesError(tr(errors).invalidRequest, 400);
    await install(id, body.data);
    return c.json(await getRequest(id, c.get("user")));
  })

  .post("/:id/oauth", async (c) => {
    const id = c.req.param("id");
    if (!(await getRequest(id, c.get("user"))).canConnect) throw new HermesError(tr(errors).notAllowed, 403);
    return c.json(await startOAuth(id));
  })

  /** Authorization window closed: frees the flow so a new attempt can start right away. */
  .delete("/:id/oauth", async (c) => {
    const req = await getRequest(c.req.param("id"), c.get("user"));
    if (!req.canConnect) throw new HermesError(tr(errors).notAllowed, 403);
    await cancelOAuth(req.name);
    return c.body(null, 204);
  })

  .get("/:id/oauth/:flow", async (c) => {
    const id = c.req.param("id");
    await getRequest(id, c.get("user"));
    return c.json(await oauthStatus(id, c.req.param("flow")));
  });

const page = (locale: Locale, title: string, body: string) =>
  `<!doctype html><html lang="${locale}"><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:20px">${title}</h1><p style="color:#aaa">${body}</p></div>`;

/**
 * Browser language for a page opened outside the app (no X-Agora-Locale header):
 * the first of French or English in Accept-Language, otherwise the organization's.
 */
const browserLocale = (header: string | undefined): Locale => {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return currentLocale();
};

/** OAuth callback from the provider (public: the state is verified by Hermes). */
export const mcpOAuthCallback = new Hono().get("/:name", async (c) => {
  const query = new URL(c.req.url).search.slice(1);
  const ok = await relayOAuthCallback(c.req.param("name"), query).catch(() => false);
  const locale = browserLocale(c.req.header("accept-language"));
  const t = tr(messages, locale);
  return c.html(ok ? page(locale, t.authorized, t.authorizedBody) : page(locale, t.denied, t.deniedBody), ok ? 200 : 400);
});
