/**
 * Hermes processes on a machine without a supervisor (dev, outside Docker):
 * the admin can start the gateway and the dashboard itself. In production, s6
 * relaunches the gateway and the update service restarts the container.
 */
import { mkdirSync, openSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import { hermesEnv } from "./harden";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls until `ok()` holds, at most `ms`. */
async function until(ok: () => Promise<boolean>, ms: number, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return true;
    await sleep(every);
  }
  return ok();
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function gatewayPid() {
  const raw = await readFile(join(env.HERMES_HOME, "gateway.pid"), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const { pid } = JSON.parse(raw) as { pid: number };
    return alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function gatewayHealthy() {
  if (!env.HERMES_API_URL) return false;
  const res = await fetch(`${env.HERMES_API_URL}/health`, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
  return !!res?.ok;
}

export async function dashboardHealthy() {
  if (!env.HERMES_DASHBOARD_URL) return false;
  // Any HTTP answer means the server is up; auth is checked elsewhere.
  const res = await fetch(env.HERMES_DASHBOARD_URL, { signal: AbortSignal.timeout(2_000) }).catch(() => null);
  return !!res;
}

/** Detached process, logs in $HERMES_HOME/logs: it outlives an api restart. */
function launch(args: string[], log: string, extraEnv: Record<string, string> = {}) {
  const dir = join(env.HERMES_HOME, "logs");
  mkdirSync(dir, { recursive: true });
  const fd = openSync(join(dir, log), "a");
  const proc = Bun.spawn([env.HERMES_BIN, ...args], {
    env: hermesEnv(extraEnv),
    stdin: "ignore",
    stdout: fd,
    stderr: fd,
    detached: true,
  });
  proc.unref();
}

export const gatewayLog = () => join(env.HERMES_HOME, "logs", "agora-gateway.log");
export const dashboardLog = () => join(env.HERMES_HOME, "logs", "agora-dashboard.log");

/**
 * Restarts the gateway and returns once it answers again (or not).
 * A running gateway gets SIGUSR1: it finishes in-flight replies then exits,
 * and a supervisor (infra/hermes-dev.sh, s6) relaunches it. Without one, or
 * when it was not running, it is started here.
 */
export async function restartGatewayProcess() {
  const pid = await gatewayPid();
  if (pid) {
    process.kill(pid, "SIGUSR1");
    await until(async () => !alive(pid), 60_000);
    // hermes-dev.sh relaunches after 2 s: leave it the time to do so.
    if (await until(gatewayHealthy, 6_000)) return true;
  }
  if (!(await gatewayPid())) launch(["gateway", "run"], "agora-gateway.log");
  return until(gatewayHealthy, 45_000, 1_000);
}

/** Stops then starts the dashboard; returns once it answers again (or not). */
export async function restartDashboardProcess() {
  const port = new URL(env.HERMES_DASHBOARD_URL).port || "9119";
  await Bun.spawn([env.HERMES_BIN, "dashboard", "--stop"], {
    env: hermesEnv(),
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).exited;
  await until(async () => !(await dashboardHealthy()), 10_000);
  launch(["dashboard", "--no-open", "--skip-build", "--host", "127.0.0.1", "--port", port], "agora-dashboard.log", {
    HERMES_DASHBOARD_SESSION_TOKEN: env.HERMES_DASHBOARD_TOKEN,
  });
  return until(dashboardHealthy, 45_000, 1_000);
}
