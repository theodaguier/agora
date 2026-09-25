/**
 * Health of the instance's components, for the admin Status tab: every probe
 * runs in parallel, is bounded in time and never throws.
 */
import { sql } from "drizzle-orm";
import { canUseClaudeCode, claudeCodeModels } from "./claude-code";
import { canUseCodex, codexModels } from "./codex";
import { db, schema } from "./db";
import { env } from "./env";
import { hermesApi } from "./hermes";
import { dashboard, HermesError, restartGateway } from "./hermes-admin";
import { dashboardLog, gatewayHealthy, gatewayLog, restartDashboardProcess, restartGatewayProcess } from "./hermes-process";
import { defineMessages, tr } from "./i18n";
import { mailConfig } from "./mail";
import { compileWiki, curatorStatus } from "./memory";

const messages = defineMessages({
  en: {
    notConfigured: (name: string) => `${name} is not configured.`,
    timeout: (s: number) => `No answer within ${s} s.`,
    httpStatus: (code: number) => `HTTP ${code}`,
    botsOk: (n: number) => (n === 1 ? "1 bot answers." : `${n} bots answer.`),
    botsFailing: (names: string) => `Not answering: ${names}.`,
    botsNone: "No bot answers.",
    unreachable: "Unreachable.",
    noBots: "No bot yet.",
    curatorPending: (n: number) => (n === 1 ? "1 source waiting to be compiled." : `${n} sources waiting to be compiled.`),
    curatorIdle: "Up to date.",
    curatorLastFailed: (m: string) => `Last run failed: ${m}`,
    mailOn: (from: string) => `Invitations sent from ${from}.`,
    mailOff: "No email service: invitation links are only shown to the admin.",
    claudeOff: "Disabled (no owner).",
    claudeOwnerOnly: "Only its owner can check it.",
    claudeModels: (n: number) => (n === 1 ? "1 model available." : `${n} models available.`),
    updaterOff: "No update service (development environment).",
    cannotRestart: "This service can't be restarted from here.",
    stillDown: (log: string) => `Still unreachable after the restart. Log: ${log}`,
    memoryNeedsGateway: "Memory compilation goes through Hermes: restart the gateway first.",
    updateRunning: "An update is in progress: try again once it's done.",
    updaterUnreachable: "Can't reach the update service.",
  },
  fr: {
    notConfigured: (name: string) => `${name} n'est pas configuré.`,
    timeout: (s: number) => `Pas de réponse en ${s} s.`,
    httpStatus: (code: number) => `HTTP ${code}`,
    botsOk: (n: number) => (n === 1 ? "1 bot répond." : `${n} bots répondent.`),
    botsFailing: (names: string) => `Ne répondent pas : ${names}.`,
    botsNone: "Aucun bot ne répond.",
    unreachable: "Injoignable.",
    noBots: "Aucun bot pour l'instant.",
    curatorPending: (n: number) => (n === 1 ? "1 source en attente de compilation." : `${n} sources en attente de compilation.`),
    curatorIdle: "À jour.",
    curatorLastFailed: (m: string) => `Dernier passage en échec : ${m}`,
    mailOn: (from: string) => `Invitations envoyées depuis ${from}.`,
    mailOff: "Pas de service d'email : les liens d'invitation sont seulement affichés à l'admin.",
    claudeOff: "Désactivé (pas de propriétaire).",
    claudeOwnerOnly: "Seul son propriétaire peut le vérifier.",
    claudeModels: (n: number) => (n === 1 ? "1 modèle disponible." : `${n} modèles disponibles.`),
    updaterOff: "Service de mise à jour absent (environnement de développement).",
    cannotRestart: "Ce service ne peut pas être relancé d'ici.",
    stillDown: (log: string) => `Toujours injoignable après la relance. Journal : ${log}`,
    memoryNeedsGateway: "La compilation de la mémoire passe par Hermes : relance d'abord le gateway.",
    updateRunning: "Une mise à jour est en cours : réessaie une fois terminée.",
    updaterUnreachable: "Service de mise à jour injoignable.",
  },
});

