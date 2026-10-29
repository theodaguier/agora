import { backup, restoreDatabase } from "./backup";
import { appImage, config, usesRegistry } from "./config";
import { errorInfo, UpdaterError } from "./coded";
import { checkContract, regressionError, regressions } from "./contract";
import { compose, containerName, must, run, volumeName } from "./exec";
import { setEnv } from "./envfile";
import { contractEnv, waitApi } from "./prod";
import { checkoutVersion } from "./repo";
import { startRun } from "./run-log";
import { loadState, saveState, type UpdateRun } from "./state";

/**
 * Updates the Agora app: backup → images → switchover (migrations run when
 * the API starts) → health + contract → otherwise rollback with database
 * restore.
 */
export async function updateApp(to: string, trigger: UpdateRun["trigger"]) {
  const prod = await contractEnv();
  const from = prod.appVersion;
  const { entry, step, finish } = await startRun("app", from, to, trigger);
  let originalApi = "";
  let activationRequested = false;

  try {
    // Preserve verified local images. Rollback must not pull/rebuild a mutable
    // Hermes base, especially when the new build failed because the disk is full.
    originalApi = await preserveImage("api", from, `agora-api:${from}-${prod.hermesVersion || "v2026.9.21"}`);
    await preserveImage("web", from, appImage("web", from));
    if (usesRegistry()) {
      await step("app_pull_images", "Téléchargement des images");
      for (const kind of ["app", "web", "updater"] as const) await must(["docker", "pull", appImage(kind, to)], { timeoutMs: 30 * 60_000 });
    }
    for (const kind of ["app", "web", "updater"] as const) {
      const r = await run(["docker", "image", "inspect", appImage(kind, to)]);
      if (r.code !== 0) throw new UpdaterError(`image ${appImage(kind, to)} introuvable`, "image_missing", { image: appImage(kind, to) });
    }

    const baseline = await checkContract({ container: containerName("hermes"), volume: volumeName("hermes-data"), appVersion: from, env: prod.env, uid: prod.uid, chat: false, mutating: false });

    await step("backup_db_start", "Sauvegarde de la base");
    entry.backup = await backup(`app-${to}`);
    await step("backup_done", `Sauvegarde ${entry.backup}`, true, { id: entry.backup });

    await step("app_switch", `Bascule sur Agora ${to}`, undefined, { version: to });
    await switchTo(to, { activating: () => { activationRequested = true; } });
    await waitApi(to);
    const result = await checkContract({ container: containerName("hermes"), volume: volumeName("hermes-data"), appVersion: to, env: prod.env, uid: prod.uid, chat: false, mutating: false });
    entry.contract = result;
    const broken = regressions(result, baseline);
    if (broken.length) throw regressionError("regressions", broken);
    await step("app_verified", "Nouvelle version vérifiée", true);
    await finish("succeeded");
    // Last: replace the update service itself. A container can't recreate
    // itself (it would stop halfway through): a detached helper container,
    // built from the new image, takes care of it.
    await step("updater_swap", "Remplacement du service de mise à jour");
    await must([
      "docker", "run", "-d", "--rm", "--name", `${config.project}-updater-swap`,
      "-v", "/var/run/docker.sock:/var/run/docker.sock",
      "-v", `${config.projectDir}:${config.projectDir}`,
      "-w", config.projectDir, "-e", `PWD=${config.projectDir}`,
      "--entrypoint", "sh", appImage("updater", to),
      "-c", `sleep 3 && docker compose -p ${config.project} --project-directory ${config.projectDir} up -d --no-deps updater`,
    ]);
  } catch (err) {
    const error = errorInfo(err);
    await step("failed", `Échec : ${error.message}`, false, { error });
    const state = await loadState();
    state.rejected.app = [...new Set([...state.rejected.app, to])];
    await saveState();
    if (!entry.backup) return (await finish("failed"), entry);
    try {
      const current = await run(["docker", "inspect", "--format", "{{.Id}}", containerName("api")]);
      if (!activationRequested || (current.code === 0 && current.stdout.trim() === originalApi)) {
        // The failed preparation never ran new migrations: rewinding the DB here
        // would discard messages written while the backup/build was running.
        await setEnv("APP_VERSION", from);
        await checkoutVersion(from).catch((e) => console.error("checkout:", e));
        await must(["docker", "start", containerName("api")]);
        await waitApi(from);
        await step("rollback_done", "Préparation annulée, version précédente rétablie sans restaurer la base", true);
        await finish("rolled_back");
        return entry;
      }
      await step("app_rollback", `Retour arrière vers ${from} avec restauration de la base`, undefined, { version: from });
      await compose(["stop", "api"]);
      await restoreDatabase(entry.backup);
      await switchTo(from, { rollback: true });
      await waitApi(from);
      await step("rollback_done", "Retour arrière terminé, production rétablie", true);
      await finish("rolled_back");
    } catch (rollbackErr) {
      const error = errorInfo(rollbackErr);
      await step("rollback_failed", `Retour arrière impossible : ${error.message}`, false, { error });
      await finish("failed");
    }
  }
  return entry;
}

/** Containerd can expose a config digest in container.Image that is not taggable.
 * Resolve the cached reference in that case, and verify its app version before use. */
async function preserveImage(service: "api" | "web", version: string, target: string) {
  const [id, image, reference] = (await must(["docker", "inspect", "--format", "{{.Id}} {{.Image}} {{.Config.Image}}", containerName(service)])).stdout.trim().split(/\s+/);
  if (!id || !image) throw new Error("Cannot identify running application images");
  let source = image;
  const available = await run(["docker", "image", "inspect", source, "--format", "{{.Id}}"]);
  if (available.code !== 0) {
    if (!reference) throw new Error("The running image has no cached reference");
    source = (await must(["docker", "image", "inspect", reference, "--format", "{{.Id}}"])).stdout.trim();
    const cachedVersion = service === "api"
      ? JSON.parse((await must(["docker", "run", "--rm", "--read-only", "--network=none", "--memory=64m", "--entrypoint", "cat", source, "/app/build.json"])).stdout).app
      : (await must(["docker", "image", "inspect", source, "--format", '{{index .Config.Labels "org.opencontainers.image.version"}}'])).stdout.trim();
    if (!source || cachedVersion !== version) throw new Error("Cached rollback image does not match the running application version");
  }
  await must(["docker", "tag", source, target]);
  return id;
}

async function switchTo(version: string, { rollback = false, activating }: { rollback?: boolean; activating?: () => void } = {}) {
  // On rollback, a checkout failure must not keep production down: the
  // previous images are still there and the checkout can be fixed by hand.
  if (rollback) await checkoutVersion(version).catch((err) => console.error("checkout:", err));
  else await checkoutVersion(version);
  await setEnv("APP_VERSION", version);
  if (!rollback) await compose(["build", "api"], { timeoutMs: 20 * 60_000 });
  activating?.();
  await compose(["up", "-d", "--no-deps", "--no-build", "--pull", "never", "api", "web"], { timeoutMs: 10 * 60_000 });
}
