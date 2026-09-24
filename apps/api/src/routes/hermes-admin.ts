import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { modelOptions, profileHome, toolsets } from "../hermes";
import { guessIntegrationType, INTEGRATION_TYPES } from "@agora/core";
import { clearType, getTypes, setType } from "../integrations";
import { agentMcpServers, dashboard, hermesCli, hermesCliJson, HermesError, restartGateway, scheduleGatewayRestart, setAgentMcp } from "../hermes-admin";
import { bumpAgentRevision } from "../company";
import { isRisky, setRiskyToolset } from "../sandbox";
import { registryInstallBody, searchRegistry } from "../mcp-registry";
import { skillsSh } from "../skills-sh";
import { installSkillsSh, isSkillsSh } from "../skills-sh-install";
import { deleteSecret, KEY, listVault, rawVault, saveRaw, saveSecret } from "../vault";
import { providerList, removeProviderKey, saveProviderKey, setDefaultModel, testDefaultModel } from "../providers";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";

const messages = defineMessages({
  en: {
    unknownAgent: "Unknown agent",
    unknownModel: "Unknown model for this provider",
    skillsShUnreachable: "skills.sh is unreachable.",
    registryUnreachable: "The MCP registry is unreachable.",
  },
  fr: {
    unknownAgent: "Agent inconnu",
    unknownModel: "Modèle inconnu pour ce fournisseur",
    skillsShUnreachable: "skills.sh est injoignable.",
    registryUnreachable: "Le registre MCP est injoignable.",
  },
});

const { agent } = schema;

/** Identifiers passed to the CLI / dashboard: never an option or a path. */
const ident = z.string().regex(/^[\w@./:-]{1,200}$/).refine((s) => !s.startsWith("-"));
const name = z.string().regex(/^[\w.-]{1,80}$/);
const providerSlug = z.string().regex(/^[\w.-]{1,60}$/);

async function profileOf(agentId: string) {
  const [row] = await db.select({ profile: agent.hermesProfile }).from(agent).where(eq(agent.id, agentId));
  if (!row) throw new HermesError(tr(messages).unknownAgent, 404);
  return row.profile;
}

async function json<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HermesError(tr(errors).invalidRequest, 400);
  return parsed.data;
}

