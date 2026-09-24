import { backup, restoreHermesData } from "./backup";
import { config, hermesImage } from "./config";
import { errorInfo, UpdaterError } from "./coded";
import { checkContract, regressionError, regressions, type ContractResult } from "./contract";
import { compose, containerName, must, run, volumeName } from "./exec";
import { setEnv } from "./envfile";
import { contractEnv, inspectHermes, waitApi, waitHermes, withHermesPaused } from "./prod";
import { startRun } from "./run-log";
import { loadState, saveState, type UpdateRun } from "./state";

const CANARY = `${config.project}-hermes-canary`;
const CANARY_VOLUME = `${config.project}_hermes-canary`;
const CANARY_ENV = /^(HERMES_UID|HERMES_GID|GATEWAY_MULTIPLEX_PROFILES|API_SERVER_[A-Z_]+|HERMES_DASHBOARD[A-Z_]*)=/;

/**
 * Updates the Hermes core without breaking anything:
 * backup → canary (new image on a COPY of the data) → contract →
 * switchover → contract in production → otherwise rollback with restore.
 */
export async function updateHermes(to: string, trigger: UpdateRun["trigger"]) {
  const prod = await contractEnv();
  const from = prod.hermesVersion;
  const { entry, step, finish } = await startRun("hermes", from, to, trigger);

  try {
    await step("hermes_pull_image", `Téléchargement de l'image ${hermesImage(to)}`, undefined, { image: hermesImage(to) });
    await must(["docker", "pull", hermesImage(to)], { timeoutMs: 30 * 60_000 });

    await step("baseline_start", "Référence : contrat de la production actuelle");
    const baseline = await checkContract({ container: containerName("hermes"), volume: volumeName("hermes-data"), appVersion: prod.appVersion, env: prod.env, uid: prod.uid, chat: true, mutating: false });
    const known = baseline.checks.filter((c) => !c.ok);
    await step(
      "baseline_result",
      `Référence : ${baseline.checks.length - known.length}/${baseline.checks.length} vérifications passent${known.length ? ` (déjà en échec : ${known.map((c) => c.name).join(", ")})` : ""}`,
      true,
      { passed: baseline.checks.length - known.length, total: baseline.checks.length, failing: known.map((c) => c.name) },
    );

    await step("backup_start", "Sauvegarde de la base et des données Hermes");
    entry.backup = await backup(`hermes-${to}`);
    await step("backup_done", `Sauvegarde ${entry.backup}`, true, { id: entry.backup });

    await step("canary_start", "Démarrage du canari sur une copie des données");
    const canary = await runCanary(to);
    try {
      await waitHermes(CANARY);
      await step("canary_started", "Canari démarré", true);
      await step("canary_contract", "Vérification du contrat sur le canari (HTTP, SSE, CLI, plugin wiki, réponse d'agent)");
      const result = await checkContract({ container: CANARY, volume: CANARY_VOLUME, appVersion: prod.appVersion, env: prod.env, uid: prod.uid, chat: true, mutating: true });
      entry.contract = result;
      const broken = regressions(result, baseline);
      if (broken.length) throw new CanaryRejected(regressionError("regressions", broken));
      const passed = result.checks.filter((c) => c.ok).length;
      await step("canary_ok", `Contrat validé sur le canari : aucune régression (${passed}/${result.checks.length} passent)`, true, { passed, total: result.checks.length });
    } finally {
      await canary.cleanup();
    }

    await step("hermes_switch", `Bascule de la production sur Hermes ${to}`, undefined, { version: to });
    await switchTo(to, prod.appVersion);
    await waitHermes(containerName("hermes"));
    await waitApi(prod.appVersion);
    const after = await checkContract({ container: containerName("hermes"), volume: volumeName("hermes-data"), appVersion: prod.appVersion, env: prod.env, uid: prod.uid, chat: true, mutating: false });
    entry.contract = after;
    const broken = regressions(after, baseline);
    if (broken.length) throw regressionError("prod_regressions", broken);
    await step("prod_verified", "Production vérifiée", true);
    await finish("succeeded");
  } catch (err) {
    const cause = err instanceof CanaryRejected ? err.cause : err;
    const error = errorInfo(cause);
    const state = await loadState();
    state.rejected.hermes = [...new Set([...state.rejected.hermes, to])];
    await saveState();
    if (err instanceof CanaryRejected) {
      await step("canary_rejected", `Canari refusé, la production n'a pas été touchée : ${error.message}`, false, { error });
      await finish("failed");
      return entry;
    }
    await step("failed", `Échec : ${error.message}`, false, { error });
    if (!entry.backup) return (await finish("failed"), entry);
    try {
      await step("hermes_rollback", `Retour arrière vers Hermes ${from} avec restauration des données`, undefined, { version: from });
      await compose(["stop", "api", "hermes"]);
      await restoreHermesData(entry.backup);
      await switchTo(from, prod.appVersion);
      await waitHermes(containerName("hermes"));
      await waitApi(prod.appVersion);
      await step("rollback_done", "Retour arrière terminé, production rétablie", true);
      await finish("rolled_back");
    } catch (rollbackErr) {
      const rollbackError = errorInfo(rollbackErr);
      await step("rollback_failed", `Retour arrière impossible : ${rollbackError.message}`, false, { error: rollbackError });
      await finish("failed");
    }
  }
  return entry;
}

