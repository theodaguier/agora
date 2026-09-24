/** The color ends up in a style: only hex colors and the theme's brand get through (the web's safeColor). */
export const safeColor = (c: string) => (c === "brand" || /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined);

/** `color` at 16%, the web's `color-mix(in oklch, color 16%, transparent)`, for a hex color. */
function tint(hex: string) {
  const h = hex.slice(1);
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
  const alpha = full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1;
  return `#${full.slice(0, 6)}${Math.round(alpha * 0.16 * 255).toString(16).padStart(2, "0")}`;
}

/**
 * Colors of a mention: colleagues are an `accent` chip (Agora's brand), bots in their own color,
 * the bot's data (a style: the value is only known at run time). `text`: the brand as a class, for
 * the composer's overlay, which is plain text.
 */
export function mentionStyle(color: string, onAccent = false) {
  // On a bubble of yours (the accent), any color would vanish or clash: a neutral chip.
  if (onAccent) return { chip: "default" as const, text: "text-accent-foreground", pillStyle: undefined, textStyle: undefined };
  const brand = color === "brand";
  return {
    chip: brand ? ("accent" as const) : ("default" as const),
    text: brand ? "text-link" : undefined,
    pillStyle: brand ? undefined : { backgroundColor: tint(color) },
    textStyle: brand ? undefined : { color },
  };
}
