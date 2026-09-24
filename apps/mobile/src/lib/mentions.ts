import type { AgentSummary, Person } from "./types";

/* apps/web/src/lib/mentions.tsx, the data part (the components are in components/mention*.tsx). */

/** Who a mention designates, to show their avatar and card. */
export type MentionTarget = { kind: "agent"; agent: AgentSummary } | { kind: "person"; person: Person & { handle: string } };

/** Mentionable bot (its name, avatar color) or colleague (their handle, brand color). */
export type Mentionable = { name: string; avatar: { color: string }; target?: MentionTarget };

export type MentionSegment = string | { name: string; color: string; text: string; target?: MentionTarget };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "@Name" not inside a word (an email) and followed by something other than a letter or digit; longest names first. */
function mentionRegex(list: Mentionable[]) {
  const names = [...new Set(list.map((m) => m.name))].sort((a, b) => b.length - a.length);
  return names.length ? new RegExp(`(?<![\\p{L}\\p{N}_.])@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
}

/** Colors are hex, or `brand` for colleagues (resolved by the component from the theme). */
export function splitMentions(text: string, list: Mentionable[]): MentionSegment[] {
  const re = mentionRegex(list);
  if (!re) return [text];
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const who = list.find((x) => x.name.toLowerCase() === m[1]!.toLowerCase())!;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ name: who.name, color: who.avatar.color, text: m[0], target: who.target });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
