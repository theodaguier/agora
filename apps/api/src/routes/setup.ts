import { profileSlug, soulTemplate } from "@agora/core";
import { eq, sql } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth";
import { db, schema } from "../db";
import { env } from "../env";
import { hermesApi, profileHome } from "../hermes";
import { createProfile, dashboard, HermesError } from "../hermes-admin";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { fullName, profileInput } from "../profile";
import { profileError, usernameTaken } from "./me";
import { getOrg, saveOrg, userCount } from "../org";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";

const messages = defineMessages({
  en: {
    hermesUnreachable: (status: number) => `Hermes is unreachable (${status})`,
    alreadyInstalled: "Setup is already done. Sign in.",
    invalidKey: "Invalid key.",
    noApiKey: "This provider can't be configured with an API key here.",
    keyRejected: "Key rejected by the provider.",
    invalidModel: "Invalid model.",
    noReply: (status: number) => `No reply from the model (HTTP ${status}).`,
    invalidFields: "Invalid fields.",
    badSetupCode: "Wrong installation code. It is printed in the server logs (./agora setup-code).",
  },
  fr: {
    hermesUnreachable: (status: number) => `Hermes injoignable (${status})`,
    alreadyInstalled: "L'installation est déjà faite. Connecte-toi.",
    invalidKey: "Clé invalide.",
    noApiKey: "Ce fournisseur ne se configure pas par clé API ici.",
    keyRejected: "Clé refusée par le fournisseur.",
    invalidModel: "Modèle invalide.",
    noReply: (status: number) => `Pas de réponse du modèle (HTTP ${status}).`,
    invalidFields: "Champs invalides.",
    badSetupCode: "Code d'installation incorrect. Il est affiché dans les logs du serveur (./agora setup-code).",
  },
});

/**
 * First-run wizard: as long as no account exists, anyone can create the
 * administrator account and the organization; the following steps
 * (AI provider, first agent) are restricted to that admin.
 */

/**
 * One-time installation code: whoever reaches a blank instance first must
 * also have access to the server (its logs) to become administrator.
 * AGORA_SETUP_TOKEN fixes it (automated installs); otherwise it is drawn at
 * random, once per process, and only while no account exists.
 */
let setupCode: string | null = null;

async function currentSetupCode() {
  if ((await userCount()) > 0) return (setupCode = null);
  if (!setupCode) {
    setupCode = env.AGORA_SETUP_TOKEN || randomBytes(6).toString("hex").replace(/(.{4})(?=.)/g, "$1-").toUpperCase();
    const line = "=".repeat(60);
    console.log(`\n${line}\n  Agora installation code: ${setupCode}\n  Enter it in the setup wizard to create the administrator.\n${line}\n`);
  }
  return setupCode;
}

/** Case, spaces and dashes don't matter: the code is typed by hand. */
const normalizeCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();

