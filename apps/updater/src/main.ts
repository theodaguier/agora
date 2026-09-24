/**
 * Agora update service (`updater` container, internal network).
 * - periodically checks for new versions (Hermes on Docker Hub, app on the registry);
 * - automatically applies, within the time window, Hermes and the app's
 *   patch/minor versions; major versions wait for a click;
 * - exposes a small (token-protected) API consumed by the Agora API for the admin.
 */
import { updateApp } from "./app-update";
import { listBackups } from "./backup";
import { config, usesRegistry } from "./config";
import { compose, run } from "./exec";
import { readEnv } from "./envfile";
import { updateHermes } from "./hermes-update";
import { appVersions, hermesVersions } from "./sources";
import { loadState, saveState, type Settings } from "./state";
import { timingSafeEqual } from "node:crypto";
import { bump, compare, newer, parseVersion } from "./versions";

if (!config.token) throw new Error("UPDATER_TOKEN is missing");

// Private registry (ghcr.io…): this container's Docker client must log in to pull the images.
if (usesRegistry() && config.registryToken) {
  const host = config.imagePrefix.split("/")[0]!;
  const r = await run(["docker", "login", host, "-u", config.registryUser || "token", "--password-stdin"], { input: config.registryToken });
  console.log(r.code === 0 ? `logged in to registry ${host}` : `could not log in to registry ${host}: ${r.stderr.trim()}`);
}

let running: { target: "hermes" | "app"; to: string } | null = null;

async function current() {
  const env = await readEnv();
  return { app: env.APP_VERSION ?? "", hermes: env.HERMES_VERSION ?? "" };
}

async function check() {
  const state = await loadState();
  const now = await current();
  const [hermes, app] = await Promise.allSettled([hermesVersions(), appVersions()]);
  if (hermes.status === "fulfilled") state.available.hermes = newer(hermes.value, now.hermes);
  if (app.status === "fulfilled") state.available.app = newer(app.value, now.app);
  state.lastCheck = new Date().toISOString();
  await saveState();
  return {
    hermesError: hermes.status === "rejected" ? String(hermes.reason) : null,
    appError: app.status === "rejected" ? String(app.reason) : null,
  };
}

async function apply(target: "hermes" | "app", to: string, trigger: "auto" | "manual") {
  if (running) throw new Error(`Mise à jour déjà en cours (${running.target} → ${running.to})`);
  if (!parseVersion(to)) throw new Error("Version invalide");
  // Only forward: a downgrade (to a version with a known flaw) goes through the automatic rollback, never through the API.
  if (compare(to, (await current())[target]) <= 0) throw new Error("Version antérieure ou identique à la version en place");
  running = { target, to };
  try {
    return target === "hermes" ? await updateHermes(to, trigger) : await updateApp(to, trigger);
  } finally {
    running = null;
    await check().catch(() => {});
  }
}

function inWindow(s: Settings) {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: s.timezone || config.tz }).format(new Date()));
  return s.windowStart <= s.windowEnd ? hour >= s.windowStart && hour < s.windowEnd : hour >= s.windowStart || hour < s.windowEnd;
}

/** Automatic round: Hermes first, then the app (excluding majors), one version at a time. */
async function tick() {
  if (running) return;
  await check().catch((e) => console.error("check", e));
  const state = await loadState();
  if (!inWindow(state.settings)) return;
  const now = await current();
  const hermes = state.available.hermes.filter((v) => !state.rejected.hermes.includes(v)).at(-1);
  if (state.settings.autoHermes && hermes) {
    await apply("hermes", hermes, "auto").catch((e) => console.error("hermes update", e));
    return;
  }
  const app = state.available.app.filter((v) => !state.rejected.app.includes(v) && bump(now.app, v) !== "major").at(-1);
  if (state.settings.autoApp && app) await apply("app", app, "auto").catch((e) => console.error("app update", e));
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

const expectedAuth = Buffer.from(`Bearer ${config.token}`);
function authorized(req: Request) {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expectedAuth.length && timingSafeEqual(given, expectedAuth);
}

Bun.serve({
  port: config.port,
  idleTimeout: 60,
  async fetch(req) {
    if (!authorized(req)) return json({ error: "unauthorized" }, 401);
    const url = new URL(req.url);
    const state = await loadState();
    try {
      if (req.method === "GET" && url.pathname === "/status") {
        return json({
          current: await current(),
          available: state.available,
          rejected: state.rejected,
          settings: state.settings,
          lastCheck: state.lastCheck,
          running,
          inWindow: inWindow(state.settings),
          history: [...state.history].reverse().slice(0, 30),
          backups: (await listBackups()).slice(0, 10),
          registry: config.imagePrefix,
        });
      }
      if (req.method === "POST" && url.pathname === "/check") return json(await check());
      if (req.method === "POST" && url.pathname === "/apply") {
        const body = (await req.json()) as { target: "hermes" | "app"; version: string };
        if (body.target !== "hermes" && body.target !== "app") return json({ error: "invalid_target" }, 400);
        if (typeof body.version !== "string" || !parseVersion(body.version)) return json({ error: "invalid_version" }, 400);
        if (compare(body.version, (await current())[body.target]) <= 0) return json({ error: "not_newer" }, 400);
        // Runs in the background: the admin follows progress via /status.
        void apply(body.target, body.version, "manual").catch((e) => console.error("apply", e));
        await Bun.sleep(300);
        return json({ started: true }, 202);
      }
      if (req.method === "POST" && url.pathname === "/restart") {
        const body = (await req.json().catch(() => ({}))) as { service?: string };
        if (body.service !== "hermes") return json({ error: "invalid_service" }, 400);
        if (running) return json({ error: "update_running" }, 409);
        // The api shares the hermes network namespace: it must restart after it.
        // In the background: this request's caller (the api) goes down with it.
        void (async () => {
          await Bun.sleep(500);
          await compose(["restart", "hermes"], { timeoutMs: 5 * 60_000 });
          await compose(["restart", "api"], { timeoutMs: 5 * 60_000 });
        })().catch((e) => console.error("restart", e));
        return json({ started: true }, 202);
      }
      if (req.method === "PUT" && url.pathname === "/settings") {
        const body = (await req.json()) as Partial<Settings>;
        const next = { ...state.settings };
        if (typeof body.autoApp === "boolean") next.autoApp = body.autoApp;
        if (typeof body.autoHermes === "boolean") next.autoHermes = body.autoHermes;
        if (typeof body.timezone === "string") {
          try {
            new Intl.DateTimeFormat("fr", { timeZone: body.timezone });
            next.timezone = body.timezone;
          } catch {}
        }
        for (const k of ["windowStart", "windowEnd"] as const) {
          const v = body[k];
          if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23) next[k] = v;
        }
        state.settings = next;
        await saveState();
        return json(next);
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/rejected/")) {
        const [, , target, version] = url.pathname.split("/");
        if (target === "hermes" || target === "app") state.rejected[target] = state.rejected[target].filter((v) => v !== version);
        await saveState();
        return json(state.rejected);
      }
      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  },
});

console.log(`updater ready on :${config.port} (checking every ${config.checkEveryMinutes} min, timezone ${config.tz})`);
await check().catch((e) => console.error("initial check", e));
setInterval(() => void tick(), config.checkEveryMinutes * 60_000);
