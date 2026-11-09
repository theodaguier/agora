import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { createWebhook, deleteWebhook, listWebhooks, receiveWebhook, updateWebhook } from "../webhooks";
import { WEBHOOK_BODY_MAX, WEBHOOK_TOKEN } from "../webhook-payload";
import { errors } from "../errors.messages";
import { tr } from "../i18n";

const fields = z.object({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().min(1).max(4000),
  dedupeField: z
    .string()
    .trim()
    .max(200)
    .regex(/^[\w$-]*(\.[\w$-]+)*$/)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  autoMerge: z.boolean().optional(),
});

/** A bot's webhooks, in its settings. */
export const agentWebhooks = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get("/", async (c) => c.json(await listWebhooks(c.req.param("agentId")!)))

  .post("/", async (c) => {
    const body = fields.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: tr(errors).invalidRequest }, 400);
    const created = await createWebhook(c.req.param("agentId")!, c.get("user").id, body.data);
    return created ? c.json(created, 201) : c.json({ error: tr(errors).notAllowed }, 403);
  })

  .patch("/:id", async (c) => {
    const body = fields.partial().extend({ enabled: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: tr(errors).invalidRequest }, 400);
    await updateWebhook(c.req.param("agentId")!, c.req.param("id"), body.data);
    return c.body(null, 204);
  })

  .delete("/:id", async (c) => {
    await deleteWebhook(c.req.param("agentId")!, c.req.param("id"));
    return c.body(null, 204);
  });

/** The address an outside service calls (public: the token in the path is the secret). */
export const publicHooks = new Hono().post(
  "/:token",
  bodyLimit({ maxSize: WEBHOOK_BODY_MAX, onError: (c) => c.json({ error: "body_too_large" }, 413) }),
  async (c) => {
    const token = c.req.param("token");
    const status = WEBHOOK_TOKEN.test(token) ? await receiveWebhook(token, await c.req.text()) : null;
    // A refused call answers 200: a service would retry on an error, and each retry is refused the same way.
    return status ? c.json({ status }) : c.json({ error: "not_found" }, 404);
  },
);
