import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { hashWebhookToken } from "./webhook-payload";

/**
 * Every PostHog log alert calls an Agora trigger, the ones created later included.
 *
 * PostHog has no destination shared by all log alerts: their `$logs_alert_*` events are reserved
 * to each alert's own destinations. So every few minutes, each log alert of the project without a
 * webhook to Agora gets one, to the trigger named POSTHOG_LOG_ALERTS_TRIGGER. An alert that already
 * has one is left alone, even turned off: that is a person's choice.
 *
 * The trigger's address is never configured: the database only keeps its hash. It is read from a
 * PostHog destination that already calls it (the error tracking one, an alert wired by hand), the
 * one whose token hashes to the trigger's.
 */
const SYNC_MS = 5 * 60_000;

export type PosthogConfig = { host: string; projectId: string; apiKey: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

type Page<T> = { results: T[]; next?: string | null };
type HogFunction = { inputs?: Record<string, { value?: unknown } | null> | null };
type LogAlert = { id: string; name: string };
type Destination = { type?: string; webhook_url?: string };

async function call<T>(cfg: PosthogConfig, f: Fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, { ...init, headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`PostHog ${init?.method ?? "GET"} ${new URL(url).pathname} : ${res.status}`);
  return (await res.json()) as T;
}

async function all<T>(cfg: PosthogConfig, f: Fetch, path: string) {
  const items: T[] = [];
  let url: string | null | undefined = `${cfg.host}/api/projects/${cfg.projectId}/${path}`;
  while (url) {
    const page: Page<T> = await call<Page<T>>(cfg, f, url);
    items.push(...page.results);
    url = page.next;
  }
  return items;
}

/** The address of the trigger whose token hashes to `tokenHash`, as a PostHog destination holds it. */
export function triggerUrl(functions: HogFunction[], origin: string, tokenHash: string) {
  const prefix = `${origin.replace(/\/$/, "")}/api/hooks/`;
  for (const fn of functions) {
    const url = fn.inputs?.url?.value;
    if (typeof url === "string" && url.startsWith(prefix) && hashWebhookToken(url.slice(prefix.length)) === tokenHash) return url;
  }
  return null;
}

/** PostHog shows a destination's address without its path (the secret): an Agora webhook is one to its host. */
export const callsAgora = (destinations: Destination[], url: string) =>
  destinations.some((d) => d.type === "webhook" && typeof d.webhook_url === "string" && sameOrigin(d.webhook_url, url));

function sameOrigin(a: string, b: string) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Wires the project's log alerts that call no Agora webhook to the trigger. Returns the alerts wired. */
export async function syncLogAlerts(cfg: PosthogConfig, origin: string, tokenHash: string, f: Fetch = fetch) {
  const functions = await all<HogFunction>(cfg, f, "hog_functions/?type=internal_destination,destination&full=true&limit=1000");
  const url = triggerUrl(functions, origin, tokenHash);
  if (!url) throw new Error("aucune destination PostHog n'appelle encore ce déclencheur : branches-en une à la main, une fois");
  const wired: string[] = [];
  for (const alert of await all<LogAlert>(cfg, f, "logs/alerts/?limit=100")) {
    const base = `${cfg.host}/api/projects/${cfg.projectId}/logs/alerts/${alert.id}/`;
    const detail = await call<{ destinations?: Destination[] }>(cfg, f, base);
    if (callsAgora(detail.destinations ?? [], url)) continue;
    await call(cfg, f, `${base}destinations/`, { method: "POST", body: JSON.stringify({ type: "webhook", webhook_url: url }) });
    wired.push(alert.name);
  }
  return wired;
}

function config(): PosthogConfig | null {
  if (!env.POSTHOG_API_KEY || !env.POSTHOG_PROJECT_ID || !env.POSTHOG_LOG_ALERTS_TRIGGER) return null;
  return { host: env.POSTHOG_HOST.replace(/\/$/, ""), projectId: env.POSTHOG_PROJECT_ID, apiKey: env.POSTHOG_API_KEY };
}

/** The same failure every 5 minutes is logged once. */
let lastError = "";

async function run(cfg: PosthogConfig) {
  try {
    const hooks = await db
      .select({ tokenHash: schema.botWebhook.tokenHash })
      .from(schema.botWebhook)
      .where(and(eq(schema.botWebhook.name, env.POSTHOG_LOG_ALERTS_TRIGGER), eq(schema.botWebhook.enabled, true)));
    if (hooks.length !== 1) throw new Error(`${hooks.length} déclencheur(s) actif(s) nommé(s) « ${env.POSTHOG_LOG_ALERTS_TRIGGER} »`);
    const wired = await syncLogAlerts(cfg, env.WEB_ORIGIN, hooks[0]!.tokenHash);
    for (const name of wired) console.log(`posthog: alerte de logs « ${name} » branchée sur « ${env.POSTHOG_LOG_ALERTS_TRIGGER} »`);
    lastError = "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== lastError) console.error(`posthog: synchro des alertes de logs : ${message}`);
    lastError = message;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startPosthogAlertSync() {
  const cfg = config();
  if (timer || !cfg) return;
  void run(cfg);
  timer = setInterval(() => void run(cfg), SYNC_MS);
}
