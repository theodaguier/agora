import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** HeroUI's own screen margin around a popover (DEFAULT_INSETS in heroui-native). */
const MARGIN = 12;

/**
 * Screen edges a HeroUI popover (Menu, Select, Popover) must stay inside. HeroUI only counts the safe
 * area, so with the keyboard up a menu opened near the bottom lands under it; the keyboard's height
 * becomes the bottom edge. Pass as `insets` to the `*.Content`.
 */
export function usePopoverInsets() {
  const safe = useSafeAreaInsets();
  const keyboard = useKeyboardState((s) => (s.isVisible ? s.height : 0));
  return {
    top: MARGIN + safe.top,
    bottom: MARGIN + Math.max(safe.bottom, keyboard),
    left: MARGIN + safe.left,
    right: MARGIN + safe.right,
  };
}
