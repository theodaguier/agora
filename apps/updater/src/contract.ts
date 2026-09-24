import { appImage } from "./config";
import { UpdaterError } from "./coded";
import { run } from "./exec";

export type ContractResult = { ok: boolean; checks: { name: string; ok: boolean; detail?: string; ms: number }[] };

/**
 * Regressions of a result against the baseline (current production):
 * a check that used to pass and no longer does, or a check missing from
 * the baseline (e.g. mutating CLI, only tested on the canary) that fails.
 * Checks that were already failing don't block an update.
 */
export function regressions(result: ContractResult, baseline: ContractResult | null) {
  const before = new Map(baseline?.checks.map((c) => [c.name, c.ok]) ?? []);
  return result.checks.filter((c) => !c.ok && before.get(c.name) !== false);
}

export const describe = (checks: ContractResult["checks"]) => checks.map((c) => `${c.name} : ${c.detail ?? "échec"}`).join(" ; ");

/** Regression error; check names are shown as-is (technical identifiers). */
export const regressionError = (code: "regressions" | "prod_regressions", checks: ContractResult["checks"]) =>
  new UpdaterError(
    `${code === "prod_regressions" ? "régressions en production" : "régressions"} : ${describe(checks)}`,
    code,
    { checks: checks.map((c) => ({ name: c.name, detail: c.detail })) },
  );

const HERMES_CLI = "/opt/hermes/.venv/bin/hermes";

/**
 * Checks a Hermes instance (canary or production) against the app's contract:
 * 1) HTTP routes and SSE streams, via the apps/api/src/hermes-contract.ts script
 *    run in the app image, on the Hermes container's network;
 * 2) the Hermes CLI used by the app, run inside the Hermes container;
 * 3) the wiki memory plugin (script provided by the plugin).
 */
export async function checkContract(opts: {
  container: string;
  volume: string;
  appVersion: string;
  env: Record<string, string>;
  uid: string;
  chat: boolean;
  /** Canary: a test profile may be created/deleted. */
  mutating: boolean;
}): Promise<ContractResult> {
  const checks: ContractResult["checks"] = [];
  const timed = async (name: string, fn: () => Promise<string | void>) => {
    const t = performance.now();
    try {
      const detail = await fn();
      checks.push({ name, ok: true, detail: detail || undefined, ms: Math.round(performance.now() - t) });
    } catch (err) {
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now() - t) });
    }
  };

  const http = await run(
    [
      "docker", "run", "--rm",
      "--network", `container:${opts.container}`,
      "--user", opts.uid,
      "-v", `${opts.volume}:/opt/data:ro`,
      ...Object.entries({ ...opts.env, HERMES_HOME: "/opt/data" }).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      "--workdir", "/app/apps/api",
      appImage("app", opts.appVersion),
      "bun", "src/hermes-contract.ts", ...(opts.chat ? ["--chat"] : []),
    ],
    { timeoutMs: 5 * 60_000 },
  );
  try {
    checks.push(...(JSON.parse(http.stdout) as ContractResult).checks);
  } catch {
    checks.push({ name: "contrat HTTP", ok: false, detail: (http.stderr || http.stdout).slice(-400), ms: 0 });
  }

  const cli = (args: string[]) =>
    run(["docker", "exec", "-u", opts.uid, opts.container, HERMES_CLI, ...args], { timeoutMs: 3 * 60_000 });

  await timed("CLI : plugins list --json", async () => {
    const r = await cli(["plugins", "list", "--json"]);
    if (r.code !== 0) throw new Error(r.stderr.slice(-300));
    const list = JSON.parse(r.stdout.slice(r.stdout.search(/[[{]/)));
    if (!Array.isArray(list)) throw new Error("pas une liste");
    return `${list.length} plugins`;
  });

  await timed("CLI : tools list --platform api_server", async () => {
    const r = await cli(["tools", "list", "--platform", "api_server"]);
    if (r.code !== 0) throw new Error(r.stderr.slice(-300));
  });

  if (opts.mutating) {
    await timed("CLI : création / configuration / suppression de profil", async () => {
      const probe = "agora-canary-probe";
      await cli(["profile", "delete", probe, "--yes"]);
      for (const args of [
        ["profile", "create", probe, "--no-alias", "--clone-from", "default", "--description", "probe"],
        ["-p", probe, "config", "set", "model.default", "probe-model"],
        ["-p", probe, "tools", "disable", "web", "--platform", "api_server"],
        ["profile", "delete", probe, "--yes"],
      ]) {
        const r = await cli(args);
        if (r.code !== 0) throw new Error(`${args.join(" ")} : ${(r.stderr || r.stdout).slice(-300)}`);
      }
    });
  }

  const wikiPlugin = await run(["docker", "exec", opts.container, "test", "-f", "/app/infra/hermes-plugins/agora_wiki/contract_check.py"]);
  if (wikiPlugin.code === 0) {
    await timed("plugin mémoire wiki : interface Hermes", async () => {
      const r = await run(
        [
          "docker", "exec", "-u", opts.uid, "-w", "/opt/hermes",
          "-e", `HERMES_BIN=${HERMES_CLI}`, "-e", "PYTHONPATH=/opt/hermes",
          opts.container, "/opt/hermes/.venv/bin/python", "/app/infra/hermes-plugins/agora_wiki/contract_check.py",
        ],
        { timeoutMs: 3 * 60_000 },
      );
      if (r.code !== 0) throw new Error((r.stdout + r.stderr).trim().slice(-300));
    });
  }

  const screenPlugin = await run(["docker", "exec", opts.container, "test", "-f", "/app/infra/hermes-plugins/agora_screen/contract_check.py"]);
  if (screenPlugin.code === 0) {
    await timed("plugin écran de l'agent : interface Hermes", async () => {
      const r = await run(
        [
          "docker", "exec", "-u", opts.uid, "-w", "/opt/hermes",
          "-e", "PYTHONPATH=/opt/hermes",
          opts.container, "/opt/hermes/.venv/bin/python", "/app/infra/hermes-plugins/agora_screen/contract_check.py",
        ],
        { timeoutMs: 3 * 60_000 },
      );
      if (r.code !== 0) throw new Error((r.stdout + r.stderr).trim().slice(-300));
    });
  }

  const filesPlugin = await run(["docker", "exec", opts.container, "test", "-f", "/app/infra/hermes-plugins/agora_files/contract_check.py"]);
  if (filesPlugin.code === 0) {
    await timed("confinement des agents : pièces jointes et outils coupés", async () => {
      const r = await run(
        [
          "docker", "exec", "-u", opts.uid, "-w", "/opt/hermes",
          "-e", "PYTHONPATH=/opt/hermes",
          opts.container, "/opt/hermes/.venv/bin/python", "/app/infra/hermes-plugins/agora_files/contract_check.py",
        ],
        { timeoutMs: 3 * 60_000 },
      );
      if (r.code !== 0) throw new Error((r.stdout + r.stderr).trim().slice(-300));
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}
