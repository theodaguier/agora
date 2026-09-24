import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "./db";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { env } from "./env";
import { version } from "./version";
import { admin } from "./routes/admin";
import { agents } from "./routes/agents";
import { attachments } from "./routes/attachments";
import { conversations } from "./routes/conversations";
import { digest } from "./routes/digest";
import { events } from "./routes/events";
import { hermesAdmin } from "./routes/hermes-admin";
import { inbox } from "./routes/inbox";
import { integrations } from "./routes/integrations";
import { host } from "./routes/host";
import { invitations } from "./routes/invitations";
import { me } from "./routes/me";
import { mobile } from "./routes/mobile";
import { mcpOAuthCallback, mcpRequests } from "./routes/mcp-requests";
import { presence } from "./routes/presence";
import { availability } from "./routes/availability";
import { skillRequests } from "./routes/skill-requests";
import { tasks } from "./routes/tasks";
import { updates } from "./routes/updates";
import { users } from "./routes/users";
import { wiki } from "./routes/wiki";
import { setupMemory } from "./memory";
import { setupScreen } from "./screen";
import { setupSandbox } from "./sandbox";
import { setupSharedSkills } from "./skill-requests";
import { ensureHermesInstance } from "./hermes-admin";
import { setup } from "./routes/setup";
import { status } from "./routes/status";
import { getOrg, ORG_AVATAR_ID } from "./org";
import { startUsageCollector } from "./usage";
import { startDigest } from "./digest";
import { recoverTurns } from "./bot-runner";
import { syncSessionSearch } from "./session-search";
import { usage } from "./routes/usage";
import { localeMiddleware } from "./i18n";
import { protectProcess } from "./harden";

protectProcess();

const app = new Hono()
  .basePath("/api")
  .use(logger())
  .use(localeMiddleware)
  .get("/health", (c) => c.json({ ok: true, version: version.app }))
  /** Public identity of the instance (login screen, title). */
  .get("/org", async (c) => {
    const org = await getOrg();
    return c.json({ name: org.name, locale: org.locale, image: org.image, requireTwoFactor: org.requireTwoFactor });
  })
  .get("/org/avatar", async (c) => {
    const [row] = await db.select().from(schema.orgAvatar).where(eq(schema.orgAvatar.id, ORG_AVATAR_ID));
    if (!row) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(row.data), {
      headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  })
  .route("/setup", setup)
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  .route("/agents", agents)
  .route("/attachments", attachments)
  .route("/conversations", conversations)
  .route("/digest", digest)
  .route("/events", events)
  .route("/inbox", inbox)
  .route("/integrations", integrations)
  .route("/invitations", invitations)
  .route("/me", me)
  .route("/mobile", mobile)
  .route("/mcp-requests", mcpRequests)
  .route("/presence", presence)
  .route("/availability", availability)
  .route("/skill-requests", skillRequests)
  .route("/tasks", tasks)
  .route("/mcp-oauth/callback", mcpOAuthCallback)
  .route("/usage", usage)
  .route("/users", users)
  .route("/admin/hermes", hermesAdmin)
  .route("/admin/host", host)
  .route("/admin/status", status)
  .route("/admin/updates", updates)
  .route("/admin/wiki", wiki)
  .route("/admin", admin);

export type AppType = typeof app;

// One after the other: two concurrent `hermes config set` on the same config.yaml
// clobber each other (the last write erases the other's setting).
ensureHermesInstance()
  .catch((err) => console.error("hermes: configuration", err))
  .then(() => setupMemory())
  .catch((err) => console.error("memory: setup", err))
  .then(() => setupScreen())
  .catch((err) => console.error("screen: setup", err))
  .then(() => setupSandbox())
  .catch((err) => console.error("sandbox: setup", err))
  .then(() => setupSharedSkills())
  .catch((err) => console.error("shared skills: setup", err));

startUsageCollector();
startDigest();
recoverTurns().catch((err) => console.error("bot-runner: recovery", err));
void syncSessionSearch();

export default { port: env.PORT, fetch: app.fetch, idleTimeout: 255, maxRequestBodySize: 30 * 1024 * 1024 };