function setupCodeMatches(expected: string, given: string) {
  const a = Buffer.from(normalizeCode(expected));
  const b = Buffer.from(normalizeCode(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Printed at startup on a blank instance, so it's in the logs before anyone opens the wizard.
void currentSetupCode().catch(() => {});

const locale = z.enum(["fr", "en"]);
const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("fr", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

type RawProvider = { slug: string; name: string; auth_type?: string | null; key_env?: string | null; authenticated?: boolean; models?: string[] };

async function providerList() {
  const res = await hermesApi("default", "/api/model/options?refresh=true");
  if (!res.ok) throw new HermesError(tr(messages).hermesUnreachable(res.status));
  const raw = (await res.json()) as { provider: string; model: string; providers: RawProvider[] };
  return {
    current: { provider: raw.provider, model: raw.model },
    providers: raw.providers
      .filter((p) => (p.auth_type === "api_key" && p.key_env) || (p.authenticated && p.models?.length && p.auth_type !== "virtual"))
      .map((p) => ({ slug: p.slug, name: p.name, keyEnv: p.key_env || null, configured: !!p.authenticated, models: p.models ?? [] }))
      .sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name)),
  };
}

export const setup = new Hono<AppEnv>()
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    console.error("setup", err);
    return c.json({ error: tr(errors).unexpected }, 500);
  })

  /** Public state: should the wizard be shown? */
  .get("/", async (c) => {
    const org = await getOrg();
    return c.json({ needed: (await userCount()) === 0, completed: org.setupCompleted, org: { name: org.name, locale: org.locale, timezone: org.timezone } });
  })

  /** Step 1: organization + administrator account (only on a blank instance). */
  .post("/account", async (c) => {
    const body = z
      .object({
        orgName: z.string().trim().min(1).max(80),
        locale,
        timezone,
        // Same required profile as for an invitee (profile.ts).
        ...profileInput.shape,
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(10).max(200),
        setupCode: z.string().trim().max(100).default(""),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: profileError(body.error.issues) }, 400);
    const b = body.data;
    const expected = await currentSetupCode();
    if (!expected) return c.json({ error: tr(messages).alreadyInstalled }, 409);
    if (!setupCodeMatches(expected, b.setupCode)) return c.json({ error: tr(messages).badSetupCode }, 403);
    if (await usernameTaken(b.username)) return c.json({ error: tr(errors).usernameTaken }, 409);

    const ctx = await auth.$context;
    const created = await db.transaction(async (tx) => {
      // Lock: two people submitting at the same time don't create two admins.
      await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
      const [existing] = await tx.select({ id: schema.user.id }).from(schema.user).limit(1);
      if (existing) return false;
      const user = await ctx.internalAdapter.createUser(
        {
          email: b.email,
          name: fullName(b),
          emailVerified: true,
          role: "admin",
          firstName: b.firstName,
          lastName: b.lastName,
          title: b.title,
          username: b.username,
          bio: b.bio ?? "",
        },
        { method: "admin" },
      );
      await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(b.password) });
      return true;
    });
    if (!created) return c.json({ error: tr(messages).alreadyInstalled }, 409);
    setupCode = null;

    await saveOrg({ name: b.orgName, locale: b.locale, timezone: b.timezone, setupCompleted: false });
    void pushTimezoneToUpdater(b.timezone);
    // Direct sign-in: the Better Auth response carries the session cookie.
    return auth.api.signInEmail({ body: { email: b.email, password: b.password }, asResponse: true });
  })

  .use(requireUser, requireAdmin)

  /** Step 2: providers configurable by API key (list from Hermes). */
  .get("/providers", async (c) => c.json(await providerList()))

  .post("/provider", async (c) => {
    const body = z.object({ slug: z.string().regex(/^[\w.-]{1,60}$/), apiKey: z.string().trim().min(8).max(500) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: tr(messages).invalidKey }, 400);
    const { providers } = await providerList();
    const provider = providers.find((p) => p.slug === body.data.slug);
    if (!provider?.keyEnv) return c.json({ error: tr(messages).noApiKey }, 400);

    const check = await dashboard<{ ok: boolean; reachable: boolean; message?: string }>("/api/providers/validate", {
      method: "POST",
      body: JSON.stringify({ key: provider.keyEnv, value: body.data.apiKey }),
    });
    if (!check.ok && check.reachable) return c.json({ error: check.message || tr(messages).keyRejected }, 400);
    await dashboard("/api/env", { method: "PUT", body: JSON.stringify({ key: provider.keyEnv, value: body.data.apiKey }) });

    const refreshed = (await providerList()).providers.find((p) => p.slug === provider.slug);
    return c.json({ ok: true, unverified: !check.ok, models: refreshed?.models ?? [] });
  })

  .post("/model", async (c) => {
    const body = z
      .object({ slug: z.string().regex(/^[\w.-]{1,60}$/), model: z.string().trim().min(1).max(200), baseUrl: z.string().url().optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: tr(messages).invalidModel }, 400);
    await dashboard("/api/model/set", {
      method: "POST",
      body: JSON.stringify({ scope: "main", provider: body.data.slug, model: body.data.model, ...(body.data.baseUrl ? { base_url: body.data.baseUrl } : {}) }),
    });
    return c.json({ ok: true });
  })

  /** Checks end to end that Hermes responds with the chosen model. */
  .post("/test", async (c) => {
    const res = await hermesApi("default", "/v1/chat/completions", {
      method: "POST",
      headers: { "X-Hermes-Session-Id": `agora-setup-${Date.now()}` },
      body: JSON.stringify({ model: "hermes-agent", stream: false, messages: [{ role: "user", content: "Réponds uniquement : OK" }] }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!res.ok || !text) return c.json({ error: data.error?.message || tr(messages).noReply(res.status) }, 502);
    return c.json({ ok: true, reply: text.slice(0, 200) });
  })

  /** Step 3: first agent (Hermes profile, personality, admin access). */
  .post("/agent", async (c) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(60),
        role: z.string().trim().max(4000).default(""),
        avatarShape: z.enum(["bean", "pill", "triangle", "shield", "circle", "cloud", "drop"]),
        avatarColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: tr(messages).invalidFields }, 400);
    const org = await getOrg();

    let slug = profileSlug(body.data.name);
    if (slug === "default") slug = "agent-default";
    const taken = new Set((await db.select({ p: schema.agent.hermesProfile }).from(schema.agent)).map((r) => r.p));
    for (let i = 2; taken.has(slug); i++) slug = `${profileSlug(body.data.name)}-${i}`;

    await createProfile(slug, `Agent « ${body.data.name} »`);
    await writeFile(join(profileHome(slug), "SOUL.md"), soulTemplate({ name: body.data.name, org: org.name, locale: org.locale, role: body.data.role }));

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.agent).values({ id, name: body.data.name, hermesProfile: slug, avatarShape: body.data.avatarShape, avatarColor: body.data.avatarColor });
      await tx.insert(schema.agentAccess).values({ userId: c.get("user").id, agentId: id });
    });
    return c.json({ id, hermesProfile: slug }, 201);
  })

  .post("/complete", async (c) => {
    await saveOrg({ setupCompleted: true }, c.get("user").id);
    return c.json({ ok: true });
  });

/** The chosen time zone also sets the time window for automatic updates. */
async function pushTimezoneToUpdater(tz: string) {
  if (!env.UPDATER_URL) return;
  await fetch(`${env.UPDATER_URL}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.UPDATER_TOKEN}` },
    body: JSON.stringify({ timezone: tz }),
  }).catch(() => {});
}

export { eq };
