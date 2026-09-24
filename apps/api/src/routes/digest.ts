import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../db";
import { digestConfigSchema, digestRunning, generateDigest, getDigestConfig, latestDigest, nextDigest, saveDigestConfig } from "../digest";
import { defineMessages, tr } from "../i18n";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";
import { getOrg } from "../org";

const messages = defineMessages({
  en: {
    invalid: "Check the time and pick at least one day.",
    weeklyDay: "The weekly recap's day must be one of the days recaps are written.",
  },
  fr: {
    invalid: "Vérifiez l'heure et choisissez au moins un jour.",
    weeklyDay: "Le jour du récap de la semaine doit faire partie des jours d'envoi.",
  },
});

/** What the admin sees: the settings, the last recap written and the next one. */
async function adminState() {
  const config = await getDigestConfig();
  const [last] = await db
    .select({
      day: schema.digest.day,
      kind: schema.digest.kind,
      periodStart: schema.digest.periodStart,
      periodEnd: schema.digest.periodEnd,
      status: schema.digest.status,
      error: schema.digest.error,
      updatedAt: schema.digest.updatedAt,
    })
    .from(schema.digest)
    .orderBy(desc(schema.digest.day))
    .limit(1);
  return { config, timezone: (await getOrg()).timezone, last: last ?? null, next: await nextDigest(config), running: digestRunning() };
}

/** Morning recap: the latest one, with the part addressed to the signed-in account; its settings (admin). */
export const digest = new Hono<AppEnv>()
  .use(requireUser)

  .get("/", async (c) => c.json(await latestDigest(c.get("user").id, c.get("user").role === "admin")))

  /** Marks a recap as seen, so it doesn't open again on another device. */
  .put("/seen", async (c) => {
    const body = z.object({ id: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    await db.update(schema.user).set({ digestSeen: body.data.id }).where(eq(schema.user.id, c.get("user").id));
    return c.body(null, 204);
  })

  .get("/config", requireAdmin, async (c) => c.json(await adminState()))

  .put("/config", requireAdmin, async (c) => {
    const body = digestConfigSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      const weekly = body.error.issues.some((i) => i.message === "weekly_day_not_scheduled");
      return c.json({ error: weekly ? tr(messages).weeklyDay : tr(messages).invalid }, 400);
    }
    await saveDigestConfig(body.data, c.get("user").id);
    return c.json(await adminState());
  })

  /**
   * Rewrites today's recap now (admin), without waiting for the scheduled time.
   * It takes minutes: started in the background, `digest.ready` tells when it's done.
   */
  .post("/generate", requireAdmin, async (c) => {
    if (!digestRunning()) void generateDigest().catch((err) => console.error("digest: generate", err));
    return c.json(await adminState(), 202);
  });
