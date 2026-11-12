import { View } from "react-native";
import { AgentOrb } from "@/components/agent-orb";
import { useResolveClassNames } from "uniwind";
import { cn } from "@/lib/utils";

/* apps/web/src/components/AgentAvatar.tsx, Figma « Avatar agent » */

/** Width of a `size-*` class, for components drawn at a given pixel size (SVG, masks); `size` props win over it. */
export function useSize(className: string | undefined, fallback: number) {
  const style = useResolveClassNames(className ?? "") as { width?: number };
  return typeof style.width === "number" ? style.width : fallback;
}

/** The bot's orb, the one of its colour (Figma « Orbe »). */
export function AgentAvatar({ agent, className, size: px }: { agent: { avatar: { color: string; shape?: string } }; className?: string; size?: number }) {
  const resolved = useSize(className, 40);
  const size = px ?? resolved;
  return (
    <View className={cn("shrink-0", className)} style={{ width: size, height: size }}>
      <AgentOrb color={agent.avatar.color} size={size} />
    </View>
  );
}
