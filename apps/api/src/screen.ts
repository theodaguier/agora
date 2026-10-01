import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { SCREEN_DEVICES, type ScreenViewport } from "@agora/core";
import { env } from "./env";
import { installHermesPlugin, restartGateway } from "./hermes-admin";

/**
 * Agent screen: live view of the browser a Hermes agent drives.
 *
 * The Hermes plugin agora_screen (infra/hermes-plugins) writes, after each
 * browser tool call, the DevTools endpoint of the session's headless Chromium
 * to `$HERMES_HOME/agora-screen/<session>.json`. This API shares the gateway's
 * network, so that endpoint (127.0.0.1) is reachable from here. The Chromium
 * a Claude Code session launches records itself there too (`screenEnv`).
 *
 * Nothing runs without a viewer: a conversation's screen is watched (one file
 * lookup every few seconds, then one CDP screencast shared by every viewer)
 * only while at least one member has it open. Chromium only sends a frame when
 * the page repaints, and viewers get at most
 * one frame per FRAME_MS: the last one. The browser itself is never
 * started here: Hermes closes it when idle, and the stream ends with it.
 * A member can also take control of it (`screenInput`): clicks, scrolling,
 * keys, navigation, and the size it renders at (a phone, a tablet, a computer).
 * That size is an override of this API's DevTools session: it lasts while the
 * screen is watched, and the browser gets its own window back when nobody is.
 */

export type ScreenFrame = { data: string; url: string; width: number; height: number };
export type ScreenState = { live: boolean; viewport: ScreenViewport };
export type ScreenViewer = { frame: (f: ScreenFrame) => void; state: (s: ScreenState) => void };
/** What a member does on the screen; x and y are fractions of the frame (0 to 1). */
export type ScreenInput =
  | { type: "click"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: string; code: string; keyCode: number; modifiers: number }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" | "forward" | "reload" }
  | { type: "viewport"; viewport: ScreenViewport };
type Control = (input: ScreenInput) => Promise<void>;

const FRAME_MS = 200;
const POLL_MS = 3_000;
/** Beyond this, a recorded browser is certainly closed (Hermes's idle timeout is minutes). */
const STALE_MS = 30 * 60_000;
const LOCAL_CDP = /^http:\/\/127\.0\.0\.1:(\d{2,5})$/;

const screenDir = () => (env.HERMES_HOME ? join(env.HERMES_HOME, "agora-screen") : "");

const alive = (port: number) =>
  fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) }).then(
    (r) => r.ok,
    () => false,
  );

/**
 * CDP port of the most recently used browser of the conversation that still answers (all its Hermes
 * sessions and Claude Code sessions, groups included). A record can outlive its browser: a Claude Code
 * session's script killed with its browser leaves its own behind, and is removed here.
 */
async function findBrowser(conversationId: string): Promise<number | null> {
  const dir = screenDir();
  if (!dir) return null;
  const prefix = `agora-${conversationId}`;
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (n) => n.endsWith(".json") && (n === `${prefix}.json` || n.startsWith(`${prefix}-`)),
  );
  const found: { port: number; at: number; path: string }[] = [];
  for (const name of names) {
    try {
      const path = join(dir, name);
      const at = (await stat(path)).mtimeMs;
      if (Date.now() - at > STALE_MS) continue;
      const m = LOCAL_CDP.exec(JSON.parse(await readFile(path, "utf8")).cdp ?? "");
      if (m) found.push({ port: Number(m[1]), at, path });
    } catch {
      // Being rewritten, or not ours: skip.
    }
  }
  for (const r of found.sort((a, b) => b.at - a.at)) {
    if (await alive(r.port)) return r.port;
    // Hermes's records are its plugin's (it rewrites them only for a new browser).
    if (r.path.startsWith(join(dir, `${prefix}-code-`))) await unlink(r.path).catch(() => {});
  }
  return null;
}

/** Text a key types (Enter: a carriage return, which submits forms); none for the others (Tab, arrows…). */
const typed = (key: string) => (key === "Enter" ? "\r" : key.length === 1 ? key : undefined);

type Target = { targetId: string; type: string; url: string };
type Send = (method: string, params?: object, sessionId?: string) => Promise<any>;

/** Renders the page at a device's size (touch included for the phone and the tablet), or in the browser's own window. */
async function applyViewport(send: Send, sessionId: string, viewport: ScreenViewport) {
  if (viewport === "auto") {
    await send("Emulation.clearDeviceMetricsOverride", {}, sessionId);
    await send("Emulation.setTouchEmulationEnabled", { enabled: false }, sessionId);
    return;
  }
  const d = SCREEN_DEVICES[viewport];
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: d.width, height: d.height, deviceScaleFactor: d.scale, mobile: d.mobile, screenWidth: d.width, screenHeight: d.height },
    sessionId,
  );
  await send("Emulation.setTouchEmulationEnabled", { enabled: d.mobile, ...(d.mobile && { maxTouchPoints: 5 }) }, sessionId);
}

const isPage = (t: Target) => t.type === "page" && !t.url.startsWith("devtools://");
const isBlank = (t: Target) => t.url === "about:blank" || t.url === "";

