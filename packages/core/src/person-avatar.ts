/*
 * A colleague's avatar without a photo (Figma « Atelier · Théo »): their initials on a muted tint
 * of their own. Shared by the web and the mobile app so a person looks the same on both.
 */

/** Up to two capital letters: « Théo Daguier » → « TD ». */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const PERSON_TINTS = ["#6b5485", "#4d6e80", "#78664d", "#4f735c", "#5c6173", "#80565a", "#4d6a8a", "#7a5f78", "#5d7550", "#86684a"];

/** FNV-1a: close ids (« seed-u-1 », « seed-u-2 ») land far apart, so two colleagues side by side rarely share a tint. */
export const personTint = (id: string) =>
  PERSON_TINTS[[...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % PERSON_TINTS.length]!;

/** `hex` moved towards white (`to` 255) or black (`to` 0) by `k`: the light and shade of a bot's orb. */
export function shade(hex: string, to: number, k: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * k));
  return `rgb(${c.join(",")})`;
}
