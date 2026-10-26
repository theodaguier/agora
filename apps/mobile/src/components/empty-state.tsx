import type { AgentMascot } from "@agora/core";
import MaskedView from "@react-native-masked-view/masked-view";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Surface, Typography } from "heroui-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { mascotOf } from "@/components/agent-avatar";
import type { IconComponent } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/*
 * Figma « État vide » (apps/web/src/components/ui/empty.tsx + EmptyFigure.tsx). Two sizes:
 * - Grand, a screen with nothing in it yet: a clay figurine cut out (its feet fading out), a title, a sentence;
 * - Petit, a panel or a list in a screen: the icon in a grey tile, a title, a sentence.
 * The optional action is a secondary button under the text.
 */

/** The 7:5 frame of the cut-out figurines (public/mascots/*-solo.webp). */
const FIGURE = { width: 224, height: 160 };

export function EmptyState({
  mascot,
  icon: Icon,
  media,
  title,
  description,
  action,
  className,
}: {
  /** Grand: the figurine of this colour. */
  mascot?: AgentMascot;
  /** Petit: this icon in a grey tile. */
  icon?: IconComponent;
  /** Petit, something else in the tile (a spinner, a logo). */
  media?: ReactNode;
  title?: string;
  description?: ReactNode;
  action?: { label: string; onPress: () => void };
  className?: string;
}) {
  const large = !!mascot;
  return (
    <View className={cn("items-center px-8", large ? "gap-1.5 py-10" : "gap-1 py-8", className)}>
      {mascot ? (
        <MaskedView
          style={{ ...FIGURE, marginBottom: 4 }}
          maskElement={<LinearGradient colors={["black", "black", "transparent"]} locations={[0, 0.8, 1]} style={FIGURE} />}
        >
          <Image source={mascotOf(mascot).solo} style={FIGURE} contentFit="contain" accessibilityIgnoresInvertColors />
        </MaskedView>
      ) : (
        (Icon || media) && (
          <Surface variant="secondary" className="mb-2 size-11 items-center justify-center p-0">
            {Icon ? <Icon size={22} className="text-icon" /> : media}
          </Surface>
        )
      )}
      {!!title && (
        <Typography weight={large ? "semibold" : "medium"} type={large ? "body" : "body-sm"} align="center">
          {title}
        </Typography>
      )}
      {!!description && (
        <Typography type={large ? "body-sm" : "body-xs"} color="muted" align="center" className="max-w-72">
          {description}
        </Typography>
      )}
      {action && (
        <Button size="sm" variant="secondary" className="mt-3" onPress={withTap(action.onPress)}>
          {action.label}
        </Button>
      )}
    </View>
  );
}
