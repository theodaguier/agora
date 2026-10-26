import { useSyncExternalStore } from "react";

export type SettingsTab = "general" | "security" | "availability" | "appearance" | "mobile" | "organization" | "users" | "agents" | "access" | "vault" | "integrations" | "models" | "memory" | "digest" | "usage" | "status" | "server" | "updates";

/** Open tab of the Paramètres dialog, or null when closed. Shared between the user menu and the composer. */
let current: SettingsTab | null = null;
let requested = false;
const listeners = new Set<() => void>();

function set(tab: SettingsTab | null) {
  current = tab;
  if (tab !== null) requested = true;
  listeners.forEach((l) => l());
}

export const openSettings = (tab: SettingsTab = "general") => set(tab);
export const closeSettings = () => set(null);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Once requested, keep the dialog mounted so its close animation and state survive. */
export const useSettingsRequested = () => useSyncExternalStore(subscribe, () => requested);

export function useSettingsTab() {
  return useSyncExternalStore(
    subscribe,
    () => current,
  );
}
