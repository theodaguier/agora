import { AGENT_COLORS, agentAccentColor, agentMascot } from "@agora/core";

export type AvatarShape = "bean" | "pill" | "triangle" | "shield" | "circle" | "cloud" | "drop";

export const avatarShapes: Record<AvatarShape, string> = {
  bean: "M16 6c7.5 0 13 4.6 13 10.6S23.5 27 16 27 3 22.6 3 16.6 8.5 6 16 6Z",
  pill: "M11 9h10a8 8 0 0 1 0 16H11a8 8 0 0 1 0-16Z",
  triangle: "M14.3 5.1a2 2 0 0 1 3.4 0l11 19A2 2 0 0 1 27 27H5a2 2 0 0 1-1.7-2.9l11-19Z",
  shield: "M14.9 3.6a2 2 0 0 1 2.2 0l9 5.7a2 2 0 0 1 .9 1.7v9.6a2 2 0 0 1-.9 1.7l-9 5.7a2 2 0 0 1-2.2 0l-9-5.7a2 2 0 0 1-.9-1.7V11a2 2 0 0 1 .9-1.7l9-5.7Z",
  circle: "M16 4a12 12 0 1 1 0 24 12 12 0 0 1 0-24Z",
  cloud: "M10 26a7 7 0 0 1-1.2-13.9A8 8 0 0 1 24 10.3 7.5 7.5 0 0 1 23 26H10Z",
  drop: "M16 3.5s10 10.4 10 16.5a10 10 0 0 1-20 0C6 13.9 16 3.5 16 3.5Z",
};

/** Figma « Agora · Agents »: the 8 bot colours and their clay mascots (public/mascots), shared with mobile. */
export const avatarColors: readonly string[] = AGENT_COLORS;

/** The bot's accent in a conversation: its own colour, snapped to the palette. */
export const agentAccent = agentAccentColor;

/** The clay mascot of a colour: its head for avatars, the whole figure for the profile portrait. */
export function mascot(color: string) {
  const name = agentMascot(color);
  return { head: `/mascots/${name}.webp`, figure: `/mascots/${name}-figure.webp` };
}
