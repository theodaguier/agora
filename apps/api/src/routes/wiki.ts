import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { compileWiki, curatorStatus, wikiEnabled, wikiGraph, wikiPage } from "../memory";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { defineMessages, tr } from "../i18n";

const messages = defineMessages({
  en: { notConfigured: "Memory isn't configured (HERMES_HOME or WIKI_DIR)." },
  fr: { notConfigured: "La mémoire n'est pas configurée (HERMES_HOME ou WIKI_DIR)." },
});

/** Company memory (LLM Wiki vault): graph, pages, curator. */
export const wiki = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .use(async (c, next) => {
    if (!wikiEnabled()) return c.json({ error: tr(messages).notConfigured }, 503);
    await next();
  })

  .get("/graph", async (c) => {
    const agents = await db.select({ profile: schema.agent.hermesProfile, name: schema.agent.name }).from(schema.agent);
    const names = Object.fromEntries(agents.map((a) => [a.profile, a.name]));
    const [graph, status] = await Promise.all([wikiGraph(names), curatorStatus()]);
    return c.json({ ...graph, status });
  })

  .get("/page", async (c) => {
    const id = z.string().min(1).max(300).safeParse(c.req.query("id"));
    if (!id.success) return c.json({ error: "invalid_id" }, 400);
    const page = await wikiPage(id.data);
    return page ? c.json(page) : c.json({ error: "not_found" }, 404);
  })

  .get("/status", async (c) => c.json(await curatorStatus()))

  /** Starts the curator in the background; track progress with /status. */
  .post("/compile", async (c) => {
    const status = await curatorStatus();
    if (status.running) return c.json(status, 409);
    compileWiki().catch((err) => console.error("memory: compile", err));
    return c.json({ ...status, running: true }, 202);
  });
