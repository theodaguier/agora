import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { config } from "./config";
import { compose, must, run, volumeName } from "./exec";
import { withHermesPaused } from "./prod";

/**
 * Left out of the Hermes archive: package caches and installed dependencies, written by the bots'
 * and Claude Code sessions' installs, and rebuilt by the next one. A bun cache of several GB made
 * the archive outlast its timeout, Hermes paused all along.
 */
// Dependencies and framework caches at every depth, including coding-session worktrees.
// Keep in sync with infra/agora; source files, lockfiles and Git history remain included.
const CACHES = ["node_modules", ".venv", ".npm", ".cache", ".next", ".nuxt", ".svelte-kit", ".expo", ".turbo", "*/.bun/install/cache", "*/.local/share/pnpm"];

/**
 * Pre-update backup: Postgres dump + archive of the Hermes volume.
 * Returns the backup's id (directory).
 */
export async function backup(label: string) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dir = join(config.backupsDir, id);
  await mkdir(config.backupsDir, { recursive: true });
  const temporary = await mkdtemp(join(config.backupsDir, ".partial-"));
  const container = `agora-backup-${id}`;
  try {
    const dump = await compose(["exec", "-T", "postgres", "pg_dump", "-U", "agora", "--clean", "--if-exists", "agora"], {
      timeoutMs: 10 * 60_000,
    });
    await Bun.write(join(temporary, "db.sql"), dump.stdout);
    const space = await must([
      "docker", "run", "--rm", "--network=none", "-v", `${config.backupsVolume}:/backups:ro`,
      "alpine", "sh", "-ec", "df -Pk /backups | awk 'END { print $4 }'",
    ]);
    const availableKiB = Number(space.stdout.trim());
    const reserveKiB = 1024 * 1024;
    if (!Number.isSafeInteger(availableKiB) || availableKiB <= reserveKiB) throw new Error("Not enough backup space (1 GiB reserve required)");
    const limit = (availableKiB - reserveKiB) * 1024;
    // A timeout kills the docker client, not its container: remove the writer before its files.
    await withHermesPaused(() => must([
      "docker", "run", "--rm", "--name", container, "--cpus=1", "--memory=256m", "--ulimit", `fsize=${limit}:${limit}`,
      "-v", `${volumeName("hermes-data")}:/data:ro`,
      "-v", `${config.backupsVolume}:/backups`,
      "alpine", "sh", "-c", 'set -o pipefail; tar -cf - "$@" -C /data . | gzip -1 > "$0"',
      `/backups/${basename(temporary)}/hermes-data.tgz`, ...CACHES.map((c) => `--exclude=${c}`),
    ], { timeoutMs: 20 * 60_000 }));
    if (!(await complete(temporary))) throw new Error("Incomplete backup");
    await rename(temporary, dir);
  } catch (err) {
    await run(["docker", "rm", "-f", container]).catch(() => {});
    await rm(temporary, { recursive: true, force: true });
    throw err;
  }
  // A retention failure must not lose the id of a valid rollback backup.
  await pruneBackups().catch((err) => console.error("backup retention", err));
  return id;
}

export async function restoreDatabase(id: string) {
  const sql = await Bun.file(join(config.backupsDir, id, "db.sql")).text();
  await compose(["exec", "-T", "postgres", "psql", "-U", "agora", "-d", "agora", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: sql,
    timeoutMs: 10 * 60_000,
  });
}

/** Restores the Hermes volume (hermes and api services stopped by the caller). */
export async function restoreHermesData(id: string) {
  await must([
    "docker", "run", "--rm",
    "-v", `${volumeName("hermes-data")}:/data`,
    "-v", `${config.backupsVolume}:/backups:ro`,
    // Validate the whole archive before removing any production file.
    "alpine", "sh", "-c", `tar tzf /backups/${id}/hermes-data.tgz >/dev/null && find /data -mindepth 1 -delete && tar xzf /backups/${id}/hermes-data.tgz -C /data`,
  ], { timeoutMs: 20 * 60_000 });
}

export async function listBackups() {
  const entries = await backupDirectories();
  const valid = await Promise.all(entries.filter((name) => BACKUP_ID.test(name)).map(async (name) => await complete(join(config.backupsDir, name)) ? name : null));
  return valid.filter((name): name is string => name !== null).sort().reverse();
}

const BACKUP_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(?:app|hermes)-/;
const PARTIAL_MAX_AGE_MS = 24 * 60 * 60_000;

async function backupDirectories() {
  const entries = await readdir(config.backupsDir, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return [];
    throw err;
  });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function complete(dir: string) {
  return Promise.all(["db.sql", "hermes-data.tgz"].map((name) => stat(join(dir, name)).then((s) => s.isFile() && s.size > 0).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return false;
    throw err;
  }))).then((files) => files.every(Boolean));
}

/** Runs independently of successful updates; interrupted attempts don't consume retention slots. */
export async function pruneBackups() {
  if (!Number.isSafeInteger(config.keepBackups) || config.keepBackups < 1) throw new Error("KEEP_BACKUPS must be a positive integer");
  const all = await listBackups();
  for (const old of all.slice(config.keepBackups)) await rm(join(config.backupsDir, old), { recursive: true, force: true });
  for (const name of await backupDirectories()) {
    if (!name.startsWith(".partial-") && (!BACKUP_ID.test(name) || await complete(join(config.backupsDir, name)))) continue;
    const dir = join(config.backupsDir, name);
    if (Date.now() - (await stat(dir)).mtimeMs > PARTIAL_MAX_AGE_MS) await rm(dir, { recursive: true, force: true });
  }
}
