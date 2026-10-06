import { useSyncExternalStore } from "react";
import type { PanelKind } from "@/components/ConversationPanels";

/**
 * What each conversation has open beside its thread: the side panel, the Claude Code panel's tabs
 * and the one in front, the mockup. Left for another conversation, it is there again on return
 * (the thread's view itself unmounts when its tab shows another conversation). Kept in this
 * browser, per account; search is not kept (it reopens empty, taking the focus).
 */
export type ConversationSide = {
  panel: PanelKind | "info" | null;
  codeTabs: string[];
  codeSession: string | null;
  previewKey: string | null;
};

const EMPTY: ConversationSide = { panel: null, codeTabs: [], codeSession: null, previewKey: null };
/** Conversations remembered: the ones last changed. */
const KEEP = 50;

let storageKey = "";
let sides: Record<string, ConversationSide> = {};
const listeners = new Set<() => void>();

function load(userId: string) {
  const key = `agora.side.${userId}`;
  if (key === storageKey) return;
  storageKey = key;
  sides = {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, ConversationSide> | null;
    if (saved && typeof saved === "object")
      sides = Object.fromEntries(Object.entries(saved).filter(([, s]) => s && Array.isArray(s.codeTabs) && s.codeTabs.every((t) => typeof t === "string")));
  } catch {
    // Unreadable or blocked storage: nothing open.
  }
}

const isEmpty = (s: ConversationSide) => !s.panel && !s.codeTabs.length && !s.previewKey;

export function updateSide(conversationId: string, fn: (s: ConversationSide) => ConversationSide) {
  const next = fn(sides[conversationId] ?? EMPTY);
  const { [conversationId]: _, ...rest } = sides;
  // Last changed last: the oldest are dropped first.
  sides = isEmpty(next) ? rest : { ...rest, [conversationId]: next };
  const ids = Object.keys(sides);
  if (ids.length > KEEP) for (const id of ids.slice(0, ids.length - KEEP)) delete sides[id];
  try {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(sides, (k, v) => (k === "panel" && v === "search" ? null : v)));
  } catch {
    // Kept for this page only.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useConversationSide(userId: string, conversationId: string): ConversationSide {
  load(userId);
  return useSyncExternalStore(subscribe, () => sides[conversationId] ?? EMPTY);
}
