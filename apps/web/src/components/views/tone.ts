import type { StatusTone } from "@agora/core";

/** Badge colours of a status, from @agora/core `statusTone`. */
export const toneBadge: Record<StatusTone, string> = {
  danger: "bg-destructive/12 text-destructive",
  warning: "bg-warning/15 text-amber-700 dark:text-warning",
  success: "bg-success/12 text-success",
  info: "bg-brand/12 text-brand",
  neutral: "bg-foreground/[0.07] text-muted-foreground",
};

/** The same tone as a dot before the label. */
export const toneDot: Record<StatusTone, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-brand",
  neutral: "bg-muted-foreground/60",
};
