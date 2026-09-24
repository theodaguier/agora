/**
 * Employees' schedules (working hours, absences, manual "do not disturb") and
 * whether they can be disturbed right now. The computation itself lives in
 * @agora/core, shared with the app.
 *
 * `canDisturb` is the gate for anything that would alert someone (e-mail,
 * push…): check it before sending, and hold or drop the alert when it's false.
 */
import { addDays, availability, type Availability, type Schedule, type WeeklyHours } from "@agora/core";
import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "./db";
import { publishToAll } from "./events";
import { getOrg } from "./org";

const { absence, user } = schema;

/** Absences still to come (or ongoing): a day of margin covers every time zone. */
const since = () => addDays(new Date().toISOString().slice(0, 10), -1);

/** Schedules of the given employees, every active one by default. */
export async function schedulesOf(userIds?: string[]): Promise<Map<string, Schedule>> {
  if (userIds && !userIds.length) return new Map();
  const org = await getOrg();
  const people = await db
    .select({ id: user.id, timezone: user.timezone, hours: user.workHours, dndUntil: user.dndUntil })
    .from(user)
    .where(userIds ? inArray(user.id, userIds) : or(isNull(user.banned), eq(user.banned, false)));
  const ids = people.map((p) => p.id);
  const rows = ids.length
    ? await db
        .select({ id: absence.id, userId: absence.userId, kind: absence.kind, startOn: absence.startOn, endOn: absence.endOn })
        .from(absence)
        .where(and(inArray(absence.userId, ids), gte(absence.endOn, since())))
        .orderBy(asc(absence.startOn))
    : [];
  return new Map(
    people.map((p) => [
      p.id,
      {
        timezone: p.timezone ?? org.timezone,
        hours: p.hours,
        dndUntil: p.dndUntil?.toISOString() ?? null,
        absences: rows.filter((a) => a.userId === p.id).map(({ userId: _, ...a }) => a),
      },
    ]),
  );
}

export async function availabilityOf(userId: string, now = Date.now()): Promise<Availability | null> {
  const s = (await schedulesOf([userId])).get(userId);
  return s ? availability(s, now) : null;
}

/** False while the employee is absent, in "do not disturb" or outside their working hours. */
export async function canDisturb(userId: string) {
  const a = await availabilityOf(userId);
  return !a || a.state === "available";
}

/** Every open tab recomputes the colleague's status from it. */
export async function publishSchedule(userId: string) {
  const s = (await schedulesOf([userId])).get(userId);
  if (s) publishToAll({ type: "availability", userId, schedule: s });
}

export async function saveHours(userId: string, patch: { timezone: string | null; hours: WeeklyHours | null }) {
  await db.update(user).set({ timezone: patch.timezone, workHours: patch.hours }).where(eq(user.id, userId));
  await publishSchedule(userId);
}

export async function setDnd(userId: string, until: Date | null) {
  await db.update(user).set({ dndUntil: until }).where(eq(user.id, userId));
  await publishSchedule(userId);
}

/* ---------- Agents' context ---------- */

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const instantLabel = (iso: string, timeZone: string, now: number) => {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  const sameDay = at.toLocaleDateString("fr-FR", { timeZone }) === new Date(now).toLocaleDateString("fr-FR", { timeZone });
  if (sameDay) return `à ${time}`;
  return `le ${at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone })} à ${time}`;
};

/**
 * "absent·e jusqu'au vendredi 3 octobre inclus, de retour le lundi 6 octobre à 09:00"
 * for a directory line; null when the employee is available. Sick days read as a plain absence.
 */
export function availabilityNote(s: Schedule, now = Date.now()) {
  const a = availability(s, now);
  const back = (iso: string | null) => (iso ? `, de retour ${instantLabel(iso, s.timezone, now)}` : "");
  switch (a.state) {
    case "available":
      return null;
    case "absent":
      return `${a.kind === "vacation" ? "en congé" : "absent·e"} jusqu'au ${dayLabel(a.lastDay)} inclus${back(a.back)}`;
    case "dnd":
      return `en mode ne pas déranger jusqu'${instantLabel(a.until, s.timezone, now).replace(/^le /, "au ")}`;
    case "off_hours":
      return `hors de ses horaires de travail${back(a.back)}`;
  }
}

export const AVAILABILITY_PROMPT =
  "Quand un collègue est indiqué absent, en congé, en mode ne pas déranger ou hors de ses horaires : ne lui passe pas la main, ne le mentionne pas pour lui demander quelque chose et ne lui assigne pas de tâche urgente ou à échéance pendant son absence. Si on te demande de le joindre, dis-le et propose d'attendre son retour ou de t'adresser à quelqu'un d'autre. Celui qui t'écrit est là : ne lui fais pas remarquer son propre statut.";
