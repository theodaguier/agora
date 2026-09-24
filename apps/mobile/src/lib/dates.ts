import { defineMessages, locale } from "./i18n";

/* apps/web/src/lib/dates.ts */

const messages = defineMessages({
  en: {
    today: "Today",
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
