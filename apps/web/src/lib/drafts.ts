import { useCallback, useState } from "react";

/*
 * What is being written in a message field, kept in this browser: a refresh, another conversation or a
 * closed tab don't lose it. Saved a moment after the last keystroke (not on each one), and right away when
 * the page is hidden or closed. An emptied field (sent) drops its draft.
 */

const PREFIX = "agora.draft.";
const SAVE_MS = 400;

const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  clearTimeout(timer);
  timer = undefined;
  for (const [key, text] of pending) {
    try {
      if (text) localStorage.setItem(PREFIX + key, text);
      else localStorage.removeItem(PREFIX + key);
    } catch {
      // Full or blocked storage: kept for this page only.
    }
  }
  pending.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
}

function read(key: string) {
  const unsaved = pending.get(key);
  if (unsaved !== undefined) return unsaved;
  try {
    return localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function save(key: string, text: string) {
  pending.set(key, text);
  clearTimeout(timer);
  timer = setTimeout(flush, SAVE_MS);
}

/** A field's text kept under `key` (the account first: another account never sees it). */
export function useDraft(key: string) {
  const [draft, setDraft] = useState(() => ({ key, text: read(key) }));
  let text = draft.text;
  // Same field, another conversation or session: its own draft.
  if (draft.key !== key) {
    text = read(key);
    setDraft({ key, text });
  }
  const setText = useCallback(
    (value: string) => {
      setDraft({ key, text: value });
      save(key, value);
    },
    [key],
  );
  return [text, setText] as const;
}
