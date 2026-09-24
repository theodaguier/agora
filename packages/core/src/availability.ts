/**
 * Whether an employee can be disturbed right now: their working hours, their
 * absences (leave, sick days…) and a manual "do not disturb", each read in
 * their own time zone. The same computation runs in the app (status of a
 * colleague, warning before writing to them) and in the api (agents' context,
 * notifications).
 */

/** "HH:MM", 00:00 to 24:00. */
export type TimeRange = { start: string; end: string };
/** Working hours per weekday, Monday first; an empty day is not worked. */
export type WeeklyHours = TimeRange[][];

export const ABSENCE_KINDS = ["vacation", "sick", "other"] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];

/** Whole local days, `endOn` included. */
export type Absence = { id: string; kind: AbsenceKind; startOn: string; endOn: string };

export type Schedule = {
  timezone: string;
  /** null = no working hours set: reachable at any time outside absences. */
  hours: WeeklyHours | null;
  /** Manual "do not disturb" until this instant (ISO). */
  dndUntil: string | null;
  absences: Absence[];
};

export type Availability =
  | { state: "available" }
  /** `lastDay`: last day of the absence (and of those that follow it without a break). */
  | { state: "absent"; kind: AbsenceKind; lastDay: string; back: string | null }
  | { state: "dnd"; until: string }
  | { state: "off_hours"; back: string | null };

export const DEFAULT_HOURS: WeeklyHours = [0, 1, 2, 3, 4, 5, 6].map((d) => (d < 5 ? [{ start: "09:00", end: "18:00" }] : []));

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Seven days of sorted, non-overlapping ranges; null when the hours can't be used. */
export function validHours(hours: unknown): WeeklyHours | null {
  if (!Array.isArray(hours) || hours.length !== 7) return null;
  const out: WeeklyHours = [];
  for (const day of hours) {
    if (!Array.isArray(day) || day.length > 4) return null;
    const ranges = day.map((r) => ({ start: String(r?.start ?? ""), end: String(r?.end ?? "") }));
    if (ranges.some((r) => !TIME.test(r.start) || !TIME.test(r.end) || toMinutes(r.start) >= toMinutes(r.end))) return null;
    ranges.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (ranges.some((r, i) => i > 0 && toMinutes(r.start) < toMinutes(ranges[i - 1]!.end))) return null;
    out.push(ranges);
  }
  return out;
}

type Wall = { day: string; weekday: number; minutes: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local day, weekday (0 = Monday) and minutes since midnight of an instant in `timeZone`. */
export function wallClock(at: number, timeZone: string): Wall {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday!),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Instant of `minutes` after midnight on local day `day` in `timeZone`. */
export function zonedInstant(day: string, minutes: number, timeZone: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let at = naive;
  // Two passes settle the offset, DST changes included.
  for (let i = 0; i < 2; i++) {
    const w = wallClock(at, timeZone);
    const [wy, wm, wd] = w.day.split("-").map(Number) as [number, number, number];
    at += naive - Date.UTC(wy, wm - 1, wd, 0, w.minutes);
  }
  return at;
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

const absenceOn = (s: Schedule, day: string) => s.absences.find((a) => a.startOn <= day && day <= a.endOn);

/** Next instant from `from` on that falls in working hours, outside absences (null beyond 60 days). */
export function nextAvailable(s: Schedule, from: number): number | null {
  const start = wallClock(from, s.timezone);
  for (let i = 0; i < 60; i++) {
    const day = addDays(start.day, i);
    if (absenceOn(s, day)) continue;
    const floor = i === 0 ? start.minutes : 0;
    const ranges = s.hours ? s.hours[weekdayOf(day)]! : [{ start: "00:00", end: "24:00" }];
    for (const r of ranges) {
      const at = Math.max(toMinutes(r.start), floor);
      if (at < toMinutes(r.end)) return i === 0 && at === start.minutes ? from : zonedInstant(day, at, s.timezone);
    }
  }
  return null;
}

/** Absence first, then manual "do not disturb", then working hours. */
export function availability(s: Schedule, now = Date.now()): Availability {
  const today = wallClock(now, s.timezone);
  const dnd = s.dndUntil ? Date.parse(s.dndUntil) : 0;
  const back = () => {
    const at = nextAvailable(s, Math.max(now, dnd));
    return at === null ? null : new Date(at).toISOString();
  };
  const absent = absenceOn(s, today.day);
  if (absent) {
    let lastDay = absent.endOn;
    for (let next; (next = absenceOn(s, addDays(lastDay, 1))); ) lastDay = next.endOn;
    return { state: "absent", kind: absent.kind, lastDay, back: back() };
  }
  if (dnd > now) return { state: "dnd", until: new Date(dnd).toISOString() };
  if (s.hours) {
    const m = today.minutes;
    const working = s.hours[today.weekday]!.some((r) => toMinutes(r.start) <= m && m < toMinutes(r.end));
    if (!working) return { state: "off_hours", back: back() };
  }
  return { state: "available" };
}
