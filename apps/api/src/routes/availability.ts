import { ABSENCE_KINDS, validHours } from "@agora/core";
import { and, asc, eq, gte } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { publishSchedule, saveHours, setDnd } from "../availability";
import { db, schema } from "../db";
import { errors } from "../errors.messages";
import { defineMessages, tr } from "../i18n";
import { requireUser, type AppEnv } from "../middleware";
import { getOrg } from "../org";

const messages = defineMessages({
  en: {
    invalidHours: "Working hours: each range must end after it starts, without overlapping another.",
    invalidTimezone: "Unknown time zone.",
    invalidDates: "The absence must end on or after its first day.",
    absenceNotFound: "This absence no longer exists.",
  },
  fr: {
    invalidHours: "Horaires : chaque plage doit finir après son début, sans chevaucher une autre.",
    invalidTimezone: "Fuseau horaire inconnu.",
    invalidDates: "L'absence doit finir le jour de son début ou après.",
    absenceNotFound: "Cette absence n'existe plus.",
  },
});

const { absence, user } = schema;

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const absenceInput = z.object({
  kind: z.enum(ABSENCE_KINDS),
  startOn: day,
  endOn: day,
  note: z.string().trim().max(200).default(""),
});

/**
 * Someone's schedule: working hours, absences, "do not disturb". Everyone sees
 * the resulting status (presence snapshot); only the employee and admins edit
 * it and see the absences' notes. `:userId` may be "me".
 */
export const availability = new Hono<AppEnv>()
  .use(requireUser)
  .use("/:userId/*", async (c, next) => {
    if (!target(c)) return c.json({ error: tr(errors).notAllowed }, 403);
    await next();
  })

  .get("/:userId", async (c) => {
    const id = target(c);
    if (!id) return c.json({ error: tr(errors).notAllowed }, 403);
    const [row] = await db.select({ timezone: user.timezone, hours: user.workHours, dndUntil: user.dndUntil }).from(user).where(eq(user.id, id));
    if (!row) return c.json({ error: "not_found" }, 404);
    const today = new Date().toISOString().slice(0, 10);
    const absences = await db
      .select({ id: absence.id, kind: absence.kind, startOn: absence.startOn, endOn: absence.endOn, note: absence.note })
      .from(absence)
      .where(and(eq(absence.userId, id), gte(absence.endOn, today)))
      .orderBy(asc(absence.startOn));
    return c.json({ ...row, dndUntil: row.dndUntil?.toISOString() ?? null, orgTimezone: (await getOrg()).timezone, absences });
  })

  /** Time zone (null = the organization's) and weekly hours (null = none). */
  .put("/:userId/hours", async (c) => {
    const body = z.object({ timezone: timezone.nullable(), hours: z.unknown() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(messages).invalidTimezone }, 400);
    const hours = body.data.hours === null ? null : validHours(body.data.hours);
    if (body.data.hours !== null && !hours) return c.json({ error: tr(messages).invalidHours }, 400);
    await saveHours(target(c)!, { timezone: body.data.timezone, hours });
    return c.body(null, 204);
  })

  /** Manual "do not disturb" until an instant; null turns it off. */
  .put("/:userId/dnd", async (c) => {
    const body = z.object({ until: z.iso.datetime({ offset: true }).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(errors).invalidRequest }, 400);
    await setDnd(target(c)!, body.data.until ? new Date(body.data.until) : null);
    return c.body(null, 204);
  })

  .post("/:userId/absences", async (c) => {
    const body = absenceInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: tr(errors).invalidRequest }, 400);
    if (body.data.endOn < body.data.startOn) return c.json({ error: tr(messages).invalidDates }, 400);
    const id = crypto.randomUUID();
    await db.insert(absence).values({ id, userId: target(c)!, createdBy: c.get("user").id, ...body.data });
    await publishSchedule(target(c)!);
    return c.json({ id }, 201);
  })

  .delete("/:userId/absences/:id", async (c) => {
    const [row] = await db
      .delete(absence)
      .where(and(eq(absence.id, c.req.param("id")), eq(absence.userId, target(c)!)))
      .returning({ id: absence.id });
    if (!row) return c.json({ error: tr(messages).absenceNotFound }, 404);
    await publishSchedule(target(c)!);
    return c.body(null, 204);
  });

/** The employee whose schedule is read or changed: yourself, or anyone for an admin; null otherwise. */
function target(c: Context<AppEnv>) {
  const me = c.get("user");
  const id = c.req.param("userId");
  if (!id || id === "me" || id === me.id) return me.id;
  return me.role === "admin" ? id : null;
}
