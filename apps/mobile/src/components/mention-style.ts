/** The color ends up in a style: only hex colors and the theme's brand get through (the web's safeColor). */
export const safeColor = (c: string) => (c === "brand" || /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined);