export const hermesAdmin = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    if (err instanceof z.ZodError) return c.json({ error: tr(errors).invalidRequest }, 400);
    console.error("hermes admin", err);
    return c.json({ error: tr(errors).hermesUnreachable }, 502);
  })

  /* ---------- per agent (Hermes profile) ---------- */

  .get("/agents/:id/model", async (c) => c.json(await modelOptions(await profileOf(c.req.param("id")))))

  /** Profile's default model (config.yaml); takes effect on the next request. */
  .put("/agents/:id/model", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const { model } = await json(c, z.object({ model: ident }));
    const options = await modelOptions(profile);
    if (!options.models.some((m) => m.id === model)) throw new HermesError(tr(messages).unknownModel, 400);
    await hermesCli(["config", "set", "model.default", model], { profile });
    return c.body(null, 204);
  })

  .get("/agents/:id/toolsets", async (c) => c.json(await toolsets(await profileOf(c.req.param("id")))))

  /** Enables/disables a toolset for API server sessions (the app's sessions). */
  .put("/agents/:id/toolsets/:toolset", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const toolset = name.parse(c.req.param("toolset"));
    const { enabled } = await json(c, z.object({ enabled: z.boolean() }));
    if (isRisky(toolset)) await setRiskyToolset(profile, toolset, enabled);
    else await hermesCli(["tools", enabled ? "enable" : "disable", toolset, "--platform", "api_server"], { profile });
    return c.body(null, 204);
  })

  /** Personality (SOUL.md): the agent's identity and tone, re-read by Hermes on every reply. */
  .get("/agents/:id/soul", async (c) => {
    const path = join(profileHome(await profileOf(c.req.param("id"))), "SOUL.md");
    return c.json({ value: await readFile(path, "utf8").catch(() => "") });
  })

  .put("/agents/:id/soul", async (c) => {
    const path = join(profileHome(await profileOf(c.req.param("id"))), "SOUL.md");
    const { value } = await json(c, z.object({ value: z.string().max(20_000) }));
    await writeFile(path, value);
    await bumpAgentRevision(c.req.param("id"));
    return c.body(null, 204);
  })

  /** The agent's built-in memory (what it has learned): notes and user profiles. */
  .get("/agents/:id/memory", async (c) => {
    const dir = join(profileHome(await profileOf(c.req.param("id"))), "memories");
    const [notes, users] = await Promise.all(
      ["MEMORY.md", "USER.md"].map((f) => readFile(join(dir, f), "utf8").catch(() => "")),
    );
    return c.json({ notes, users });
  })

  .put("/agents/:id/memory", async (c) => {
    const dir = join(profileHome(await profileOf(c.req.param("id"))), "memories");
    const body = await json(c, z.object({ notes: z.string().max(10_000), users: z.string().max(10_000) }));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    await Promise.all([writeFile(join(dir, "MEMORY.md"), body.notes), writeFile(join(dir, "USER.md"), body.users)]);
    return c.body(null, 204);
  })

  /** The instance's MCP servers, and the ones this agent can use. */
  .get("/agents/:id/mcp", async (c) => c.json(await agentMcpServers(await profileOf(c.req.param("id")))))

  .put("/agents/:id/mcp/:server", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const { enabled } = await json(c, z.object({ enabled: z.boolean() }));
    await setAgentMcp(profile, name.parse(c.req.param("server")), enabled);
    // The gateway only discovers a profile's MCP servers when it starts.
    scheduleGatewayRestart();
    return c.body(null, 204);
  })

  .get("/agents/:id/skills", async (c) => c.json(await dashboard("/api/skills", { profile: await profileOf(c.req.param("id")) })))

  .put("/agents/:id/skills/:skill", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const { enabled } = await json(c, z.object({ enabled: z.boolean() }));
    await dashboard("/api/skills/toggle", { method: "PUT", profile, body: JSON.stringify({ name: name.parse(c.req.param("skill")), enabled, profile }) });
    return c.body(null, 204);
  })

  .get("/agents/:id/skills-hub", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const q = z.string().trim().min(1).max(100).parse(c.req.query("q"));
    return c.json(await dashboard(`/api/skills/hub/search?q=${encodeURIComponent(q)}&limit=20`, { profile }));
  })

  /**
   * Installs a skill from the hub. skills.sh: done right away by the app (skills-sh-install.ts),
   * answers {verdict}; otherwise a Hermes background task, tracked via /actions/:name.
   */
  .post("/agents/:id/skills-hub/install", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const { identifier } = await json(c, z.object({ identifier: ident }));
    if (isSkillsSh(identifier)) return c.json({ verdict: (await installSkillsSh(identifier, profile)).verdict });
    return c.json(await dashboard("/api/skills/hub/install", { method: "POST", profile, body: JSON.stringify({ identifier, profile }) }));
  })

  .delete("/agents/:id/skills/:skill", async (c) => {
    const profile = await profileOf(c.req.param("id"));
    const skill = name.parse(c.req.param("skill"));
    return c.json(await dashboard("/api/skills/hub/uninstall", { method: "POST", profile, body: JSON.stringify({ name: skill, profile }) }));
  })

  /** Official skills from the Hermes hub (curated catalog shipped with Hermes). */
  .get("/skills/official", async (c) => c.json(await dashboard("/api/skills/hub/official")))

  /** skills.sh catalog: ranking without a query, search otherwise. */
  .get("/skills/skills-sh", async (c) => {
    const q = z.string().trim().max(100).optional().parse(c.req.query("q"));
    try {
      return c.json({ skills: await skillsSh(q) });
    } catch (err) {
      console.error("skills.sh", err);
      throw new HermesError(tr(messages).skillsShUnreachable, 502);
    }
  })

  .get("/actions/:name", async (c) => c.json(await dashboard(`/api/actions/${encodeURIComponent(name.parse(c.req.param("name")))}/status`)))

  /* ---------- instance: MCP and plugins (loaded by the gateway, restart required) ---------- */

  /** Instance servers, each with its integration type (known or guessed). */
  .get("/mcp/servers", async (c) => {
    const [res, types] = await Promise.all([dashboard<{ servers: { name: string; description?: string }[] }>("/api/mcp/servers"), getTypes()]);
    return c.json({
      ...res,
      servers: res.servers.map((s) => ({ ...s, type: types[s.name] ?? guessIntegrationType(s.name, s.description), typeSet: !!types[s.name] })),
    });
  })

  .get("/mcp/types", async (c) => c.json(await getTypes()))

  .put("/mcp/servers/:server/type", async (c) => {
    const { type } = await json(c, z.object({ type: z.enum(INTEGRATION_TYPES) }));
    await setType(name.parse(c.req.param("server")), type);
    return c.body(null, 204);
  })

  .get("/mcp/catalog", async (c) => c.json(await dashboard("/api/mcp/catalog")))

  .post("/mcp/catalog/install", async (c) => {
    const { type, ...body } = await json(
      c,
      z.object({ name, env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(4000)).default({}), type: z.enum(INTEGRATION_TYPES).optional() }),
    );
    const res = await dashboard("/api/mcp/catalog/install", { method: "POST", body: JSON.stringify({ ...body, enable: true }) });
    if (type) await setType(body.name, type);
    return c.json(res);
  })

  /** Official MCP registry: search. */
  .get("/mcp/registry", async (c) => {
    const q = z.string().trim().min(2).max(100).parse(c.req.query("q"));
    try {
      return c.json({ servers: await searchRegistry(q) });
    } catch (err) {
      console.error("MCP registry", err);
      throw new HermesError(tr(messages).registryUnreachable, 502);
    }
  })

  /** Installs a server from the registry: its configuration is recomputed here from the registry. */
  .post("/mcp/registry/install", async (c) => {
    const body = await json(
      c,
      z.object({
        id: ident,
        env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(4000)).default({}),
        bearer_token: z.string().min(1).max(4000).optional(),
        oauth: z.boolean().default(false),
        type: z.enum(INTEGRATION_TYPES).optional(),
      }),
    );
    let server: Awaited<ReturnType<typeof registryInstallBody>>;
    try {
      server = await registryInstallBody(body.id, body);
    } catch (err) {
      throw new HermesError(err instanceof Error ? err.message : tr(messages).registryUnreachable, 400);
    }
    const res = await dashboard("/api/mcp/servers", { method: "POST", body: JSON.stringify(server) });
    if (body.type) await setType(server.name, body.type);
    return c.json(res, 201);
  })

  /** Custom MCP server: URL (http) or command (stdio). */
  .post("/mcp/servers", async (c) => {
    const body = await json(
      c,
      z
        .object({
          name,
          url: z.string().url().optional(),
          command: z.string().min(1).max(200).optional(),
          args: z.array(z.string().max(500)).max(30).default([]),
          env: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(4000)).default({}),
          bearer_token: z.string().max(4000).optional(),
        })
        .refine((b) => !!b.url !== !!b.command),
    );
    const auth = body.bearer_token ? "header" : undefined;
    return c.json(await dashboard("/api/mcp/servers", { method: "POST", body: JSON.stringify({ ...body, auth }) }), 201);
  })

  .put("/mcp/servers/:server/enabled", async (c) => {
    const { enabled } = await json(c, z.object({ enabled: z.boolean() }));
    await dashboard(`/api/mcp/servers/${name.parse(c.req.param("server"))}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) });
    return c.body(null, 204);
  })

  .post("/mcp/servers/:server/test", async (c) =>
    c.json(await dashboard(`/api/mcp/servers/${name.parse(c.req.param("server"))}/test`, { method: "POST" })),
  )

  .delete("/mcp/servers/:server", async (c) => {
    const server = name.parse(c.req.param("server"));
    await dashboard(`/api/mcp/servers/${server}`, { method: "DELETE" });
    await clearType(server);
    return c.body(null, 204);
  })

  .get("/plugins", async (c) => c.json(await hermesCliJson(["plugins", "list", "--json"])))

  .get("/plugins/search", async (c) => {
    const q = z.string().trim().max(100).parse(c.req.query("q") ?? "");
    return c.json(await hermesCliJson(["plugins", "search", ...(q ? [q] : []), "--json"], { timeoutMs: 60_000 }));
  })

  .post("/plugins/install", async (c) => {
    const { identifier } = await json(c, z.object({ identifier: ident }));
    await hermesCli(["plugins", "install", identifier, "--enable"], { timeoutMs: 300_000 });
    return c.body(null, 204);
  })

  .post("/plugins/:plugin/:action{enable|disable}", async (c) => {
    await hermesCli(["plugins", c.req.param("action"), name.parse(c.req.param("plugin"))]);
    return c.body(null, 204);
  })

  .delete("/plugins/:plugin", async (c) => {
    await hermesCli(["plugins", "remove", name.parse(c.req.param("plugin"))]);
    return c.body(null, 204);
  })

  /* ---------- credentials vault (.env of the instance and of the agents) ---------- */

  .get("/vault", async (c) => c.json(await listVault()))

  /** Developer view: the instance's credentials as .env text, values in clear. */
  .get("/vault/raw", async (c) => {
    console.info(`vault: raw view by ${c.get("user").email}`);
    return c.json({ text: await rawVault() });
  })

  .put("/vault/raw", async (c) => {
    const { text } = await json(c, z.object({ text: z.string().max(200_000) }));
    return c.json(await saveRaw(text));
  })

  /** Creates or updates a credential; without `value`, only changes which agents get it. */
  .put("/vault/:key", async (c) => {
    const key = z.string().regex(KEY).parse(c.req.param("key"));
    const body = await json(c, z.object({ value: z.string().min(1).max(8000).refine((v) => !/[\r\n]/.test(v)).optional(), agentIds: z.array(z.string()).max(500) }));
    await saveSecret(key, body);
    return c.body(null, 204);
  })

  .delete("/vault/:key", async (c) => {
    await deleteSecret(z.string().regex(KEY).parse(c.req.param("key")));
    return c.body(null, 204);
  })

  /* ---------- AI providers: keys given to every agent, default model ---------- */

  .get("/providers", async (c) => c.json(await providerList()))

  .put("/providers/:slug/key", async (c) => {
    const slug = providerSlug.parse(c.req.param("slug"));
    const { apiKey } = await json(c, z.object({ apiKey: z.string().trim().min(8).max(500) }));
    return c.json(await saveProviderKey(slug, apiKey, { restart: true }));
  })

  .delete("/providers/:slug/key", async (c) => {
    await removeProviderKey(providerSlug.parse(c.req.param("slug")));
    return c.body(null, 204);
  })

  .put("/providers/default", async (c) => {
    const body = await json(c, z.object({ slug: providerSlug, model: z.string().trim().min(1).max(200), baseUrl: z.string().url().optional() }));
    return c.json({ switched: await setDefaultModel(body.slug, body.model, body.baseUrl) });
  })

  .post("/providers/test", async (c) => c.json({ reply: await testDefaultModel() }))

  .post("/restart", async (c) => {
    await restartGateway();
    return c.body(null, 202);
  });
