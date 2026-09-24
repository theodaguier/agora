import { getOrg, invalidateOrg, ORG_AVATAR_ID, orgAvatarUrl, saveOrg } from "../org";
import { readAvatar } from "../profile";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createProfile, HermesError } from "../hermes-admin";
import { syncSessionSearch } from "../session-search";
import { COMPANY_MEMORY_KEY, COMPANY_MEMORY_MAX, companyMemory } from "../company";
import { db, schema } from "../db";
import { IntegrationError, listIntegrations, removeIntegration, saveIntegration } from "../app-integrations";
import { clearBrandLogos } from "../brand-logos";
import { createInvitation, InvitationError, resendInvitation } from "../invitations";
import { modelOptions } from "../hermes";
import { CLAUDE_CODE_PROVIDER, claudeCodeModels } from "../claude-code";
import { env } from "../env";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";

const messages = defineMessages({
  en: {
    invalidEmail: "Invalid email address.",
    emptyTitle: "The profile role can't be empty.",
    ownAdminRights: "You can't remove your own admin rights.",
    reservedProfile: "This profile name is reserved.",
    profileInUse: "An agent already uses this profile.",
  },
  fr: {
    invalidEmail: "Adresse email invalide.",
    emptyTitle: "Le rôle du profil ne peut pas être vide.",
    ownAdminRights: "Tu ne peux pas retirer tes propres droits d'admin.",
    reservedProfile: "Ce nom de profil est réservé.",
    profileInUse: "Un agent utilise déjà ce profil.",
  },
});

const { agent, agentAccess, invitation, modelBlock, setting, user } = schema;

const shapes = ["bean", "pill", "triangle", "shield", "circle", "cloud", "drop"] as const;

