import { agentMascot, type AgentMascot } from "@agora/core";
import { Image } from "expo-image";
import { Avatar } from "heroui-native";
import { useResolveClassNames } from "uniwind";
import { cn } from "@/lib/utils";

/* apps/web/src/components/AgentAvatar.tsx, Figma « Avatar agent » */

/**
 * The clay mascots, one per palette colour: the web's own files (apps/web/public/mascots), bundled
 * by Metro from the workspace (Expo watches the monorepo root), so the two apps share one copy.
 * `head`: the avatar crop; `figure`: the portrait of the agent's sheet; `solo`: the figurine cut out, for the large empty states.
 */
const MASCOTS: Record<AgentMascot, { head: number; figure: number; solo: number }> = {
  brown: {
    head: require("../../../web/public/mascots/brown.webp"),
    figure: require("../../../web/public/mascots/brown-figure.webp"),
    solo: require("../../../web/public/mascots/brown-solo.webp"),
  },
  green: {
    head: require("../../../web/public/mascots/green.webp"),
    figure: require("../../../web/public/mascots/green-figure.webp"),
    solo: require("../../../web/public/mascots/green-solo.webp"),
  },
  orange: {
    head: require("../../../web/public/mascots/orange.webp"),
    figure: require("../../../web/public/mascots/orange-figure.webp"),
    solo: require("../../../web/public/mascots/orange-solo.webp"),
  },
  blue: {
    head: require("../../../web/public/mascots/blue.webp"),
    figure: require("../../../web/public/mascots/blue-figure.webp"),
    solo: require("../../../web/public/mascots/blue-solo.webp"),
  },
  teal: {
    head: require("../../../web/public/mascots/teal.webp"),
    figure: require("../../../web/public/mascots/teal-figure.webp"),
    solo: require("../../../web/public/mascots/teal-solo.webp"),
  },
  violet: {
    head: require("../../../web/public/mascots/violet.webp"),
    figure: require("../../../web/public/mascots/violet-figure.webp"),
    solo: require("../../../web/public/mascots/violet-solo.webp"),
  },
  grey: {
    head: require("../../../web/public/mascots/grey.webp"),
    figure: require("../../../web/public/mascots/grey-figure.webp"),
    solo: require("../../../web/public/mascots/grey-solo.webp"),
  },
  red: {
    head: require("../../../web/public/mascots/red.webp"),
    figure: require("../../../web/public/mascots/red-figure.webp"),
    solo: require("../../../web/public/mascots/red-solo.webp"),
  },
};

/** The mascot images of a bot's colour (snapped to the palette). */
export const mascotOf = (color: string) => MASCOTS[agentMascot(color)];

/** Width of a `size-*` class, for components drawn at a given pixel size (SVG, masks); `size` props win over it. */
export function useSize(className: string | undefined, fallback: number) {
  const style = useResolveClassNames(className ?? "") as { width?: number };
  return typeof style.width === "number" ? style.width : fallback;
}

/** The bot's clay mascot, the one of its colour, in a HeroUI Avatar. The shape is still stored but no longer drawn. */
export function AgentAvatar({ agent, className, size: px }: { agent: { avatar: { color: string; shape?: string } }; className?: string; size?: number }) {
  const resolved = useSize(className, 40);
  const size = px ?? resolved;
  return (
    <Avatar alt="" variant="soft" color="default" animation="disable-all" className={cn("shrink-0", className)} style={{ width: size, height: size }}>
      <Avatar.Image source={mascotOf(agent.avatar.color).head} asChild>
        <Image style={{ width: "100%", height: "100%" }} contentFit="cover" />
      </Avatar.Image>
    </Avatar>
  );
}
