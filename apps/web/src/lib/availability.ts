import { addDays, availability, nextAvailable, wallClock, zonedInstant, type Absence, type Availability, type Schedule, type WeeklyHours } from "@agora/core";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { defineMessages, getLocale, intlLocale, tr } from "@/i18n";
import { api } from "./api";
import { presenceQuery, useMinuteTick } from "./presence";

const messages = defineMessages({
  en: {
    vacation: "On leave",
    absent: "Away",
    dnd: "Do not disturb",
    offHours: "Outside working hours",
    through: (day: string) => `until ${day}`,
    until: (w: When) => (w.day === "today" ? `until ${w.time}` : w.day === "tomorrow" ? `until tomorrow ${w.time}` : `until ${w.day} ${w.time}`),
    back: (w: When) => (w.day === "today" ? `back at ${w.time}` : w.day === "tomorrow" ? `back tomorrow at ${w.time}` : `back ${w.day} at ${w.time}`),
    minutes: (n: number) => `${n} minutes`,
    hours: (n: number) => (n === 1 ? "1 hour" : `${n} hours`),
    untilTomorrow: "Until tomorrow",
  },
  fr: {
    vacation: "En congé",
    absent: "Absent·e",
    dnd: "Ne pas déranger",
    offHours: "Hors horaires de travail",
    through: (day: string) => `jusqu'au ${day}`,
    until: (w: When) => (w.day === "today" ? `jusqu'à ${w.time}` : w.day === "tomorrow" ? `jusqu'à demain ${w.time}` : `jusqu'au ${w.day} ${w.time}`),
    back: (w: When) => (w.day === "today" ? `de retour à ${w.time}` : w.day === "tomorrow" ? `de retour demain à ${w.time}` : `de retour le ${w.day} à ${w.time}`),
    minutes: (n: number) => `${n} minutes`,
    hours: (n: number) => (n === 1 ? "1 heure" : `${n} heures`),
    untilTomorrow: "Jusqu'à demain",
  },
});

/** An instant as the viewer reads it: today, tomorrow or a weekday, and a time. */
type When = { day: "today" | "tomorrow" | (string & {}); time: string };

type Snapshot = { schedules: Record<string, Schedule> };

export function applySchedule(qc: QueryClient, userId: string, schedule: Schedule) {
  qc.setQueryData<Snapshot>(presenceQuery.queryKey, (old) => old && { ...old, schedules: { ...old.schedules, [userId]: schedule } });
}

/** A colleague's status right now, recomputed every minute (hours start and end without any event). */
export function useAvailability(userId: string): Availability {
  useMinuteTick();
  const schedule = useQuery({ ...presenceQuery, select: (s) => s.schedules?.[userId] }).data;
  return schedule ? availability(schedule) : { state: "available" };
}

/** Absent or in "do not disturb": the red dot. Outside working hours only greys the status. */
export const isAway = (a: Availability) => a.state === "absent" || a.state === "dnd";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** In the viewer's clock, not the colleague's time zone. */
function when(iso: string): When {
  const locale = intlLocale(getLocale());
  const at = new Date(iso);
  const time = at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (sameDay(at, now)) return { day: "today", time };
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(at, tomorrow)) return { day: "tomorrow", time };
  return { day: at.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" }), time };
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(intlLocale(getLocale()), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** Short status: "On leave", "Do not disturb"…; null when available. Sick days read as a plain absence. */
export function availabilityTitle(a: Availability) {
  const t = tr(messages);
  switch (a.state) {
    case "available":
      return null;
    case "absent":
      return a.kind === "vacation" ? t.vacation : t.absent;
    case "dnd":
      return t.dnd;
    case "off_hours":
      return t.offHours;
  }
}

/** "On leave until Friday, Oct 2 · back Monday, Oct 5 at 09:00"; null when available. */
export function availabilityLabel(a: Availability) {
  const t = tr(messages);
  const title = availabilityTitle(a);
  switch (a.state) {
    case "available":
      return null;
    case "absent":
      return [`${title} ${t.through(dayLabel(a.lastDay))}`, a.back && t.back(when(a.back))].filter(Boolean).join(" · ");
    case "dnd":
      return `${title} ${t.until(when(a.until))}`;
    case "off_hours":
      return [title, a.back && t.back(when(a.back))].filter(Boolean).join(" · ");
  }
}

/* ---------- Editing (yourself, or anyone for an admin) ---------- */

/** What the editor loads: the raw settings, and the absences with their notes. */
export type ScheduleSettings = {
  timezone: string | null;
  orgTimezone: string;
  hours: WeeklyHours | null;
  dndUntil: string | null;
  absences: (Absence & { note: string })[];
};

export const scheduleSettingsQuery = (userId: string) => ({
  queryKey: ["availability", userId],
  queryFn: () => api<ScheduleSettings>(`/availability/${encodeURIComponent(userId)}`),
});

export const setDnd = (userId: string, until: string | null) =>
  api(`/availability/${encodeURIComponent(userId)}/dnd`, { method: "PUT", body: JSON.stringify({ until }) });

/**
 * "Do not disturb" durations. "Until tomorrow" ends when the next working day
 * starts (9:00 without working hours), in the employee's time zone.
 */
export function dndPresets(s: Pick<Schedule, "timezone" | "hours">, now = Date.now()) {
  const t = tr(messages);
  const tomorrow = addDays(wallClock(now, s.timezone).day, 1);
  const midnight = zonedInstant(tomorrow, 0, s.timezone);
  const nextDay = (s.hours && nextAvailable({ ...s, dndUntil: null, absences: [] }, midnight)) || zonedInstant(tomorrow, 9 * 60, s.timezone);
  return [
    { label: t.minutes(30), until: now + 30 * 60_000 },
    { label: t.hours(1), until: now + 60 * 60_000 },
    { label: t.hours(2), until: now + 2 * 60 * 60_000 },
    { label: t.untilTomorrow, until: nextDay },
  ].map((p) => ({ label: p.label, until: new Date(p.until).toISOString() }));
}
