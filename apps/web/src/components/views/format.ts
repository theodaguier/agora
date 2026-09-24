import { dateFormat, numberFormat } from "@/lib/intl";
import type { DraftView } from "@agora/core";

const valid = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "09:12" today, "Sep 12" this year, "Sep 12, 2025" otherwise. */
export function shortDate(iso?: string) {
  const d = valid(iso);
  if (!d) return iso ?? "";
  const now = new Date();
  if (sameDay(d, now) && /T\d/.test(iso!)) return dateFormat({ hour: "2-digit", minute: "2-digit" }).format(d);
  return dateFormat({ day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) }).format(d);
}

/** "Wednesday, September 24". */
export function dayLabel(iso: string) {
  const d = valid(iso);
  if (!d) return iso;
  return dateFormat({ weekday: "long", day: "numeric", month: "long" }).format(d);
}

export function time(iso?: string) {
  const d = valid(iso);
  return d && /T\d/.test(iso!) ? dateFormat({ hour: "2-digit", minute: "2-digit" }).format(d) : "";
}

export const dayKey = (iso: string) => valid(iso)?.toDateString() ?? iso;

export function money(amount: number, currency?: string) {
  try {
    return numberFormat(currency ? { style: "currency", currency } : { maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

/** ISO instant → value of an <input type="datetime-local"> (local time), and back. */
export function toLocalInput(iso?: string) {
  const d = valid(iso);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : "");

export const initials = (name: string) =>
  name
    .replace(/<.*>/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** "Léa Martin <lea@x.co>" → "Léa Martin". */
export const displayName = (from: string) => from.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "") || from;

/** Short label of a draft, for the employee's answer message. */
export function draftLabel(view: DraftView) {
  switch (view.type) {
    case "mail":
      return view.draft.subject || view.draft.to.join(", ");
    case "calendar":
    case "tasks":
      return view.draft.title;
    case "chat":
      return view.draft.channel;
  }
}

