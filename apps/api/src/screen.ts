import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import { installHermesPlugin, restartGateway } from "./hermes-admin";

/**
 * Agent screen: live view of the browser a Hermes agent drives.
 *
 * The Hermes plugin agora_screen (infra/hermes-plugins) writes, after each
 * browser tool call, the DevTools endpoint of the session's headless Chromium
 * to `$HERMES_HOME/agora-screen/<session>.json`. This API shares the gateway's
 * network, so that endpoint (127.0.0.1) is reachable from here.
 *
 * Nothing runs without a viewer: a conversation's screen is watched (one file
 * lookup every few seconds, then one CDP screencast shared by every viewer)
 * only while at least one member has it open. Chromium only sends a frame when
 * the page repaints, and viewers get at most
 * one frame per FRAME_MS: the last one. The browser itself is never
 * started here: Hermes closes it when idle, and the stream ends with it.
 */

export type ScreenFrame = { data: string; url: string; width: number; height: number };
export type ScreenViewer = { frame: (f: ScreenFrame) => void; state: (live: boolean) => void };

const FRAME_MS = 200;
const POLL_MS = 3_000;
/** Beyond this, a recorded browser is certainly closed (Hermes's idle timeout is minutes). */
const STALE_MS = 30 * 60_000;
const LOCAL_CDP = /^http:\/\/127\.0\.0\.1:(\d{2,5})$/;

const screenDir = () => (env.HERMES_HOME ? join(env.HERMES_HOME, "agora-screen") : "");

/** CDP port of the most recently used browser of the conversation (all its Hermes sessions, groups included). */
async function findBrowser(conversationId: string): Promise<number | null> {
  const dir = screenDir();
  if (!dir) return null;
  const prefix = `agora-${conversationId}`;
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (n) => n.endsWith(".json") && (n === `${prefix}.json` || n.startsWith(`${prefix}-`)),
  );
  let best: { port: number; at: number } | null = null;
  for (const name of names) {
    try {
      const path = join(dir, name);
      const at = (await stat(path)).mtimeMs;
      if (Date.now() - at > STALE_MS || (best && best.at >= at)) continue;
      const m = LOCAL_CDP.exec(JSON.parse(await readFile(path, "utf8")).cdp ?? "");
      if (m) best = { port: Number(m[1]), at };
    } catch {
      // Being rewritten, or not ours: skip.
    }
  }
  return best?.port ?? null;
}

type Target = { targetId: string; type: string; url: string };

const isPage = (t: Target) => t.type === "page" && !t.url.startsWith("devtools://");
const isBlank = (t: Target) => t.url === "about:blank" || t.url === "";

/**
 * One screencast of one browser, for as long as the socket lives. Resolves
 * when the browser goes away (closed by Hermes, or `close()`).
 */
async function cast(port: number, onFrame: (f: ScreenFrame) => void, signal: AbortSignal) {
  const cdp = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.json());
  const version = await cdp("/json/version");
  // Most recently active first: seeded oldest → newest, the order the Map keeps.
  const opened: { id: string; type: string; url: string }[] = await cdp("/json/list").catch(() => []);
  const path = new URL(String(version.webSocketDebuggerUrl)).pathname;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  let nextId = 1;
  const pending = new Map<number, (result: any) => void>();
  const send = (method: string, params: object = {}, sessionId?: string) =>
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
      await send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 800 }, sessionId);
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
  private controller = new AbortController();

  constructor(private conversationId: string) {
    void this.run();
  }

  private setLive(live: boolean) {
    if (live === this.live) return;
    this.live = live;
    if (!live) this.last = null;
    for (const v of this.viewers) v.state(live);
  }

  private async run() {
    const { signal } = this.controller;
    while (!signal.aborted) {
      const port = await findBrowser(this.conversationId);
      if (port) {
        try {
          await cast(
            port,
            (f) => {
              this.last = f;
              this.setLive(true);
              for (const v of this.viewers) v.frame(f);
            },
            signal,
          );
        } catch {
          // Browser gone between the lookup and the connection.
        }
      }
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
  viewer.state(screen.live);
  if (screen.last) viewer.frame(screen.last);
  return () => {
    screen.viewers.delete(viewer);
    if (screen.viewers.size || screens.get(conversationId) !== screen) return;
    screens.delete(conversationId);
    screen.stop();
  };
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
