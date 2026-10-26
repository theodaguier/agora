/**
 * Figma « Agora · Agents »: the 8 bot colours, each with its clay mascot. A bot's colour is its
 * accent in a conversation (your bubbles, send, primary buttons): « Agora · Accent du bot ».
 * Stored colours are snapped to the palette (older agents were saved with other hex values).
 */
export const AGENT_COLORS = ["#9a6a4b", "#1fa855", "#f26b1d", "#2f7cf6", "#14a89a", "#9a7cf0", "#9ca3af", "#e5484d"] as const;

/** The mascot of each palette colour, in the same order (file names of the mascot images). */
export const AGENT_MASCOTS = ["brown", "green", "orange", "blue", "teal", "violet", "grey", "red"] as const;
export type AgentMascot = (typeof AGENT_MASCOTS)[number];

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Index in AGENT_COLORS of the palette colour closest to `color`. */
export function agentColorIndex(color: string) {
  const [r, g, b] = rgb(color);
  let best = 0;
  let bestDistance = Infinity;
  AGENT_COLORS.forEach((c, i) => {
    const [r2, g2, b2] = rgb(c);
    const d = (r! - r2!) ** 2 + (g! - g2!) ** 2 + (b! - b2!) ** 2;
    if (d < bestDistance) [best, bestDistance] = [i, d];
  });
  return best;
}

/** The bot's accent: its colour, snapped to the palette. */
export const agentAccentColor = (color: string) => AGENT_COLORS[agentColorIndex(color)]!;

/** The mascot of a bot's colour. */
export const agentMascot = (color: string): AgentMascot => AGENT_MASCOTS[agentColorIndex(color)]!;
