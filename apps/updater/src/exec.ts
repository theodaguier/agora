import { UpdaterError } from "./coded";
import { config } from "./config";

/**
 * Minimal environment for spawned commands. Never process.env: Bun loaded the
 * current directory's .env into it at startup (APP_VERSION…), and for docker
 * compose an environment variable wins over the .env: it would rebuild the
 * old version.
 */
function childEnv() {
  const keep = ["PATH", "HOME", "TZ", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY"];
  // PWD: compose interpolates the updater service's paths from it (the host's infra directory).
  const env: Record<string, string> = { COMPOSE_PROJECT_NAME: config.project, PWD: config.projectDir };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}

export type RunResult = { code: number; stdout: string; stderr: string };

/** Runs a command (no shell) and returns its output. */
export async function run(cmd: string[], opts: { input?: string; timeoutMs?: number; cwd?: string } = {}): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? config.projectDir,
    stdin: opts.input !== undefined ? new Blob([opts.input]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: childEnv(),
  });
  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 15 * 60_000);
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(timer);
  return { code, stdout, stderr };
}

/** Like run, but fails with a readable message if the exit code isn't 0. */
export async function must(cmd: string[], opts?: Parameters<typeof run>[1]) {
  const r = await run(cmd, opts);
  if (r.code !== 0) {
    const tail = (r.stderr || r.stdout).trim().split("\n").slice(-4).join("\n");
    const command = `${cmd.slice(0, 4).join(" ")}…`;
    throw new UpdaterError(`${command} a échoué (${r.code}) : ${tail}`, "command_failed", { command, exitCode: r.code, output: tail });
  }
  return r;
}

export const compose = (args: string[], opts?: Parameters<typeof run>[1]) =>
  must(["docker", "compose", "--project-directory", config.projectDir, "-p", config.project, ...args], opts);

export const containerName = (service: string) => `${config.project}-${service}-1`;
export const volumeName = (volume: string) => `${config.project}_${volume}`;