export type CheckState = "ok" | "warn" | "down" | "off";
/**
 * How a component can be restarted from the admin:
 * - process: no supervisor (dev), the api stops and starts the process itself and waits for it;
 * - container: the update service restarts the Hermes container (gateway + dashboard), then the api;
 * - curator: a new memory compilation run.
 */
export type Restart = "process" | "container" | "curator";
export type Check = { id: string; state: CheckState; detail?: string; latencyMs?: number; restart?: Restart };

/** The update service only exists in production (Docker); elsewhere processes are started here. */
function restartOf(id: string): Restart | undefined {
  if (id === "gateway" || id === "bots") return env.UPDATER_URL ? "container" : env.HERMES_HOME ? "process" : undefined;
  if (id === "dashboard") {
    if (env.UPDATER_URL) return "container";
    return env.HERMES_HOME && env.HERMES_DASHBOARD_URL && env.HERMES_DASHBOARD_TOKEN ? "process" : undefined;
  }
  if (id === "memory") return env.HERMES_API_URL && (env.HERMES_HOME || env.WIKI_DIR) ? "curator" : undefined;
}

const TIMEOUT_MS = 8_000;

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Timeout()), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}

/** Runs a probe: its result, its duration, and any error turned into a "down" state. */
async function probe(id: string, fn: () => Promise<Omit<Check, "id" | "latencyMs">>): Promise<Check> {
  const start = performance.now();
  try {
    const result = await withTimeout(fn());
    return { id, latencyMs: Math.round(performance.now() - start), ...result };
  } catch (err) {
    const t = tr(messages);
    // A failed fetch (connection refused, DNS) carries a runtime code and a jargon message.
    const network = err instanceof TypeError || (err instanceof Error && typeof (err as { code?: unknown }).code === "string");
    const detail = err instanceof Timeout ? t.timeout(TIMEOUT_MS / 1000) : network ? t.unreachable : err instanceof Error ? err.message : String(err);
    return { id, state: "down", detail, latencyMs: Math.round(performance.now() - start) };
  }
}

const off = (detail: string) => async () => ({ state: "off" as const, detail });

async function httpOk(res: Response) {
  if (!res.ok) throw new Error(tr(messages).httpStatus(res.status));
}

