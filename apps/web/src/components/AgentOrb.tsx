import { agentMascot, type AgentMascot } from "@agora/core";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Figma « Orbe »: per palette colour, its light (top left), its body and its shade (also the eyes). */
const SHADES: Record<AgentMascot, readonly [string, string, string]> = {
  teal: ["#6fbcb3", "#3d7b76", "#173a37"],
  violet: ["#8f68cf", "#593789", "#28154a"],
  green: ["#7cc779", "#3f8a45", "#173a1c"],
  blue: ["#7aa5f5", "#3d64b8", "#162a5c"],
  orange: ["#f2a46a", "#c46a2c", "#5a2a0c"],
  red: ["#ee8580", "#b8423f", "#521817"],
  brown: ["#c49a7a", "#8a5d40", "#3b2415"],
  grey: ["#b4b8c0", "#6c7079", "#2a2c31"],
};

/**
 * A bot's face (Figma « Orbe »): a glossy sphere in its colour, lit from the top left, with two
 * slanted eyes. Drawn, so it stays sharp at every size, from a 16 px mention to a profile portrait.
 */
export function AgentOrb({ color, className }: { color: string; className?: string }) {
  const id = useId().replace(/[^\w-]/g, "");
  const [light, body, shade] = SHADES[agentMascot(color)];
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className ?? "size-10")}>
      <defs>
        <radialGradient id={`${id}-b`} cx="0.35" cy="0.3" r="0.78">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={body} />
          <stop offset="1" stopColor={shade} />
        </radialGradient>
        <linearGradient id={`${id}-h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id}-b)`} />
      <ellipse cx="22" cy="13" rx="13" ry="7.5" fill={`url(#${id}-h)`} transform="rotate(18 22 13)" />
      <rect x="23.5" y="16.5" width="4.5" height="10" rx="2.25" fill={shade} transform="rotate(14 25.75 21.5)" />
      <rect x="35" y="15.5" width="4.5" height="10" rx="2.25" fill={shade} transform="rotate(-10 37.25 20.5)" />
    </svg>
  );
}
