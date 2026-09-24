/**
 * What agents can do with schedules: read those of the people in the
 * conversation (hours, "do not disturb", upcoming absences) and change them
 * with an ```availability``` block. A bot acts on behalf of the employee whose
 * turn it is: their own schedule, or anyone's when that employee is an admin.
 * Each change is posted in the conversation.
 */
import { ABSENCE_KINDS, validHours, wallClock, withHandles, zonedInstant, type Schedule, type WeeklyHours } from "@agora/core";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { publishSchedule, saveHours, schedulesOf, setDnd } from "./availability";
import { db, schema } from "./db";
import { postEvent } from "./messages";
import { resolveAssignee } from "./tasks";

const { absence, user } = schema;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const KIND_FR = { vacation: "congé", sick: "arrêt maladie", other: "autre absence" } as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/);

const changeSchema = z
  .object({
    /** @handle; the employee whose turn it is by default. */
    user: z.string().trim().min(1).max(120).optional(),
    /** Minutes from now, a local "AAAA-MM-JJTHH:MM" in the employee's time zone, or null to turn it off. */
    dnd: z.union([z.object({ minutes: z.number().int().min(1).max(7 * 24 * 60) }), z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }), z.null()]).optional(),
    /** The full week; a missing day is not worked. null removes the hours. */
    hours: z.partialRecord(z.enum(DAYS), z.array(range).max(4)).nullable().optional(),
    /** IANA time zone, or null for the organization's. */
    timezone: z.string().trim().min(1).max(64).nullable().optional(),
    addAbsences: z
      .array(z.object({ kind: z.enum(ABSENCE_KINDS), start: day, end: day, note: z.string().trim().max(200).optional() }))
      .max(10)
      .optional(),
    removeAbsences: z.array(z.string().min(1).max(64)).max(20).optional(),
  })
  .refine((c) => c.dnd !== undefined || c.hours !== undefined || c.timezone !== undefined || c.addAbsences?.length || c.removeAbsences?.length);

/** One change, or several (for different people). */
export const availabilityBlockSchema = z.union([changeSchema.transform((c) => [c]), z.array(changeSchema).min(1).max(10)]);

export type AvailabilityBlock = z.infer<typeof availabilityBlockSchema>;

export const AVAILABILITY_BLOCK_PROMPT = [
  "# Disponibilité",
  "L'app gère la disponibilité de chaque membre : horaires de travail, absences (jours entiers) et « ne pas déranger » temporaire, dans son fuseau horaire. Tu peux les modifier pour ton interlocuteur quand il te le demande, avec ce bloc, seul, à la fin de ta réponse (toutes les clés sont facultatives, mets seulement ce qui change) :",
  "```availability",
  '{"dnd": {"minutes": 60}, "addAbsences": [{"kind": "vacation", "start": "2026-10-05", "end": "2026-10-09", "note": "…"}], "removeAbsences": ["<id>"], "hours": {"mon": ["09:00-12:30", "14:00-18:00"], "tue": ["09:00-18:00"]}}',
  "```",
  "- Sans ce bloc, rien ne change : dès que tu annonces une modification, le bloc doit être dans la même réponse.",
  '- `dnd` : `{"minutes": N}`, `{"until": "AAAA-MM-JJTHH:MM"}` (heure locale de la personne) ou `null` pour le désactiver.',
  "- `addAbsences` : `kind` vaut `vacation` (congé), `sick` (arrêt maladie) ou `other` ; `start` et `end` (AAAA-MM-JJ) sont le premier et le dernier jour d'absence, inclus. `removeAbsences` : des `id` listés dans ton contexte.",
  "- `hours` : la semaine complète (`mon` … `sun`), un jour absent n'est pas travaillé ; `null` retire les horaires. Pars des horaires actuels du contexte. `timezone` : un fuseau IANA, ou `null` pour celui de l'organisation ; ne l'ajoute que si on te demande d'en changer.",
  '- Pour quelqu\'un d\'autre, ajoute `"user": "@handle"` ; seul un admin peut changer la disponibilité d\'un collègue. Plusieurs personnes : une liste de ces objets.',
  "- Ne change la disponibilité que si on te le demande ; annonce le changement dans ta réponse, en mots simples (jamais les valeurs du bloc comme `vacation`). Déduis les dates de la date du jour indiquée dans le contexte.",
].join("\n");

const fmtHours = (hours: WeeklyHours | null) =>
  hours
    ? hours.map((ranges, i) => `${DAY_FR[i]} ${ranges.length ? ranges.map((r) => `${r.start}-${r.end}`).join(", ") : "non travaillé"}`).join(" ; ")
    : "aucun horaire défini (joignable à toute heure)";

