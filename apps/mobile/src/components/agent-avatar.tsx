import { Avatar } from "heroui-native";
import Svg, { Ellipse, Path } from "react-native-svg";
import { useResolveClassNames } from "uniwind";
import type { AvatarShape } from "@/lib/types";
import { cn } from "@/lib/utils";
import { avatarShapes } from "@/components/agent-avatar-shapes";

/* apps/web/src/components/AgentAvatar.tsx */

/** Width of a `size-*` class, for components drawn at a given pixel size (SVG, masks); `size` props win over it. */
export function useSize(className: string | undefined, fallback: number) {
  const style = useResolveClassNames(className ?? "") as { width?: number };
  return typeof style.width === "number" ? style.width : fallback;
}

/** The bot's creature alone (SVG), one shape and one color per agent: what the Avatar below hosts. */
export function AgentShape({ agent, size }: { agent: { avatar: { shape: AvatarShape; color: string } }; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d={avatarShapes[agent.avatar.shape] ?? avatarShapes.bean} fill={agent.avatar.color} />
      <Ellipse cx="12.5" cy="17.5" rx="1.5" ry="2.1" fill="#141414" />
      <Ellipse cx="19.5" cy="17.5" rx="1.5" ry="2.1" fill="#141414" />
    </Svg>
  );
}

/**
 * Small colored creature, one shape and one color per agent, in a HeroUI Avatar. The creature is
 * its own silhouette: the Avatar's disc stays transparent behind it.
 */
export function AgentAvatar({ agent, className, size: px }: { agent: { avatar: { shape: AvatarShape; color: string } }; className?: string; size?: number }) {
  const resolved = useSize(className, 40);
  const size = px ?? resolved;
  return (
    <Avatar
      alt=""
      variant="soft"
      color="default"
      animation="disable-all"
      background={null}
      className={cn("shrink-0 bg-transparent", className)}
      style={{ width: size, height: size }}
    >
      <Avatar.Fallback>
        <AgentShape agent={agent} size={size} />
      </Avatar.Fallback>
    </Avatar>
  );
}