export async function systemStatus(viewer: { email: string }) {
  const t = tr(messages);
  const checks = await Promise.all([
    probe("database", async () => {
      await db.execute(sql`select 1`);
      return { state: "ok" };
    }),

    probe(
      "gateway",
      env.HERMES_API_URL
        ? async () => {
            await httpOk(await fetch(`${env.HERMES_API_URL}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
            return { state: "ok" };
          }
        : off(t.notConfigured("HERMES_API_URL")),
    ),

    probe(
      "bots",
      env.HERMES_API_URL
        ? async () => {
            const agents = await db.select({ name: schema.agent.name, profile: schema.agent.hermesProfile }).from(schema.agent);
            if (!agents.length) return { state: "ok", detail: t.noBots };
            // Each profile answers with its own key: a missing key or profile shows here.
            const results = await Promise.all(
              agents.map(async (a) => {
                try {
                  await httpOk(await hermesApi(a.profile, "/v1/models", { signal: AbortSignal.timeout(TIMEOUT_MS - 500) }));
                  return null;
                } catch {
                  return a.name;
                }
              }),
            );
            const failing = results.filter((n): n is string => !!n);
            if (!failing.length) return { state: "ok", detail: t.botsOk(agents.length) };
            if (failing.length === agents.length) return { state: "down", detail: t.botsNone };
            return { state: "warn", detail: t.botsFailing(failing.join(", ")) };
          }
        : off(t.notConfigured("HERMES_API_URL")),
    ),

    probe(
      "dashboard",
      env.HERMES_DASHBOARD_URL && env.HERMES_DASHBOARD_TOKEN
        ? async () => {
            await dashboard("/api/mcp/servers");
            return { state: "ok" };
          }
        : off(t.notConfigured("HERMES_DASHBOARD_URL")),
    ),

    probe(
      "memory",
      env.HERMES_HOME || env.WIKI_DIR
        ? async () => {
            const s = await curatorStatus();
            if (s.lastRun && !s.lastRun.ok) return { state: "warn", detail: t.curatorLastFailed(s.lastRun.message) };
            if (s.problems.length) return { state: "warn", detail: `${s.problems[0].source} — ${s.problems[0].reason}` };
            return { state: "ok", detail: s.pendingSources ? t.curatorPending(s.pendingSources) : t.curatorIdle };
          }
        : off(t.notConfigured("HERMES_HOME")),
    ),

    probe(
      "updater",
      env.UPDATER_URL
        ? async () => {
            const res = await fetch(`${env.UPDATER_URL}/status`, {
              headers: { Authorization: `Bearer ${env.UPDATER_TOKEN}` },
              signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            await httpOk(res);
            return { state: "ok" };
          }
        : off(t.updaterOff),
    ),

    // Configuration only: probing Resend would need a key with more rights than sending.
    mailConfig().then((mail) => ({ id: "mail", ...(mail ? { state: "ok" as const, detail: t.mailOn(mail.from) } : { state: "off" as const, detail: t.mailOff }) })),

    probe(
      "claudeCode",
      env.CLAUDE_CODE_OWNER_EMAIL
        ? async () => {
            // Only the owner's session triggers the probe: it spawns their Claude subscription.
            if (!canUseClaudeCode(viewer)) return { state: "off", detail: t.claudeOwnerOnly };
            const models = await claudeCodeModels();
            return { state: models.length ? "ok" : "warn", detail: t.claudeModels(models.length) };
          }
        : off(t.claudeOff),
    ),

    probe(
      "codex",
      env.CODEX_OWNER_EMAIL || env.CLAUDE_CODE_OWNER_EMAIL
        ? async () => {
            // Same as Claude Code: it spawns the owner's ChatGPT subscription.
            if (!canUseCodex(viewer)) return { state: "off", detail: t.claudeOwnerOnly };
            const models = await codexModels();
            return { state: models.length ? "ok" : "warn", detail: t.claudeModels(models.length) };
          }
        : off(t.claudeOff),
    ),
  ]);

  return { checkedAt: new Date().toISOString(), checks: checks.map((c) => ({ ...c, restart: restartOf(c.id) })) };
}

async function restartContainer() {
  const t = tr(messages);
  const res = await fetch(`${env.UPDATER_URL}/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.UPDATER_TOKEN}` },
    body: JSON.stringify({ service: "hermes" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res) throw new HermesError(t.updaterUnreachable, 502);
  if (res.status === 409) throw new HermesError(t.updateRunning, 409);
  if (!res.ok) throw new HermesError(t.updaterUnreachable, 502);
}

/**
 * Restarts a component. A local process is awaited until it answers again;
 * a container restart only returns once it is under way (the api restarts with it).
 */
export async function restartService(id: string) {
  const t = tr(messages);
  switch (restartOf(id)) {
    case "process": {
      const dash = id === "dashboard";
      const back = await (dash ? restartDashboardProcess() : restartGatewayProcess());
      if (!back) throw new HermesError(t.stillDown(dash ? dashboardLog() : gatewayLog()), 502);
      return;
    }
    case "container":
      // A gateway that still runs is restarted gently (s6 relaunches it); a dead one, or the dashboard, with the container.
      if (id !== "dashboard" && (await gatewayHealthy())) return restartGateway();
      return restartContainer();
    case "curator":
      if (!(await gatewayHealthy())) throw new HermesError(t.memoryNeedsGateway, 409);
      void compileWiki().catch((err) => console.error("memory: compile", err));
      return;
    default:
      throw new HermesError(t.cannotRestart, 400);
  }
}
