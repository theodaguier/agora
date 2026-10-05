import { Hono } from "hono";
import { HermesError } from "../hermes-admin";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { errors } from "../errors.messages";
import { tr } from "../i18n";
import { decideBots, getBotRequest } from "../bot-requests";

/** Bots requested by bots. */
export const botRequests = new Hono<AppEnv>()
  .use(requireUser)
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    console.error("bot requests", err);
    return c.json({ error: tr(errors).hermesUnreachable }, 502);
  })
  .get("/:id", async (c) => c.json(await getBotRequest(c.req.param("id"), c.get("user"))))
  .post("/:id/approve", requireAdmin, async (c) => {
    await decideBots(c.req.param("id"), c.get("user").id, true);
    return c.json(await getBotRequest(c.req.param("id"), c.get("user")));
  })
  .post("/:id/reject", requireAdmin, async (c) => {
    await decideBots(c.req.param("id"), c.get("user").id, false);
    return c.json(await getBotRequest(c.req.param("id"), c.get("user")));
  });