/** Canary contract failure: production was never touched. Wraps the regression error. */
class CanaryRejected extends Error {
  constructor(public override cause: UpdaterError) {
    super(cause.message);
  }
}
export type { ContractResult };

async function switchTo(version: string, appVersion: string) {
  await setEnv("HERMES_VERSION", version);
  // The API image bundles the Hermes CLI: rebuild it on the new version.
  await compose(["build", "api"], { timeoutMs: 20 * 60_000 });
  await compose(["up", "-d", "--no-deps", "hermes", "api"], { timeoutMs: 10 * 60_000 });
  void appVersion;
}

async function runCanary(version: string) {
  const info = await inspectHermes();
  const env = info.Config.Env.filter((e) => CANARY_ENV.test(e));
  const plugins = info.Mounts.find((m) => m.Destination === "/app/infra/hermes-plugins");

  await run(["docker", "rm", "-f", CANARY]);
  await run(["docker", "volume", "rm", "-f", CANARY_VOLUME]);
  await must(["docker", "volume", "create", CANARY_VOLUME]);
  // Copy the data, without scheduled jobs or messaging platform tokens:
  // the canary must not trigger anything (emails, messages) twice. Hermes is
  // paused during the copy so the SQLite databases stay consistent.
  await withHermesPaused(() => must([
    "docker", "run", "--rm",
    "-v", `${volumeName("hermes-data")}:/from:ro`,
    "-v", `${CANARY_VOLUME}:/to`,
    "alpine", "sh", "-c",
    "cp -a /from/. /to/ && find /to -path '*/cron/jobs.json' -delete && " +
      "find /to -name .env -exec sed -i -E '/^(TELEGRAM|DISCORD|SLACK|WHATSAPP|SIGNAL|TEAMS|MATTERMOST|MATRIX|EMAIL|SMS|TWILIO|GOOGLE_CHAT)_[A-Z_]*=/d' {} +",
  ], { timeoutMs: 20 * 60_000 }));

  // Explicit multi-profile in config.yaml: recent Hermes versions no longer
  // infer it on their own under their s6 supervisor.
  const uid = env.find((e) => e.startsWith("HERMES_UID="))?.split("=")[1] ?? "10000";
  const gid = env.find((e) => e.startsWith("HERMES_GID="))?.split("=")[1] ?? "10000";
  await must([
    "docker", "run", "--rm", "--entrypoint", "sh",
    "-v", `${CANARY_VOLUME}:/opt/data`,
    hermesImage(version),
    "-c", `HERMES_HOME=/opt/data /opt/hermes/.venv/bin/hermes config set gateway.multiplex_profiles true >/dev/null && chown ${uid}:${gid} /opt/data/config.yaml`,
  ]);

  await must([
    "docker", "run", "-d", "--name", CANARY,
    ...env.flatMap((e) => ["-e", e]),
    "-v", `${CANARY_VOLUME}:/opt/data`,
    ...(plugins ? ["-v", `${plugins.Source}:/app/infra/hermes-plugins:ro`] : []),
    hermesImage(version),
    "gateway", "run",
  ]);

  return {
    cleanup: async () => {
      await run(["docker", "rm", "-f", CANARY]);
      await run(["docker", "volume", "rm", "-f", CANARY_VOLUME]);
    },
  };
}
