import { agentAccentColor, shade } from "@agora/core";
import { useId } from "react";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

/*
 * apps/web/src/components/AgentOrb.tsx, stop for stop: a bot's face is a soft sphere in its
 * palette colour, lit from the top left (Figma « Atelier · Théo », proposition en Geist).
 */
export function AgentOrb({ color, size }: { color: string; size: number }) {
  const id = useId().replace(/[^\w-]/g, "");
  const base = agentAccentColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={id} cx="0.4" cy="0.38" r="0.66">
          <Stop offset="0" stopColor={shade(base, 255, 0.22)} />
          <Stop offset="0.6" stopColor={base} />
          <Stop offset="1" stopColor={shade(base, 0, 0.3)} />
        </RadialGradient>
      </Defs>
      <Circle cx={32} cy={32} r={32} fill={`url(#${id})`} />
    </Svg>
  );
}
