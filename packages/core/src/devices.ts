/**
 * Screen sizes a page can be looked at in: the agent's live screen (apps/api/src/screen.ts sets its
 * browser to one) and the HTML mockups (rendered at that width). CSS pixels, portrait for the
 * phone and the tablet; `scale` is the device pixel ratio the browser emulates.
 */
export type ScreenDevice = "mobile" | "tablet" | "desktop";

export const SCREEN_DEVICES: Record<ScreenDevice, { width: number; height: number; scale: number; mobile: boolean }> = {
  mobile: { width: 390, height: 844, scale: 2, mobile: true },
  tablet: { width: 820, height: 1180, scale: 2, mobile: true },
  desktop: { width: 1440, height: 900, scale: 1, mobile: false },
};

/** The live screen's size: one of the devices, or `auto`, the browser's own window. */
export type ScreenViewport = ScreenDevice | "auto";

export const SCREEN_VIEWPORTS = ["auto", "mobile", "tablet", "desktop"] as const satisfies readonly ScreenViewport[];
