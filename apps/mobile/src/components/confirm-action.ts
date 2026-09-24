import * as Haptics from "expo-haptics";

export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Label of the confirm button: the action itself ("Leave", "Delete"), never "OK". */
  action: string;
  /** Red confirm button; true by default, since this is for actions that can't be undone. */
  destructive?: boolean;
};

export type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

/** Set by the mounted ConfirmHost. */
let show: ((request: ConfirmRequest) => void) | null = null;

/** Called by ConfirmHost when it mounts (its way of showing a question), and with null when it unmounts. */
export function setConfirmPresenter(present: ((request: ConfirmRequest) => void) | null) {
  show = present;
}

/**
 * Asks before a destructive action; resolves true if confirmed.
 * `if (await confirmAction({ title, action })) remove.mutate()`.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (options.destructive !== false) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ ...options, resolve });
  });
}
