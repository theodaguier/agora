import { useSyncExternalStore } from "react";

export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Label of the confirm button: the action itself ("Leave", "Delete"), never "OK". */
  action: string;
  /** Red confirm button; true by default, since this is for actions that can't be undone. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
// Keeps the text while the dialog fades out.
let shown: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Asks before a destructive action; resolves true if confirmed.
 * `if (await confirmAction({ title, action })) remove.mutate()`.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = shown = { ...options, resolve };
    emit();
  });
}

export function settle(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The pending confirmation, and the last one shown (kept while the dialog fades out). */
export function useConfirmState() {
  const current = useSyncExternalStore(subscribe, () => pending);
  return { open: !!current, shown: current ?? shown };
}
