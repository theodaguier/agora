import type { IntegrationType, StatusTone } from "@agora/core";
import type { ChipColor } from "heroui-native";

/* apps/web/src/components/views/tone.ts, as HeroUI Chip colors. The web's blue (--brand) is `accent`. */

/** A status tone as a HeroUI Chip color (`<Chip variant="soft" color={…}>`), from @agora/core `statusTone`. */
export const toneChip = { danger: "danger", warning: "warning", success: "success", info: "accent", neutral: "default" } as const satisfies Record<StatusTone, ChipColor>;

/**
 * apps/web/src/components/marketplace/IntegrationType.tsx `TYPE_TINT`, as a HeroUI color
 * (Chip, and Avatar which shares the same names): the color of an integration type's icon tile.
 */
export const TYPE_COLOR: Record<IntegrationType, ChipColor> = {
  mail: "accent",
  calendar: "danger",
  chat: "accent",
  tasks: "success",
  files: "warning",
  contacts: "success",
  finance: "success",
  code: "default",
  database: "warning",
  other: "default",
};
