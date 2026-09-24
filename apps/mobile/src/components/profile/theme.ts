import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Uniwind } from "uniwind";

/* apps/web/src/lib/theme.ts: system, light or dark, remembered on this phone. */

export type Theme = "system" | "light" | "dark";

export const THEMES: Theme[] = ["system", "light", "dark"];

const KEY = "agora.theme";
const isTheme = (v: unknown): v is Theme => v === "system" || v === "light" || v === "dark";

let current: Theme = "system";
const listeners = new Set<() => void>();

/** Applies the theme to Uniwind (and the native appearance, so headers and system sheets follow). */
export function setTheme(theme: Theme) {
  current = theme;
  Uniwind.setTheme(theme);
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(KEY, theme).catch(() => {});
}

/** Reads the saved theme at startup; call it once from the root layout. */
export async function restoreTheme() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (isTheme(saved) && saved !== "system") {
    current = saved;
    Uniwind.setTheme(saved);
    listeners.forEach((l) => l());
  }
}

export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