const agentInput = z.object({
  name: z.string().trim().min(1).max(60),
  hermesProfile: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  avatarShape: z.enum(shapes),
  avatarColor: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export const admin = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)

  .get("/users", async (c) => {
    const [users, access] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
          username: user.username,
          title: user.title,
        })
        .from(user)
        .orderBy(user.createdAt),
      db.select().from(agentAccess),
    ]);
    return c.json(users.map((u) => ({ ...u, agents: access.filter((a) => a.userId === u.id).map((a) => a.agentId) })));
  })

  /** Invitations not yet accepted (including expired ones, so they can be resent). */
  .get("/invitations", async (c) => {
    const rows = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })
      .from(invitation)
      .where(isNull(invitation.acceptedAt))
      .orderBy(desc(invitation.createdAt));
    return c.json(rows);
  })

  /** The account is created by the invitee themselves, by following the link received by email. */
  .post("/invitations", async (c) => {
    const body = z
      .object({ email: z.string().trim().email(), role: z.enum(["admin", "user"]).default("user") })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(messages).invalidEmail }, 400);
    try {
      return c.json(await createInvitation(body.data, c.get("user")), 201);
    } catch (err) {
      if (err instanceof InvitationError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  })

  .post("/invitations/:id/resend", async (c) => {
    try {
      return c.json(await resendInvitation(c.req.param("id"), c.get("user")));
    } catch (err) {
      if (err instanceof InvitationError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  })

  .delete("/invitations/:id", async (c) => {
    await db.delete(invitation).where(and(eq(invitation.id, c.req.param("id")), isNull(invitation.acceptedAt)));
    return c.body(null, 204);
  })

  /**
   * Two distinct "roles": `role` = access (admin/member), `title` = role shown
   * on the profile (free text: spouse, developer…).
   */
  .patch("/users/:id", async (c) => {
    const body = z
      .object({ role: z.enum(["admin", "user"]).optional(), title: z.string().trim().min(1).max(60).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(messages).emptyTitle }, 400);
    const id = c.req.param("id");
    // No removing your own rights: the instance must never end up without an admin.
    if (body.data.role && id === c.get("user").id && body.data.role !== "admin") {
      return c.json({ error: tr(messages).ownAdminRights }, 400);
    }
    const [row] = await db.update(user).set(body.data).where(eq(user.id, id)).returning({ id: user.id });
    return row ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
  })

  .put("/users/:id/agents", async (c) => {
    const body = z.object({ agentIds: z.array(z.string()) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.req.param("id");
    await db.transaction(async (tx) => {
      await tx.delete(agentAccess).where(eq(agentAccess.userId, userId));
      if (body.data.agentIds.length) {
        await tx.insert(agentAccess).values(body.data.agentIds.map((agentId) => ({ userId, agentId })));
      }
    });
    void syncSessionSearch();
    return c.body(null, 204);
  })

  /**
   * Models the agents can use (every provider signed in on their Hermes profiles, deduplicated),
   * Claude Code's for the subscription owner, and the ones blocked for each employee.
   */
  .get("/models", async (c) => {
    const owner = env.CLAUDE_CODE_OWNER_EMAIL.trim().toLowerCase();
    const [agents, blocks, [ownerRow]] = await Promise.all([
      db.select({ hermesProfile: agent.hermesProfile }).from(agent).where(eq(agent.onboarding, false)),
      db.select().from(modelBlock),
      owner ? db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${owner}`) : [],
    ]);
    const [results, ccModels] = await Promise.all([
      Promise.allSettled(agents.map((a) => modelOptions(a.hermesProfile))),
      ownerRow ? claudeCodeModels().catch((err) => (console.error("claude code: models", err), [])) : [],
    ]);
    const providers = new Map<string, Map<string, { id: string; reasoning: boolean; label?: string }>>();
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const p of [{ provider: r.value.provider, models: r.value.models }, ...r.value.others]) {
        const models = providers.get(p.provider) ?? new Map();
        for (const m of p.models) models.set(m.id, m);
        providers.set(p.provider, models);
      }
    }
    const blocked: Record<string, string[]> = {};
    for (const b of blocks) (blocked[b.userId] ??= []).push(b.model);
    return c.json({
      providers: [
        ...[...providers].map(([provider, models]) => ({ provider, models: [...models.values()], onlyFor: null as string | null })),
        // Personal subscription: only its owner can be allowed or forbidden these models.
        ...(ownerRow && ccModels.length
          ? [{ provider: CLAUDE_CODE_PROVIDER, models: ccModels.map(({ id, reasoning, label }) => ({ id, reasoning, label })), onlyFor: ownerRow.id }]
          : []),
      ],
      blocked,
      unreachable: results.filter((r) => r.status === "rejected").length,
    });
  })

  .put("/users/:id/models", async (c) => {
    const body = z.object({ blocked: z.array(z.string().max(200)).max(500) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.req.param("id");
    await db.transaction(async (tx) => {
      await tx.delete(modelBlock).where(eq(modelBlock.userId, userId));
      const models = [...new Set(body.data.blocked)];
      if (models.length) await tx.insert(modelBlock).values(models.map((model) => ({ userId, model })));
    });
    return c.body(null, 204);
  })

  /** Organization: name, agent language, time zone (set at install time). */
  .get("/org", async (c) => c.json(await getOrg()))

  /** Organization logo: raw body, already cropped by the app. */
  .put("/org/avatar", async (c) => {
    const upload = await readAvatar(c.req);
    if ("error" in upload) return c.json({ error: upload.error }, upload.status);
    const at = new Date();
    await db
      .insert(schema.orgAvatar)
      .values({ id: ORG_AVATAR_ID, ...upload, updatedAt: at })
      .onConflictDoUpdate({ target: schema.orgAvatar.id, set: { ...upload, updatedAt: at } });
    invalidateOrg();
    return c.json({ image: orgAvatarUrl(at) });
  })

  .delete("/org/avatar", async (c) => {
    await db.delete(schema.orgAvatar).where(eq(schema.orgAvatar.id, ORG_AVATAR_ID));
    invalidateOrg();
    return c.body(null, 204);
  })

  .put("/org", async (c) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        locale: z.enum(["fr", "en"]).optional(),
        timezone: z
          .string()
          .refine((tz) => {
            try {
              new Intl.DateTimeFormat("fr", { timeZone: tz });
              return true;
            } catch {
              return false;
            }
          })
          .optional(),
      })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    await saveOrg(body.data, c.get("user").id);
    return c.json(await getOrg());
  })

  /** The app's own integrations (Resend, logo.dev). */
  .get("/integrations", async (c) => c.json(await listIntegrations()))

  .put("/integrations/:id", async (c) => {
    const body = z.record(z.string(), z.string().max(2000)).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    try {
      await saveIntegration(c.req.param("id"), body.data, c.get("user").id);
    } catch (err) {
      if (err instanceof IntegrationError) return c.json({ error: err.message }, 400);
      throw err;
    }
    return c.json(await listIntegrations());
  })

  .delete("/integrations/:id", async (c) => {
    try {
      await removeIntegration(c.req.param("id"));
      // Without logo.dev, the logos it provided aren't kept.
      if (c.req.param("id") === "logodev") await clearBrandLogos();
    } catch (err) {
      if (err instanceof IntegrationError) return c.json({ error: err.message }, 404);
      throw err;
    }
    return c.json(await listIntegrations());
  })

  /** Shared memory: injected into every agent's context, on every message. */
  .get("/memory", async (c) => c.json({ value: await companyMemory(), max: COMPANY_MEMORY_MAX }))

  .put("/memory", async (c) => {
    const body = z.object({ value: z.string().max(COMPANY_MEMORY_MAX) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    await db
      .insert(setting)
      .values({ key: COMPANY_MEMORY_KEY, value: body.data.value, updatedBy: c.get("user").id })
      .onConflictDoUpdate({ target: setting.key, set: { value: body.data.value, updatedBy: c.get("user").id } });
    return c.body(null, 204);
  })

  .get("/agents", async (c) => c.json(await db.select().from(agent).orderBy(agent.createdAt)))

  /** Creates the agent and its Hermes profile. */
  .post("/agents", async (c) => {
    const body = agentInput.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    if (body.data.hermesProfile === "default") return c.json({ error: tr(messages).reservedProfile }, 400);
    const [taken] = await db.select({ id: agent.id }).from(agent).where(eq(agent.hermesProfile, body.data.hermesProfile));
    if (taken) return c.json({ error: tr(messages).profileInUse }, 409);
    try {
      await createProfile(body.data.hermesProfile, `Agent « ${body.data.name} »`);
    } catch (err) {
      const message = err instanceof HermesError ? err.message : tr(errors).profileCreateFailed;
      return c.json({ error: message }, 502);
    }
    const [row] = await db
      .insert(agent)
      .values({ id: crypto.randomUUID(), ...body.data })
      .returning();
    return c.json(row, 201);
  })

  .patch("/agents/:id", async (c) => {
    const body = agentInput.partial().safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const [row] = await db.update(agent).set(body.data).where(eq(agent.id, c.req.param("id"))).returning();
    return row ? c.json(row) : c.json({ error: "not_found" }, 404);
  });
