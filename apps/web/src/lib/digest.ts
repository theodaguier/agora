import { useSyncExternalStore } from "react";

/** Whether the morning recap dialog is open. Opened automatically once per recap, or from the user menu. */
let open = false;
const listeners = new Set<() => void>();

export function setDigestOpen(value: boolean) {
  open = value;
  listeners.forEach((l) => l());
}

export function useDigestOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
