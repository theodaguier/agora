import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { defineMessages, useT } from "@/i18n";

export type SettingsTab = "general" | "security" | "availability" | "safe" | "appearance" | "mobile" | "organization" | "users" | "agents" | "access" | "vault" | "integrations" | "models" | "memory" | "machines" | "digest" | "usage" | "status" | "server" | "updates";

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

/** The address the app was opened at, read before the router rewrites it. */
const launch = new URLSearchParams(window.location.search);

const messages = defineMessages({
  en: { githubConnected: "GitHub connected.", githubFailed: "GitHub couldn't be connected, try again." },
  fr: { githubConnected: "GitHub connecté.", githubFailed: "Impossible de connecter GitHub, réessaie." },
});

/**
 * Back from GitHub (routes/github.ts settingsUrl): `?settings=integrations&github=connected|failed`
 * opens that tab and says how it went, then leaves the address clean.
 */
export function useSettingsFromUrl() {
  const t = useT(messages);
  useEffect(() => {
    const tab = launch.get("settings") as SettingsTab | null;
    if (!tab) return;
    const github = launch.get("github");
    launch.delete("settings");
    launch.delete("github");
    openSettings(tab);
    if (github === "connected") toast.success(t.githubConnected);
    else if (github === "failed") toast.error(t.githubFailed);
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    url.searchParams.delete("github");
    window.history.replaceState(window.history.state, "", url);
  }, [t]);
}
