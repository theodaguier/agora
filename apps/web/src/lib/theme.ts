import { useSyncExternalStore } from "react";

/**
 * Color theme, remembered in this browser. "system" follows the OS setting.
 * public/theme-init.js applies the stored theme before the first paint (same key, same
 * logic) so the page never flashes the wrong palette.
 */
export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "agora.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

const isTheme = (value: unknown): value is Theme => value === "system" || value === "light" || value === "dark";

function stored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isTheme(value)) return value;
  } catch {}
  return "system";
}

let current = stored();
const listeners = new Set<() => void>();

function apply() {
  const dark = current === "dark" || (current === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

media.addEventListener("change", () => {
  if (current === "system") apply();
});
apply();

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  current = theme;
  apply();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useTheme = () => useSyncExternalStore(subscribe, () => current);

/** Whether the dark palette is showing right now (resolves "system"). */
export const useIsDark = () =>
  useSyncExternalStore(
    (l) => {
      const unsubscribe = subscribe(l);
      media.addEventListener("change", l);
      return () => {
        unsubscribe();
        media.removeEventListener("change", l);
      };
    },
    () => document.documentElement.classList.contains("dark"),
  );
