import * as Haptics from "expo-haptics";
import { useState } from "react";

/*
 * The app's touch feedback, one word per kind of moment (Apple's HIG vocabulary):
 * - `tap`: a button that acts (header buttons, pull to refresh);
 * - `select`: a value that changes (switch, picker, a row that opens);
 * - `success` / `warning` / `error`: the outcome of an action.
 * A haptic never throws: no engine (simulator, Android without vibrator) is silent.
 */
const quiet = (p: Promise<void>) => void p.catch(() => {});

export const haptic = {
  tap: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  soft: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  select: () => quiet(Haptics.selectionAsync()),
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

/** `onPress` with a light tap first (no handler stays no handler: the button stays inert). */
export function withTap<A extends unknown[]>(fn: (...args: A) => unknown): (...args: A) => void;
export function withTap<A extends unknown[]>(fn: ((...args: A) => unknown) | undefined): ((...args: A) => void) | undefined;
export function withTap<A extends unknown[]>(fn: ((...args: A) => unknown) | undefined) {
  return (
    fn &&
    ((...args: A) => {
      haptic.tap();
      fn(...args);
    })
  );
}

/** Pull to refresh: a light tap, the spinner while `refetch` runs, gone even if it fails. Spread on a RefreshControl. */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    haptic.tap();
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}
