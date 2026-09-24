import { UpdaterError } from "./coded";
import { containerName, must, run } from "./exec";
import { readEnv } from "./envfile";

/** Secrets needed for the contract checks, read from the production .env. */
export async function contractEnv() {
  const env = await readEnv();
  return {
    uid: `${env.HERMES_UID || "10000"}:${env.HERMES_GID || "10000"}`,
    env: {
      HERMES_API_KEY: env.HERMES_API_KEY ?? "",
      HERMES_KEY_SECRET: env.HERMES_KEY_SECRET ?? "",
      HERMES_DASHBOARD_TOKEN: env.HERMES_DASHBOARD_TOKEN ?? "",
    },
    appVersion: env.APP_VERSION ?? "",
    hermesVersion: env.HERMES_VERSION ?? "",
  };
}

/** Waits for a Hermes container's gateway (8650) and dashboard (9129) to respond. */
export async function waitHermes(container: string, timeoutMs = 180_000) {
  const probe = `
import urllib.request, sys
for port in (8650, 9129):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/health" if port == 8650 else f"http://127.0.0.1:{port}/", timeout=3)
    except urllib.error.HTTPError:
        pass
    except Exception:
        sys.exit(1)
`;
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await run(["docker", "exec", container, "/opt/hermes/.venv/bin/python", "-c", probe], { timeoutMs: 20_000 });
    if (r.code === 0) return;
    await Bun.sleep(3000);
  }
  const seconds = Math.round(timeoutMs / 1000);
  throw new UpdaterError(`${container} : Hermes ne répond pas après ${seconds} s`, "hermes_timeout", { container, seconds });
}

/** Waits for the Agora API to respond with the expected version (reachable via hermes's network). */
export async function waitApi(expectedVersion: string, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const res = await fetch("http://hermes:3001/api/health", { signal: AbortSignal.timeout(5000) });
      const body = (await res.json()) as { ok: boolean; version: string };
      if (res.ok && body.ok && body.version === expectedVersion) return;
      last = `version ${body.version}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await Bun.sleep(3000);
  }
  throw new UpdaterError(`API Agora indisponible ou mauvaise version (${last})`, "api_unavailable", { detail: last });
}

export async function inspectHermes() {
  const r = await must(["docker", "inspect", containerName("hermes")]);
  const [info] = JSON.parse(r.stdout) as {
    Config: { Env: string[] };
    Mounts: { Source: string; Destination: string; Type: string }[];
  }[];
  return info!;
}

/**
 * Pauses the Hermes container (a few seconds) for the duration of a copy:
 * with no concurrent writes, the copied SQLite databases (sessions, cron) are consistent.
 */
export async function withHermesPaused<T>(fn: () => Promise<T>) {
  const container = containerName("hermes");
  await must(["docker", "pause", container]);
  try {
    return await fn();
  } finally {
    await run(["docker", "unpause", container]);
  }
}
