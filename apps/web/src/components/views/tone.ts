import type { StatusTone } from "@agora/core";
import type { CSSProperties } from "react";

/** A status tone as a dot before the label. */
export const toneDot: Record<StatusTone, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-brand",
  neutral: "bg-muted-foreground/60",
};

/** A status tone on a label or an icon (text and currentColor). */
export const toneText: Record<StatusTone, string> = {
  danger: "text-destructive",
  warning: "text-warning-foreground",
  success: "text-success",
  info: "text-brand",
  neutral: "text-muted-foreground",
};

/**
 * A status tone on an icon, as props: its colour inline, and data-tone so its paths keep it in a
 * highlighted menu row (see index.css).
 */
const tone = (color: string) => ({ "data-tone": "", style: { color } as CSSProperties });
export const toneColor: Record<StatusTone, ReturnType<typeof tone>> = {
  danger: tone("var(--destructive)"),
  warning: tone("var(--warning-foreground)"),
  success: tone("var(--success)"),
  info: tone("var(--brand)"),
  neutral: tone("var(--muted-foreground)"),
};
