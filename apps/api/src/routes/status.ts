import { Hono } from "hono";
import { errors } from "../errors.messages";
import { HermesError } from "../hermes-admin";
import { tr } from "../i18n";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { restartService, systemStatus } from "../status";

export const status = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    console.error("status", err);
    return c.json({ error: tr(errors).unexpected }, 500);
  })
  .get("/", async (c) => c.json(await systemStatus(c.get("user"))))
  .post("/:id/restart", async (c) => {
    await restartService(c.req.param("id"));
    return c.body(null, 202);
  });
