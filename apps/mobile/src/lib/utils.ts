import { clsx, type ClassValue } from "clsx";
import { isValidElement, type Key } from "react";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The iOS text styles of global.css (`text-body`, `text-headline`…) are font sizes: without this,
 * tailwind-merge reads them as colors and `cn("text-body text-muted")` would drop the size.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["large-title", "title1", "title2", "title3", "headline", "body", "callout", "subheadline", "footnote", "caption1", "caption2"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `text.matchAll(re)` with its named groups: Hermes returns `groups: null` on matchAll results
 * (not on `exec`), so code reading `m.groups` loops with `exec` instead.
 */
export function* matchAll(text: string, re: RegExp): Generator<RegExpExecArray> {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (let m = r.exec(text); m; m = r.exec(text)) {
    yield m;
    // An empty match would otherwise loop forever at the same index.
    if (m[0] === "") r.lastIndex++;
  }
}

/**
 * React keys for the parts of a split text: the part's own content, numbered when it repeats. A key
 * follows its part rather than its position, so a text that grows (a streamed reply) keeps its chips.
 */
export function contentKeys<T>(parts: T[], keyOf: (part: T) => string): string[] {
  const seen = new Map<string, number>();
  return parts.map((part) => {
    const key = keyOf(part);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n ? `${key}#${n}` : key;
  });
}

/** Key of a row passed as a child: its own key when it has one (a filtered list keeps its rows), else its position. */
export function rowKey(row: unknown, index: number): Key {
  return isValidElement(row) && row.key != null ? row.key : index;
}
