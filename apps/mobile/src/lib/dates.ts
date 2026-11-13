import { defineMessages, locale } from "./i18n";
import { formatDueDate, toDay } from "./tasks";

/* apps/web/src/lib/dates.ts */

const messages = defineMessages({
  en: {
    today: "Today",
    tomorrow: "Tomorrow",
    yesterday: "Yesterday",
    online: "Online",
    justNow: "Seen just now",
    minutesAgo: (n: number) => `Seen ${n} min ago`,
    hoursAgo: (n: number) => `Seen ${n} h ago`,
    seenAt: (when: string) => `Seen ${when.replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}`,
    never: "Not connected yet",
  },
  fr: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    yesterday: "Hier",
    online: "En ligne",
    justNow: "Vu à l'instant",
    minutesAgo: (n: number) => `Vu il y a ${n} min`,
    hoursAgo: (n: number) => `Vu il y a ${n} h`,
    seenAt: (when: string) => `Vu ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    never: "Jamais connecté",
  },
});

const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });

/** "Today 11:06", "Yesterday 17:42", "Sep 12 09:15", in the interface language. */
export function dividerLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  const prefix = diff === 0 ? messages.today : diff === 1 ? messages.yesterday : day.format(date);
  return `${prefix} ${time.format(date)}`;
}

const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });

/** Time of a conversation list row: "10:44" today, "ven." this week, "24 oct." before. */
export function listTime(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return time.format(date);
  if (diff < 7) return weekday.format(date);
  return day.format(date);
}

/** A separator when more than an hour separates two messages. */
export const needsDivider = (prev: Date | undefined, next: Date) => !prev || next.getTime() - prev.getTime() > 3_600_000;

/** "Online", "Seen 5 min ago", "Seen 3 h ago", then "Seen yesterday 17:42" / "Seen Sep 12 09:15". */
export function presenceLabel(p: { online: boolean; lastSeenAt: string | null }) {
  const t = messages;
  if (p.online) return t.online;
  if (!p.lastSeenAt) return t.never;
  const at = new Date(p.lastSeenAt);
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return t.justNow;
  // Written out: Hermes has no Intl.RelativeTimeFormat.
  if (minutes < 60) return t.minutesAgo(minutes);
  if (minutes < 6 * 60) return t.hoursAgo(Math.floor(minutes / 60));
  return t.seenAt(dividerLabel(at));
}

/** A due date as Linear says it: « Aujourd'hui », « Demain », « Hier », then the date (web dueLabel). */
export function dueLabel(day: string) {
  const shift = (n: number) => toDay(new Date(Date.now() + n * 86_400_000));
  return day === toDay(new Date()) ? messages.today : day === shift(1) ? messages.tomorrow : day === shift(-1) ? messages.yesterday : formatDueDate(day);
}

/** How long ago, as short as the web's lists say it (web ageLabel): « 5min », « 3h », « 2j », then « 12 nov. ». */
export function ageLabel(date: Date) {
  const m = Math.max(1, Math.round((Date.now() - date.getTime()) / 60_000));
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}${locale === "fr" ? "j" : "d"}` : day.format(date);
}

/** "11:06": a message's time, on its author line or under your bubble. */
export const clockTime = (date: Date) => time.format(date);

const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });

/** The day between two runs of messages: "Today", "Yesterday", then "Monday 24 October". */
export function dayLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return messages.today;
  if (diff === 1) return messages.yesterday;
  const label = longDay.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
