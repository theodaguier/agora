import { Hono } from "hono";
import { z } from "zod";
import { env } from "../env";
import { defineMessages, tr } from "../i18n";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { version } from "../version";

const messages = defineMessages({
  en: {
    missing: "No update service (development environment).",
    unreachable: "Can't reach the update service.",
  },
  fr: {
    missing: "Service de mise à jour absent (environnement de développement).",
    unreachable: "Service de mise à jour injoignable.",
  },
});

/** Proxy to the update service (internal network, token). Admins only. */
async function updater(path: string, init?: RequestInit) {
  if (!env.UPDATER_URL) return Response.json({ error: tr(messages).missing }, { status: 503 });
  try {
    return await fetch(`${env.UPDATER_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.UPDATER_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return Response.json({ error: tr(messages).unreachable }, { status: 502 });
  }
}

const versionSchema = z.string().regex(/^v?\d+\.\d+\.\d+(\.\d+)?$/);

export const updates = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get("/", async (c) => {
    const res = await updater("/status");
    const body = await res.json().catch(() => ({}));
    return c.json({ ...(res.ok ? body : { unavailable: (body as { error?: string }).error }), server: version });
  })
  .post("/check", async () => updater("/check", { method: "POST" }))
  .post("/apply", async (c) => {
    const body = z.object({ target: z.enum(["hermes", "app"]), version: versionSchema }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    return updater("/apply", { method: "POST", body: JSON.stringify(body.data) });
  })
  .put("/settings", async (c) => {
    const body = z
      .object({
        autoApp: z.boolean().optional(),
        autoHermes: z.boolean().optional(),
        windowStart: z.number().int().min(0).max(23).optional(),
        windowEnd: z.number().int().min(0).max(23).optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    return updater("/settings", { method: "PUT", body: JSON.stringify(body.data) });
  })
  .delete("/rejected/:target/:version", async (c) => {
    const target = z.enum(["hermes", "app"]).parse(c.req.param("target"));
    const v = versionSchema.parse(c.req.param("version"));
    return updater(`/rejected/${target}/${v}`, { method: "DELETE" });
  });