/** For each person in the conversation: their current schedule, with the absences' ids. */
export async function availabilityContext(people: { id: string; name: string }[]) {
  if (!people.length) return "";
  const schedules = await schedulesOf(people.map((p) => p.id));
  const now = Date.now();
  const lines = people.map((p) => {
    const s = schedules.get(p.id);
    if (!s) return null;
    const w = wallClock(now, s.timezone);
    const time = `${String(Math.floor(w.minutes / 60)).padStart(2, "0")}:${String(w.minutes % 60).padStart(2, "0")}`;
    const dnd = s.dndUntil && Date.parse(s.dndUntil) > now ? `activé jusqu'au ${new Date(s.dndUntil).toLocaleString("fr-FR", { timeZone: s.timezone })}` : "désactivé";
    const absences = s.absences.length
      ? s.absences.map((a) => `  - [${a.id}] ${KIND_FR[a.kind]} du ${a.startOn} au ${a.endOn}`).join("\n")
      : "  - aucune";
    return [
      `## ${p.name}`,
      `- Heure locale actuelle : ${DAY_FR[w.weekday]} ${w.day} ${time} (fuseau ${s.timezone})`,
      `- Horaires : ${fmtHours(s.hours)}`,
      `- Ne pas déranger : ${dnd}`,
      `- Absences à venir :\n${absences}`,
    ].join("\n");
  });
  return ["# Disponibilité des membres de la conversation", ...lines.filter(Boolean)].join("\n");
}

function toWeek(hours: Partial<Record<(typeof DAYS)[number], string[]>>): WeeklyHours | null {
  return validHours(DAYS.map((d) => (hours[d] ?? []).map((r) => ({ start: r.slice(0, 5), end: r.slice(6, 11) }))));
}

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export async function applyAvailabilityBlock(
  block: AvailabilityBlock,
  ctx: { conversationId: string; botName: string; requestedBy: string | null },
) {
  if (!ctx.requestedBy) return;
  const members = withHandles(
    await db
      .select({ id: user.id, name: user.name, username: user.username, role: user.role, timezone: user.timezone, hours: user.workHours })
      .from(user)
      .where(or(isNull(user.banned), eq(user.banned, false))),
  );
  const requester = members.find((m) => m.id === ctx.requestedBy);
  if (!requester) return;
  const schedules: Map<string, Schedule> = await schedulesOf(members.map((m) => m.id));

  for (const change of block) {
    const target = change.user ? resolveAssignee(change.user, members) : requester;
    if (!target || (target.id !== requester.id && requester.role !== "admin")) continue;
    const s = schedules.get(target.id);
    if (!s) continue;
    const person = target.name;

    if (change.dnd !== undefined) {
      const until =
        change.dnd === null
          ? null
          : "minutes" in change.dnd
            ? new Date(Date.now() + change.dnd.minutes * 60_000)
            : new Date(zonedInstant(change.dnd.until.slice(0, 10), Number(change.dnd.until.slice(11, 13)) * 60 + Number(change.dnd.until.slice(14, 16)), s.timezone));
      if (!until || until.getTime() > Date.now()) {
        await setDnd(target.id, until);
        await postEvent(ctx.conversationId, { type: "availability.dnd", actor: ctx.botName, person, until: until?.toISOString() ?? null, timezone: s.timezone });
      }
    }

    if (change.hours !== undefined || change.timezone !== undefined) {
      const hours = change.hours === undefined ? target.hours : change.hours === null ? null : toWeek(change.hours);
      const timezone = change.timezone === undefined ? target.timezone : change.timezone === null || !validZone(change.timezone) ? null : change.timezone;
      if (change.hours === undefined || change.hours === null || hours) {
        await saveHours(target.id, { timezone, hours });
        await postEvent(ctx.conversationId, { type: "availability.hours", actor: ctx.botName, person });
      }
    }

    let absencesChanged = false;
    for (const a of change.addAbsences ?? []) {
      if (a.end < a.start) continue;
      await db.insert(absence).values({
        id: crypto.randomUUID(),
        userId: target.id,
        kind: a.kind,
        startOn: a.start,
        endOn: a.end,
        note: a.note ?? "",
        createdBy: requester.id,
      });
      absencesChanged = true;
      await postEvent(ctx.conversationId, { type: "availability.absence", actor: ctx.botName, person, kind: a.kind, startOn: a.start, endOn: a.end, removed: false });
    }
    if (change.removeAbsences?.length) {
      const removed = await db
        .delete(absence)
        .where(and(eq(absence.userId, target.id), inArray(absence.id, change.removeAbsences)))
        .returning({ kind: absence.kind, startOn: absence.startOn, endOn: absence.endOn });
      for (const a of removed) {
        absencesChanged = true;
        await postEvent(ctx.conversationId, { type: "availability.absence", actor: ctx.botName, person, kind: a.kind, startOn: a.startOn, endOn: a.endOn, removed: true });
      }
    }
    if (absencesChanged) await publishSchedule(target.id);
  }
}

