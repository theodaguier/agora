import type { StatusTone } from "@agora/core";

/** A status tone as a dot before the label. */
export const toneDot: Record<StatusTone, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-brand",
  neutral: "bg-muted-foreground/60",
};
