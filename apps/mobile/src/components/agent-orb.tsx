import { agentMascot, type AgentMascot } from "@agora/core";
import { useId } from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/* apps/web/src/components/AgentOrb.tsx, Figma « Orbe » */

/** Per palette colour: its light (top left), its body and its shade (also the eyes). */
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

/** A bot's face: a glossy sphere in its colour, lit from the top left, with two slanted eyes. */
export function AgentOrb({ color, size }: { color: string; size: number }) {
  const id = useId().replace(/[^\w-]/g, "");
  const [light, body, shade] = SHADES[agentMascot(color)];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={`${id}b`} cx="0.35" cy="0.3" r="0.78">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.5" stopColor={body} />
          <Stop offset="1" stopColor={shade} />
        </RadialGradient>
        <LinearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Circle cx={32} cy={32} r={32} fill={`url(#${id}b)`} />
      <Ellipse cx={22} cy={13} rx={13} ry={7.5} fill={`url(#${id}h)`} transform="rotate(18 22 13)" />
      <Rect x={23.5} y={16.5} width={4.5} height={10} rx={2.25} fill={shade} transform="rotate(14 25.75 21.5)" />
      <Rect x={35} y={15.5} width={4.5} height={10} rx={2.25} fill={shade} transform="rotate(-10 37.25 20.5)" />
    </Svg>
  );
}
