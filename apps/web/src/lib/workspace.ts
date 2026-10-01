import { createContext, useContext, useSyncExternalStore, type DragEvent } from "react";

/**
 * Desktop workspace: side-by-side panes (split view), each with its own tabs. A tab is the path of
 * what it shows (`/c/<id>`, `/c/<id>/screen`, `/c/<id>/code/<session>`, `/c/<id>/preview/<key>`,
 * `/new`, `/tasks`, `/inbox`), and a path is open in one tab at most. The URL is the focused pane's
 * active tab: following a link replaces that tab, unless it is already open somewhere (then it
 * comes to the front). Kept in this browser, per account.
 */

export type Pane = { id: string; tabs: string[]; active: string | null };
export type Workspace = { panes: Pane[]; focused: string };

const DESKTOP = "(min-width: 768px)";

/** Most panes side by side: beyond, each gets too narrow for a thread. */
export const MAX_PANES = 4;

export type TabTarget =
  | { kind: "conversation"; conversationId: string }
  | { kind: "screen"; conversationId: string }
  | { kind: "code"; conversationId: string; sessionId: string }
  | { kind: "preview"; conversationId: string; previewKey: string }
  | { kind: "new" | "tasks" | "inbox" };

/** What a path shows in a tab; null for a path that is not one (home, settings routes…). */
export function parseTab(path: string): TabTarget | null {
  if (path === "/new" || path === "/tasks" || path === "/inbox") return { kind: path.slice(1) as "new" | "tasks" | "inbox" };
  const m = /^\/c\/([^/]+)(?:\/(screen)|\/code\/([^/]+)|\/preview\/([^/]+))?$/.exec(path);
  if (!m) return null;
  const conversationId = decodeURIComponent(m[1]!);
  if (m[2]) return { kind: "screen", conversationId };
  if (m[3]) return { kind: "code", conversationId, sessionId: decodeURIComponent(m[3]) };
  if (m[4]) return { kind: "preview", conversationId, previewKey: decodeURIComponent(m[4]) };
  return { kind: "conversation", conversationId };
}

const enc = encodeURIComponent;
export const tabPath = {
  conversation: (conversationId: string) => `/c/${enc(conversationId)}`,
  screen: (conversationId: string) => `/c/${enc(conversationId)}/screen`,
  code: (conversationId: string, sessionId: string) => `/c/${enc(conversationId)}/code/${enc(sessionId)}`,
  preview: (conversationId: string, previewKey: string) => `/c/${enc(conversationId)}/preview/${enc(previewKey)}`,
};

/* ---------- store ---------- */

const newPane = (tabs: string[] = [], active: string | null = tabs[0] ?? null): Pane => ({ id: crypto.randomUUID().slice(0, 8), tabs, active });

let storageKey = "";
let state: Workspace = (() => {
  const pane = newPane();
  return { panes: [pane], focused: pane.id };
})();
const listeners = new Set<() => void>();

function valid(w: unknown): w is Workspace {
  if (!w || typeof w !== "object") return false;
  const { panes, focused } = w as Workspace;
  return (
    Array.isArray(panes) &&
    panes.length > 0 &&
    panes.length <= MAX_PANES &&
    panes.every((p) => typeof p.id === "string" && Array.isArray(p.tabs) && p.tabs.every((t) => typeof t === "string" && parseTab(t))) &&
    panes.some((p) => p.id === focused)
  );
}

/** The account's workspace, as this browser left it (another account's is never shown). */
export function loadWorkspace(userId: string) {
  const key = `agora.workspace.${userId}`;
  if (key === storageKey) return;
  storageKey = key;
  const pane = newPane();
  state = { panes: [pane], focused: pane.id };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (valid(saved)) state = { ...saved, panes: saved.panes.map((p) => ({ ...p, active: p.active && p.tabs.includes(p.active) ? p.active : (p.tabs[0] ?? null) })) };
  } catch {
    // Unreadable or blocked storage: start from one empty pane.
  }
  listeners.forEach((l) => l());
}

