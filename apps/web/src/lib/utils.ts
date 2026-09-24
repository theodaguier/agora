import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The pieces a text was split into, each with a stable key: its offset in the text.
 * Stays the same across renders of the same text, unlike the index, and unique since offsets only grow.
 */
export function withOffsets<T extends string | object>(parts: T[]): [key: number, part: T][] {
  let at = 0;
  return parts.map((p) => {
    const key = at;
    const piece: string | object = p;
    const text = typeof piece === "string" ? piece : "text" in piece && typeof piece.text === "string" ? piece.text : "";
    at += Math.max(1, text.length);
    return [key, p];
  });
}

/** Keys drawn from the items themselves (`keyOf`), numbered when two items give the same one. */
export function contentKeys<T>(items: T[], keyOf: (item: T) => string): [key: string, item: T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [n ? `${base}#${n}` : base, item];
  });
}
