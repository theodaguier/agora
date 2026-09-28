import { Hono } from "hono";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { serverReport } from "../server";

export const server = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get("/", async (c) => c.json(await serverReport(c.req.query("range") === "24h" ? "24h" : "1h")));