function set(next: Workspace) {
  state = { ...next, focused: next.panes.some((p) => p.id === next.focused) ? next.focused : next.panes[0]!.id };
  try {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Kept for this page only.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useWorkspace = () => useSyncExternalStore(subscribe, () => state);

/** The focused pane's active tab: what the URL shows. */
export const currentTab = (w: Workspace = state) => w.panes.find((p) => p.id === w.focused)?.active ?? null;

const update = (paneId: string, fn: (p: Pane) => Pane, w: Workspace = state): Workspace => ({ ...w, panes: w.panes.map((p) => (p.id === paneId ? fn(p) : p)) });

/**
 * Without `path`, wherever it was open: its neighbour takes its place, and a pane it leaves
 * empty closes (unless it is the last one, or `keep`, the pane it is moving to).
 */
function without(w: Workspace, path: string, keep?: string): Workspace {
  const panes = w.panes.flatMap((p) => {
    const i = p.tabs.indexOf(path);
    if (i === -1) return [p];
    const tabs = p.tabs.filter((t) => t !== path);
    if (!tabs.length && p.id !== keep && w.panes.length > 1) return [];
    return [{ ...p, tabs, active: p.active === path ? (tabs[Math.min(i, tabs.length - 1)] ?? null) : p.active }];
  });
  if (panes.some((p) => p.id === w.focused)) return { panes, focused: w.focused };
  const was = w.panes.findIndex((p) => p.id === w.focused);
  return { panes, focused: panes[Math.max(0, Math.min(was - 1, panes.length - 1))]!.id };
}

export function focusPane(paneId: string) {
  if (state.focused !== paneId && state.panes.some((p) => p.id === paneId)) set({ ...state, focused: paneId });
}

/**
 * The URL changed (a link, back and forward): its tab comes to the front where it is open,
 * or replaces the focused pane's active tab (`newTab`: opens beside it instead).
 */
export function openHere(path: string, newTab = false) {
  if (!parseTab(path)) return;
  const owner = state.panes.find((p) => p.tabs.includes(path));
  if (owner) {
    if (owner.active !== path || state.focused !== owner.id) set({ ...update(owner.id, (p) => ({ ...p, active: path })), focused: owner.id });
    return;
  }
  set(
    update(state.focused, (p) => {
      const i = p.active ? p.tabs.indexOf(p.active) : -1;
      const tabs = p.tabs.slice();
      if (i === -1) tabs.push(path);
      else if (newTab) tabs.splice(i + 1, 0, path);
      else tabs[i] = path;
      return { ...p, tabs, active: path };
    }),
  );
}

/** Home: the focused pane shows nothing, its tabs stay. */
export function clearActive() {
  if (currentTab()) set(update(state.focused, (p) => ({ ...p, active: null })));
}

export function activateTab(paneId: string, path: string) {
  set({ ...update(paneId, (p) => ({ ...p, active: path })), focused: paneId });
}

export function closeTab(path: string) {
  if (state.panes.some((p) => p.tabs.includes(path))) set(without(state, path));
}

/** Closes the pane and its tabs. */
export function closePane(paneId: string) {
  if (state.panes.length < 2) return;
  const i = state.panes.findIndex((p) => p.id === paneId);
  const panes = state.panes.filter((p) => p.id !== paneId);
  set({ panes, focused: state.focused === paneId ? panes[Math.max(0, i - 1)]!.id : state.focused });
}

/** Moves a tab (dragged from a tab bar or the sidebar) into a pane, before its `index`-th tab (last by default). */
export function moveTab(path: string, toPane: string, index?: number) {
  const target = state.panes.find((p) => p.id === toPane);
  if (!target || !parseTab(path)) return;
  let at = index ?? target.tabs.length;
  // Within the pane: the index counted the tab's own place.
  const from = target.tabs.indexOf(path);
  if (from !== -1 && from < at) at -= 1;
  set({
    ...update(
      toPane,
      (p) => {
        const tabs = p.tabs.slice();
        tabs.splice(Math.min(at, tabs.length), 0, path);
        return { ...p, tabs, active: path };
      },
      without(state, path, toPane),
    ),
    focused: toPane,
  });
}

/**
 * Opens `path` in a new pane beside `nextTo` (the focused one by default), on its right unless
 * `side` says left. Already at the most panes: in the neighbouring pane on that side instead.
 */
export function openBeside(path: string, nextTo: string = state.focused, side: "left" | "right" = "right") {
  if (!parseTab(path) || !state.panes.some((p) => p.id === nextTo)) return;
  const w = without(state, path, nextTo);
  const i = w.panes.findIndex((p) => p.id === nextTo);
  if (w.panes.length >= MAX_PANES) {
    const neighbour = side === "right" ? (w.panes[i + 1] ?? w.panes[i - 1]) : (w.panes[i - 1] ?? w.panes[i + 1]);
    set(w);
    return moveTab(path, neighbour!.id);
  }
  const pane = newPane([path]);
  const panes = w.panes.slice();
  panes.splice(side === "right" ? i + 1 : i, 0, pane);
  // The pane the tab left empty closes.
  set({ panes: panes.filter((p) => p.tabs.length || p.id === pane.id), focused: pane.id });
}

/** A tab whose content became something else (a new Claude Code session, once started): same place, new path. */
export function replaceTab(from: string, to: string) {
  if (!parseTab(to)) return;
  const pane = state.panes.find((p) => p.tabs.includes(from));
  if (!pane) return;
  if (state.panes.some((p) => p.tabs.includes(to))) return set(without(state, from));
  set(update(pane.id, (p) => ({ ...p, tabs: p.tabs.map((t) => (t === from ? to : t)), active: p.active === from ? to : p.active })));
}

/**
 * What is left behind closes: on desktop its tab (the workspace moves the URL to the next one),
 * on a phone the screen goes back `home`.
 */
export function closeOrGoHome(path: string, home: () => void) {
  if (window.matchMedia(DESKTOP).matches && state.panes.some((p) => p.tabs.includes(path))) closeTab(path);
  else home();
}

/** A new empty pane on the right of the focused one: it offers conversations to open. */
export function splitEmpty() {
  if (state.panes.length >= MAX_PANES) return;
  const pane = newPane();
  const i = state.panes.findIndex((p) => p.id === state.focused);
  const panes = state.panes.slice();
  panes.splice(i + 1, 0, pane);
  set({ panes, focused: pane.id });
}

/* ---------- a tab's place ---------- */

/**
 * Where a screen renders. `current`: the tab the URL shows (keyboard shortcuts, the window's title,
 * files dropped outside every pane); `visible`: on screen, in whichever pane. Outside the workspace
 * (mobile), the one screen is both.
 */
export type TabPlace = { paneId: string | null; current: boolean; visible: boolean };
export const TabPlaceContext = createContext<TabPlace>({ paneId: null, current: true, visible: true });
export const useTabPlace = () => useContext(TabPlaceContext);

/* ---------- dragging tabs ---------- */

/** Data type of a tab dragged from a tab bar or the sidebar. */
export const TAB_DRAG = "application/x-agora-tab";

let draggingTab = false;
const dragListeners = new Set<() => void>();
export function setDraggingTab(on: boolean) {
  if (draggingTab === on) return;
  draggingTab = on;
  dragListeners.forEach((l) => l());
}
/** True while a tab is being dragged: the panes show where it can be dropped. */
export const useDraggingTab = () =>
  useSyncExternalStore(
    (l) => {
      dragListeners.add(l);
      return () => dragListeners.delete(l);
    },
    () => draggingTab,
  );

/** Drag data for a path; the sidebar's links and the tab bar share it. */
export function startTabDrag(e: DragEvent, path: string) {
  e.dataTransfer.setData(TAB_DRAG, path);
  e.dataTransfer.effectAllowed = "copyMove";
  // After the drag has started: changing the page during dragstart can cancel it.
  requestAnimationFrame(() => setDraggingTab(true));
}

export const draggedTab = (e: DragEvent) => (e.dataTransfer.types.includes(TAB_DRAG) ? e.dataTransfer.getData(TAB_DRAG) || null : null);

/* ---------- layout ---------- */

const subscribeDesktop = (cb: () => void) => {
  const mql = window.matchMedia(DESKTOP);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
/** Tabs and panes on desktop; on a phone, one screen at a time. */
export const useDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches);

/** A size in px remembered in this browser (sidebar, side panels). */
export function readSize(key: string, fallback: number) {
  try {
    const n = Number(localStorage.getItem(`agora.size.${key}`));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}
export function writeSize(key: string, px: number) {
  try {
    localStorage.setItem(`agora.size.${key}`, String(Math.round(px)));
  } catch {
    // Kept for this page only.
  }
}
