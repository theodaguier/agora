import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe, type AppEvent } from "../events";
import { requireUser, type AppEnv } from "../middleware";

/** Below the idleTimeout of Bun (255 s) and common proxies. */
const PING_MS = 25_000;

/** Real-time stream for one tab: every event from the employee's conversations. */
export const events = new Hono<AppEnv>().use(requireUser).get("/", (c) =>
  streamSSE(c, async (stream) => {
    // Serialized writes: several events can arrive while a write is pending.
    let queue = Promise.resolve();
    const send = (event: string, data: unknown) => {
      queue = queue.then(() => (stream.aborted ? undefined : stream.writeSSE({ event, data: JSON.stringify(data) }))).catch(() => {});
    };
    const unsubscribe = subscribe(c.get("user").id, (ev: AppEvent) => send(ev.type, ev));
    const ping = setInterval(() => send("ping", {}), PING_MS);
    send("ready", {});
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    clearInterval(ping);
    unsubscribe();
  }),
);
