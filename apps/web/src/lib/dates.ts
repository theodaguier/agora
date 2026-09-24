import { defineMessages, tr } from "@/i18n";
import { dateFormat, relativeTimeFormat } from "@/lib/intl";

const messages = defineMessages({
  en: {
    today: "Today",
    yesterday: "Yesterday",
    online: "Online",
    justNow: "Seen just now",
    seen: (when: string) => `Seen ${when}`,
    seenAt: (when: string) => `Seen ${when.replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}`,
    never: "Not connected yet",
  },
  fr: {
    today: "Aujourd'hui",
    yesterday: "Hier",
    online: "En ligne",
    justNow: "Vu à l'instant",
    seen: (when: string) => `Vu ${when}`,
    seenAt: (when: string) => `Vu ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    never: "Jamais connecté",
  },
});

/** "Today 11:06", "Yesterday 17:42", "Sep 12 09:15", in the interface language. */
export function dividerLabel(date: Date) {
  const time = dateFormat({ hour: "2-digit", minute: "2-digit" });
  const day = dateFormat({ day: "numeric", month: "short" });
  const t = tr(messages);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  const prefix = diff === 0 ? t.today : diff === 1 ? t.yesterday : day.format(date);
  return `${prefix} ${time.format(date)}`;
}

/** A separator when more than an hour separates two messages. */
export const needsDivider = (prev: Date | undefined, next: Date) => !prev || next.getTime() - prev.getTime() > 3_600_000;

/** "Online", "Seen 5 min ago", "Seen 3 h ago", then "Seen yesterday 17:42" / "Seen Sep 12 09:15". */
export function presenceLabel(p: { online: boolean; lastSeenAt: string | null }) {
  const t = tr(messages);
  if (p.online) return t.online;
  if (!p.lastSeenAt) return t.never;
  const at = new Date(p.lastSeenAt);
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return t.justNow;
  const rtf = relativeTimeFormat({ numeric: "always", style: "short" });
  if (minutes < 60) return t.seen(rtf.format(-minutes, "minute"));
  if (minutes < 6 * 60) return t.seen(rtf.format(-Math.floor(minutes / 60), "hour"));
  return t.seenAt(dividerLabel(at));
}

/** "YYYY-MM-DD" of a local date, as the API stores due dates. */
export const toDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local midnight of a "YYYY-MM-DD" day (not UTC, which would shift it a day back west of Greenwich). */
export const fromDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};

/** "Sep 12", or "Sep 12, 2027" outside the current year. */
export function formatDueDate(day: string) {
  const date = fromDay(day);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return dateFormat({ day: "numeric", month: "short", ...(!sameYear && { year: "numeric" }) }).format(date);
}

/** Due before today. */
export const isOverdue = (day: string | null) => !!day && day < toDay(new Date());
