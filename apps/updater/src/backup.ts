import { mkdir, mkdtemp, readdir, rename, rm, stat, statfs } from "node:fs/promises";
import { basename, join } from "node:path";
import { UpdaterError } from "./coded";
import { config, hermesImage } from "./config";
import { compose, must, run, volumeName } from "./exec";
import { contractEnv } from "./prod";

/**
 * Left out of the Hermes archive: package caches and installed dependencies, written by the bots'
 * and Claude Code sessions' installs, and rebuilt by the next one. A bun cache of several GB made
 * the archive outlast its timeout, Hermes paused all along.
 */
// Dependencies and framework caches at every depth, including coding-session worktrees.
// Keep in sync with infra/agora; source files, lockfiles and Git history remain included.
const CACHES = ["node_modules", ".venv", ".npm", ".cache", ".next", ".nuxt", ".svelte-kit", ".expo", ".turbo", "*/.bun/install/cache", "*/.local/share/pnpm"];

/**
 * Pre-update backup: Postgres dump, plus the archive of the Hermes volume before a Hermes update
 * (`hermes-…` label). An app update's rollback only restores the database: archiving the volume
 * there took 10 to 20 minutes for nothing. Returns the backup's id (directory).
 */
export async function backup(label: string) {
  const withHermes = hasHermesData(label);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dir = join(config.backupsDir, id);
  await mkdir(config.backupsDir, { recursive: true });
  // Reclaim expired archives before reserving space for the next one.
  await pruneBackups();
  const temporary = await mkdtemp(join(config.backupsDir, ".partial-"));
  const container = `agora-backup-${id}`;
  try {
    const dump = await compose(["exec", "-T", "postgres", "pg_dump", "-U", "agora", "--clean", "--if-exists", "agora"], {
      timeoutMs: 10 * 60_000,
    });
    await Bun.write(join(temporary, "db.sql"), dump.stdout);
    if (withHermes) await archiveHermes(temporary, container);
    if (!(await complete(temporary, withHermes))) throw new Error("Incomplete backup");
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

async function archiveHermes(temporary: string, container: string) {
  const space = await must([
    "docker", "run", "--rm", "--network=none", "-v", `${config.backupsVolume}:/backups:ro`,
    "alpine", "sh", "-ec", "df -Pk /backups | awk 'END { print $4 }'",
  ]);
  const availableKiB = Number(space.stdout.trim());
  const reserveKiB = 1024 * 1024;
  if (!Number.isSafeInteger(availableKiB) || availableKiB <= reserveKiB) throw new Error("Not enough backup space (1 GiB reserve required)");
  const limit = (availableKiB - reserveKiB) * 1024;
  // The archive takes many minutes: fail now if the last one, plus a margin, can't fit.
  const needed = Math.ceil((await lastArchiveSize()) * 1.1);
  if (needed > limit) {
    const gb = (bytes: number) => Math.round(bytes / 1e8) / 10;
    throw new UpdaterError(
      `Espace disque insuffisant pour la sauvegarde : environ ${gb(needed)} Go nécessaires, ${gb(limit)} Go libres`,
      "backup_space",
      { needed: gb(needed), free: gb(limit) },
    );
  }
  // A timeout kills the docker client, not its container: remove the writer before its files.
  const { hermesVersion } = await contractEnv();
  await must([
    "docker", "run", "--rm", "-i", "--name", container, "--network=none", "--cpus=1", "--memory=512m", "--ulimit", `fsize=${limit}:${limit}`,
    "--entrypoint", "/opt/hermes/.venv/bin/python",
    "-v", `${volumeName("hermes-data")}:/data:ro`,
    "-v", `${config.backupsVolume}:/backups`,
    hermesImage(hermesVersion), "-", "/data", `/backups/${basename(temporary)}/hermes-data.tgz`, JSON.stringify(CACHES), "/backups/.archive.lock",
  ], { input: await Bun.file(new URL("../hermes-archive.py", import.meta.url)).text(), timeoutMs: 20 * 60_000 });
}

/** Backups taken before a Hermes update carry the Hermes volume; an app update's, the database only. */
const hasHermesData = (name: string) => /(^|Z-)hermes-/.test(name);

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
  const valid = await Promise.all(entries.filter((name) => BACKUP_ID.test(name)).map(async (name) => await complete(join(config.backupsDir, name), hasHermesData(name)) ? name : null));
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

/** Size of the newest Hermes archive, the best guess for the next one (0 without one). */
async function lastArchiveSize() {
  for (const id of await listBackups()) {
    const size = await fileSize(join(config.backupsDir, id, "hermes-data.tgz"));
    if (size) return size;
  }
  return 0;
}

/** A missing file is 0 bytes. */
const fileSize = (path: string) => stat(path).then((s) => (s.isFile() ? s.size : 0)).catch((err: NodeJS.ErrnoException) => {
  if (err.code === "ENOENT") return 0;
  throw err;
});

async function complete(dir: string, withHermes: boolean) {
  const files = withHermes ? ["db.sql", "hermes-data.tgz"] : ["db.sql"];
  return Promise.all(files.map((name) => fileSize(join(dir, name)))).then((sizes) => sizes.every((size) => size > 0));
}

/** Runs independently of successful updates; interrupted attempts don't consume retention slots. */
async function backupCapacity() {
  const fs = await statfs(config.backupsDir);
  return { total: fs.blocks * fs.bsize, available: fs.bavail * fs.bsize };
}

export async function pruneBackups(readCapacity = backupCapacity) {
  if (!Number.isSafeInteger(config.keepBackups) || config.keepBackups < 1) throw new Error("KEEP_BACKUPS must be a positive integer");
  const percent = config.backupBudgetPercent ?? 20;
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 90) throw new Error("BACKUP_BUDGET_PERCENT must be 0–90");
  const all = await listBackups();
  let budget = Infinity;
  let capacity: Awaited<ReturnType<typeof backupCapacity>> | undefined;
  if (percent && all.length > 1) {
    capacity = await readCapacity();
    if (!Number.isSafeInteger(capacity.total) || capacity.total <= 0 || !Number.isSafeInteger(capacity.available) || capacity.available < 0) throw new Error("Cannot determine backup filesystem capacity");
    budget = Math.floor(capacity.total * percent / 100);
  }
  // Keep a consecutive prefix of the newest archives; an oversized latest archive
  // is still a rollback point and must never be removed by this budget.
  let used = 0;
  let full = false;
  const retained: { id: string; size: number }[] = [];
  const remove = async ({ id, size }: { id: string; size: number }) => {
    await rm(join(config.backupsDir, id), { recursive: true, force: true });
    console.log(`backup retention: removed ${id} (${size} bytes)`);
  };
  for (const [i, id] of all.entries()) {
    const sizes = await Promise.all(["db.sql", "hermes-data.tgz"].map((name) => fileSize(join(config.backupsDir, id, name))));
    const size = sizes.reduce((sum, bytes) => sum + bytes, 0);
    if (i > 0 && (full || i >= config.keepBackups || used + size > budget)) {
      full = true;
      await remove({ id, size });
    } else { used += size; retained.push({ id, size }); }
  }
  if (capacity && retained.length > 1) {
    // Keep room for an archive the size of the latest one plus the 1 GiB reserve.
    // Refresh after deletion: sparse files/hardlinks may not actually free their apparent size.
    const required = retained[0]!.size + 1024 ** 3;
    capacity = await readCapacity();
    while (retained.length > 1 && capacity.available < required) {
      await remove(retained.pop()!);
      capacity = await readCapacity();
    }
  }
  for (const name of await backupDirectories()) {
    if (!name.startsWith(".partial-") && (!BACKUP_ID.test(name) || await complete(join(config.backupsDir, name), hasHermesData(name)))) continue;
    const dir = join(config.backupsDir, name);
    if (Date.now() - (await stat(dir)).mtimeMs > PARTIAL_MAX_AGE_MS) await rm(dir, { recursive: true, force: true });
  }
}
