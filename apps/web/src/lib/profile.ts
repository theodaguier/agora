import { useSyncExternalStore } from "react";
import type { ProfileInput } from "./api";

/** Whose profile panel is open: a colleague or a bot. */
export type ProfileTarget = { kind: "user" | "agent"; id: string };

/** Opened from the sidebar, the members panel, a conversation header, a mention. */
let current: ProfileTarget | null = null;
const listeners = new Set<() => void>();

function set(target: ProfileTarget | null) {
  current = target;
  listeners.forEach((l) => l());
}

export const openProfile = (userId: string) => set({ kind: "user", id: userId });
export const openAgentProfile = (agentId: string) => set({ kind: "agent", id: agentId });
export const closeProfile = () => set(null);

export function useProfileTarget() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function readProfile(form: FormData): ProfileInput {
  const get = (name: string) => String(form.get(name) ?? "").trim();
  return { firstName: get("firstName"), lastName: get("lastName"), title: get("title"), username: get("username"), bio: get("bio") };
}