/**
 * One screencast of one browser, for as long as the socket lives. Resolves
 * when the browser goes away (closed by Hermes, or `close()`).
 */
async function cast(
  port: number,
  viewport: () => ScreenViewport,
  onFrame: (f: ScreenFrame) => void,
  onControl: (control: Control) => void,
  signal: AbortSignal,
) {
  const cdp = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.json());
  const version = await cdp("/json/version");
  // Most recently active first: seeded oldest → newest, the order the Map keeps.
  const opened: { id: string; type: string; url: string }[] = await cdp("/json/list").catch(() => []);
  const path = new URL(String(version.webSocketDebuggerUrl)).pathname;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  let nextId = 1;
  const pending = new Map<number, (result: any) => void>();
  const send: Send = (method, params = {}, sessionId) =>
    new Promise<any>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });

  const targets = new Map<string, Target>(opened.toReversed().map((t) => [t.id, { targetId: t.id, type: t.type, url: t.url }]));
  let current: { targetId: string; sessionId: string } | null = null;
  let latest: ScreenFrame | null = null;
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let switching = Promise.resolve();

  /** Shows the agent's most recent real page (a new tab it opened wins; about:blank only as a last resort). */
  const follow = () =>
    (switching = switching.then(async () => {
      const pages = [...targets.values()].filter(isPage);
      const pick = pages.filter((t) => !isBlank(t)).at(-1) ?? pages.at(-1);
      if (!pick || pick.targetId === current?.targetId || ws.readyState !== WebSocket.OPEN) return;
      if (current) void send("Target.detachFromTarget", { sessionId: current.sessionId });
      const { sessionId } = await send("Target.attachToTarget", { targetId: pick.targetId, flatten: true });
      if (!sessionId) return;
      current = { targetId: pick.targetId, sessionId };
      await applyViewport(send, sessionId, viewport());
      await send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1920, maxHeight: 1200 }, sessionId);
    }).catch(() => {}));

  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id) {
      pending.get(msg.id)?.(msg.result ?? {});
      pending.delete(msg.id);
      return;
    }
    const p = msg.params ?? {};
    switch (msg.method) {
      case "Target.targetCreated":
      case "Target.targetInfoChanged": {
        // The Map keeps insertion order: creation order, i.e. the newest tab last.
        // A new tab is born blank: re-evaluated when it gets its URL.
        const info = p.targetInfo as Target;
        targets.set(info.targetId, info);
        follow();
        break;
      }
      case "Target.targetDestroyed":
        targets.delete(p.targetId);
        if (p.targetId === current?.targetId) {
          current = null;
          follow();
        }
        break;
      case "Page.screencastFrame": {
        if (!current || msg.sessionId !== current.sessionId) break;
        void send("Page.screencastFrameAck", { sessionId: p.sessionId }, msg.sessionId);
        const t = targets.get(current.targetId);
        latest = { data: p.data, url: t?.url ?? "", width: p.metadata?.deviceWidth ?? 0, height: p.metadata?.deviceHeight ?? 0 };
        // At most one frame per FRAME_MS, and always the last one (the page's final state is never dropped).
        timer ??= setTimeout(() => {
          timer = null;
          lastSent = Date.now();
          if (latest) onFrame(latest);
        }, Math.max(0, lastSent + FRAME_MS - Date.now()));
        break;
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("CDP socket error"));
  });
  const closed = new Promise<void>((resolve) => {
    ws.onclose = () => resolve();
    ws.onerror = () => resolve();
  });
  const abort = () => ws.close();
  signal.addEventListener("abort", abort, { once: true });
  onControl(async (input) => {
    const session = current?.sessionId;
    if (!session) return;
    const on = (method: string, params: object = {}) => send(method, params, session);
    const at = (x: number, y: number) => ({ x: x * (latest?.width ?? 0), y: y * (latest?.height ?? 0) });
    switch (input.type) {
      case "click": {
        const point = at(input.x, input.y);
        await on("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
        await on("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await on("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
        break;
      }
      case "wheel":
        await on("Input.dispatchMouseEvent", { type: "mouseWheel", ...at(input.x, input.y), deltaX: input.dx, deltaY: input.dy });
        break;
      case "key": {
        const text = input.modifiers & ~8 ? undefined : typed(input.key);
        const key = { key: input.key, code: input.code, windowsVirtualKeyCode: input.keyCode, nativeVirtualKeyCode: input.keyCode, modifiers: input.modifiers };
        await on("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...key, ...(text && { text, unmodifiedText: text }) });
        await on("Input.dispatchKeyEvent", { type: "keyUp", ...key });
        break;
      }
      case "text":
        await on("Input.insertText", { text: input.text });
        break;
      case "navigate":
        await on("Page.navigate", { url: input.url });
        break;
      case "reload":
        await on("Page.reload");
        break;
      case "viewport":
        await applyViewport(send, session, input.viewport);
        break;
      case "back":
      case "forward": {
        const { currentIndex, entries } = await on("Page.getNavigationHistory");
        const entry = entries?.[currentIndex + (input.type === "back" ? -1 : 1)];
        if (entry) await on("Page.navigateToHistoryEntry", { entryId: entry.id });
        break;
      }
    }
  });
  try {
    // Not awaited: a browser closing before the reply would leave it pending forever.
    void send("Target.setDiscoverTargets", { discover: true });
    await closed;
  } finally {
    signal.removeEventListener("abort", abort);
    if (timer) clearTimeout(timer);
    for (const resolve of pending.values()) resolve({});
  }
}

class Screen {
  viewers = new Set<ScreenViewer>();
  last: ScreenFrame | null = null;
  live = false;
  /** The size its viewers chose; applied to every page it shows. */
  viewport: ScreenViewport = "auto";
  /** Drives the browser on display, while there is one. */
  control: Control | null = null;
  private controller = new AbortController();

  constructor(private conversationId: string) {
    void this.run();
  }

  get state(): ScreenState {
    return { live: this.live, viewport: this.viewport };
  }

  private setLive(live: boolean) {
    if (live === this.live) return;
    this.live = live;
    if (!live) this.last = null;
    for (const v of this.viewers) v.state(this.state);
  }

  async setViewport(viewport: ScreenViewport) {
    if (viewport === this.viewport) return;
    this.viewport = viewport;
    for (const v of this.viewers) v.state(this.state);
    await this.control?.({ type: "viewport", viewport });
  }

  private async run() {
    const { signal } = this.controller;
    while (!signal.aborted) {
      const port = await findBrowser(this.conversationId);
      // A newer browser of the conversation (a session's next one) takes over the screen.
      let newer = false;
      if (port) {
        const casting = new AbortController();
        const stop = () => casting.abort();
        signal.addEventListener("abort", stop, { once: true });
        let looking = false;
        const watch = setInterval(async () => {
          if (looking) return;
          looking = true;
          const next = await findBrowser(this.conversationId).catch(() => null);
          looking = false;
          if (next && next !== port) {
            newer = true;
            casting.abort();
          }
        }, POLL_MS);
        try {
          await cast(
            port,
            () => this.viewport,
            (f) => {
              this.last = f;
              this.setLive(true);
              for (const v of this.viewers) v.frame(f);
            },
            (control) => (this.control = control),
            casting.signal,
          );
        } catch {
          // Browser gone between the lookup and the connection.
        } finally {
          clearInterval(watch);
          signal.removeEventListener("abort", stop);
          this.control = null;
        }
      }
      // Closed: straight to the conversation's other browser still open, if there is one (no blank in between).
      if (newer || (port && !signal.aborted && ((await findBrowser(this.conversationId)) ?? port) !== port)) continue;
      this.setLive(false);
      if (!signal.aborted) await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  stop() {
    this.controller.abort();
  }
}

const screens = new Map<string, Screen>();

/** Watches a conversation's screen; the returned function stops watching (the last viewer stops the screencast). */
export function watchScreen(conversationId: string, viewer: ScreenViewer) {
  let screen = screens.get(conversationId);
  if (!screen) screens.set(conversationId, (screen = new Screen(conversationId)));
  screen.viewers.add(viewer);
  viewer.state(screen.state);
  if (screen.last) viewer.frame(screen.last);
  return () => {
    screen.viewers.delete(viewer);
    if (screen.viewers.size || screens.get(conversationId) !== screen) return;
    screens.delete(conversationId);
    screen.stop();
  };
}

/** Acts on the conversation's screen for a member; false when no browser is on display (its size can be chosen beforehand). */
export async function screenInput(conversationId: string, input: ScreenInput) {
  const screen = screens.get(conversationId);
  if (input.type === "viewport" && screen) {
    await screen.setViewport(input.viewport);
    return true;
  }
  const control = screen?.control;
  if (!control) return false;
  await control(input);
  return true;
}

/**
 * Environment of a process whose browsers show on the conversation's screen: the Chromium of the API
 * image (infra/chromium-screen.sh) records its DevTools port under this prefix, where `findBrowser`
 * looks. Used by the Claude Code sessions, whose Playwright drives Chromium over a pipe.
 */
export async function screenEnv(conversationId: string, name: string): Promise<Record<string, string>> {
  const dir = screenDir();
  if (!dir) return {};
  await mkdir(dir, { recursive: true });
  return { AGORA_SCREEN: join(dir, `agora-${conversationId}-${name}`) };
}

/* ---------- plugin in every profile ---------- */

/** The agora_screen plugin (symlink + `plugins.enabled`). True when it was just enabled (the gateway loads plugins at startup). */
export const installScreenPlugin = (profile: string) => installHermesPlugin(profile, "agora_screen");

export async function setupScreen() {
  if (!env.HERMES_HOME) return;
  const { profiles } = await import("./memory");
  let enabled = false;
  for (const p of await profiles()) {
    enabled = (await installScreenPlugin(p).catch((err) => console.error(`screen: plugin for ${p}`, err))) || enabled;
  }
  // Once, on the first deployment: a clean restart (in-flight replies finish first).
  if (enabled) await restartGateway().catch((err) => console.error("screen: gateway restart", err));
}
