import { useSyncExternalStore } from "react";

export type SettingsTab = "general" | "availability" | "appearance" | "mobile" | "organization" | "users" | "agents" | "access" | "vault" | "integrations" | "models" | "memory" | "digest" | "usage" | "status" | "updates";

/** Open tab of the Paramètres dialog, or null when closed. Shared between the user menu and the composer. */
let current: SettingsTab | null = null;
const listeners = new Set<() => void>();

function set(tab: SettingsTab | null) {
  current = tab;
  listeners.forEach((l) => l());
}

export const openSettings = (tab: SettingsTab = "general") => set(tab);
export const closeSettings = () => set(null);

export function useSettingsTab() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
