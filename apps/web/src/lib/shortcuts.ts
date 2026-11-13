import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";

/**
 * Keyboard shortcuts. `mod` is ⌘ on Apple devices and Ctrl elsewhere. `shift` left
 * undefined is ignored, so "?" matches whichever layout needs Shift for it.
 * Combined with ⌘, only letters: punctuation moves between layouts (AZERTY needs Shift
 * for "." and "/") and ⌘ changes what the browser reports for it.
 * `typing: false` skips the shortcut while a field has the focus (single-key shortcuts).
 * `ctrl` is the Control key itself, on every platform (⌃ on a Mac, beside ⌘ which stays free).
 * A digit matches by its physical key too: on AZERTY, ⌃1 reports "&".
 */
export type Shortcut = { key: string; mod?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; typing?: false };

export const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent);

export const shortcuts = {
  palette: { key: "k", mod: true },
  newConversation: { key: "o", mod: true, shift: true },
  previousConversation: { key: "ArrowUp", alt: true },
  nextConversation: { key: "ArrowDown", alt: true },
  togglePanel: { key: "i", mod: true },
  // Handled by the shadcn SidebarProvider; listed here for tooltips and the help sheet.
  toggleSidebar: { key: "b", mod: true },
  searchConversation: { key: "f", mod: true, shift: false },
  settings: { key: ",", mod: true },
  help: { key: "?", typing: false },
  // Not ⌃Tab (the browser keeps it for its own tabs) nor ⌃← / ⌃→ (macOS switches desktops).
  nextTab: { key: "ArrowRight", ctrl: true, alt: true },
  previousTab: { key: "ArrowLeft", ctrl: true, alt: true },
} satisfies Record<string, Shortcut>;

/** ⌃1 to ⌃9: the code session tab n, ⌃9 the last one (as in browsers). */
export const tabShortcut = (n: number): Shortcut => ({ key: String(n), ctrl: true });

export function matches(e: KeyboardEvent, s: Shortcut) {
  const ctrl = !!s.ctrl || (!isApple && !!s.mod);
  const meta = isApple && !!s.mod;
  if (e.ctrlKey !== ctrl || e.metaKey !== meta || !!s.alt !== e.altKey) return false;
  if (s.shift !== undefined && s.shift !== e.shiftKey) return false;
  if (/^\d$/.test(s.key) && e.code === `Digit${s.key}`) return true;
  // With ⌥ on a Mac, `key` is the composed character (⌥B → "∫"): fall back to the physical key.
  return e.key.toLowerCase() === s.key.toLowerCase() || (e.altKey && e.code === `Key${s.key.toUpperCase()}`);
}

/** Runs `handler` on the shortcut, anywhere in the page, including while typing. */
export function useShortcut(shortcut: Shortcut, handler: (e: KeyboardEvent) => void, enabled = true) {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || !matches(e, shortcut)) return;
      if (shortcut.typing === false && (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      latest.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, enabled]);
}

const keyLabels: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "↵", Escape: "Esc", Tab: "Tab" };

/** Keys to display, in the platform's order: ["⌘", "⇧", "O"] or ["Ctrl", "Shift", "O"]. */
export function shortcutKeys(s: Shortcut): string[] {
  const keys: string[] = [];
  if (isApple) {
    if (s.ctrl) keys.push("⌃");
    if (s.alt) keys.push("⌥");
    if (s.shift) keys.push("⇧");
    if (s.mod) keys.push("⌘");
  } else {
    if (s.mod || s.ctrl) keys.push("Ctrl");
    if (s.alt) keys.push("Alt");
    if (s.shift) keys.push("Shift");
  }
  keys.push(keyLabels[s.key] ?? s.key.toUpperCase());
  return keys;
}

/** Which of the palette and the shortcuts list is open. Opened from the keyboard or the user menu. */
type Overlay = "palette" | "help" | null;
let current: Overlay = null;
const listeners = new Set<() => void>();

export function setOverlay(overlay: Overlay) {
  current = overlay;
  listeners.forEach((l) => l());
}

export function useOverlay() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
