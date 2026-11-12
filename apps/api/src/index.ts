import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { db, schema } from "./db";
import { logger } from "hono/logger";
import { auth } from "./auth";
import { env } from "./env";
import { version } from "./version";
import { admin } from "./routes/admin";
import { agents } from "./routes/agents";
import { artifacts, sharedArtifacts } from "./routes/artifacts";
import { attachments } from "./routes/attachments";
import { conversations, resumeQueues } from "./routes/conversations";
import { codeSessions, internalCode, mySessions } from "./routes/code-sessions";
import { github, internalGithub } from "./routes/github";
import { internalMcp } from "./mcp-gateway";
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
import { agentWebhooks, publicHooks } from "./routes/webhooks";
import { presence } from "./routes/presence";
import { availability } from "./routes/availability";
import { skillRequests } from "./routes/skill-requests";
import { botRequests } from "./routes/bot-requests";
import { tasks } from "./routes/tasks";
import { updates } from "./routes/updates";
import { users } from "./routes/users";
import { wiki } from "./routes/wiki";
import { internalVault, vaults } from "./routes/vaults";
import { setupMemory } from "./memory";
import { setupScreen } from "./screen";
import { setupSandbox } from "./sandbox";
import { setupCodePlugin } from "./code-plugin";
import { setupVaultPlugin } from "./vault-plugin";
import { recoverCodeSessions, startCodeSessionSweep } from "./code-sessions";
import { setupSharedSkills } from "./skill-requests";
import { ensureHermesInstance, shareMcpTokensWithAll } from "./hermes-admin";
import { setup } from "./routes/setup";
import { status } from "./routes/status";
import { server } from "./routes/server";
import { getOrg, ORG_AVATAR_ID } from "./org";
import { startUsageCollector } from "./usage";
import { startServerSampler } from "./server";
import { startDigest } from "./digest";
import { startPosthogAlertSync } from "./posthog-alert-sync";
import { recoverTurns } from "./bot-runner";
import { startCodeWake } from "./code-wake";
import { syncSessionSearch } from "./session-search";
import { usage } from "./routes/usage";
import { localeMiddleware } from "./i18n";
import { protectProcess } from "./harden";
import { MAX_FILE } from "./attachments";

protectProcess();

// Bun lets a body through up to the size of an attachment upload (written to disk as it
// arrives); every other route reads its body in memory and stays under this.
const BODY_LIMIT = 30 * 1024 * 1024;
const UPLOAD = /^\/api\/conversations\/[^/]+\/attachments$/;
const smallBodies = bodyLimit({ maxSize: BODY_LIMIT, onError: (c) => c.json({ error: "body_too_large" }, 413) });

const app = new Hono()
  .basePath("/api")
  // A webhook's address is its secret: it stays out of the logs.
  .use(logger((line, ...rest) => console.log(line.replace(/\/api\/hooks\/\S+/, "/api/hooks/…"), ...rest)))
  .use(localeMiddleware)
  .use((c, next) => (c.req.method === "POST" && UPLOAD.test(c.req.path) ? next() : smallBodies(c, next)))
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
  .route("/bot-requests", botRequests)
  .route("/artifacts", artifacts)
  // Share links (`/s/<token>`, rewritten by Caddy / Vite): public when the artifact is shared by link.
  .route("/s", sharedArtifacts)
  .route("/attachments", attachments)
  .route("/conversations", conversations)
  .route("/conversations/:id/code-sessions", codeSessions)
  .route("/code-sessions", mySessions)
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
  .route("/hooks", publicHooks)
  .route("/agents/:agentId/webhooks", agentWebhooks)
  .route("/usage", usage)
  .route("/users", users)
  .route("/vaults", vaults)
  .route("/github", github)
  .route("/admin/hermes", hermesAdmin)
  .route("/admin/host", host)
  .route("/admin/server", server)
  .route("/admin/status", status)
  .route("/admin/updates", updates)
  .route("/admin/wiki", wiki)
  .route("/admin", admin)
  // The agora_code Hermes plugin only (127.0.0.1, its own token).
  .route("/internal/code/github", internalGithub)
  .route("/internal/code", internalCode)
  // The agora_vault Hermes plugin only (127.0.0.1, its own token).
  .route("/internal/vault", internalVault)
  // The engines' MCP connectors (127.0.0.1, a token per run).
  .route("/internal/mcp", internalMcp);

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
  .then(() => setupCodePlugin())
  .catch((err) => console.error("code plugin: setup", err))
  .then(() => setupVaultPlugin())
  .catch((err) => console.error("vault plugin: setup", err))
  .then(() => setupSharedSkills())
  .catch((err) => console.error("shared skills: setup", err))
  .then(() => shareMcpTokensWithAll())
  .catch((err) => console.error("mcp tokens: setup", err));

startUsageCollector();
startServerSampler();
startDigest();
startPosthogAlertSync();
recoverTurns()
  .then(() => resumeQueues())
  .catch((err) => console.error("bot-runner: recovery", err));
startCodeWake();
recoverCodeSessions().catch((err) => console.error("code sessions: recovery", err));
startCodeSessionSweep();
void syncSessionSearch();

export default { port: env.PORT, fetch: app.fetch, idleTimeout: 255, maxRequestBodySize: MAX_FILE + 1024 * 1024 };
