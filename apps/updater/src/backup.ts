import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";
import { compose, must, run, volumeName } from "./exec";
import { withHermesPaused } from "./prod";

/**
 * Left out of the Hermes archive: package caches and installed dependencies, written by the bots'
 * and Claude Code sessions' installs, and rebuilt by the next one. A bun cache of several GB made
 * the archive outlast its timeout, Hermes paused all along.
 */
const CACHES = ["node_modules", "./.bun/install/cache", "./.npm", "./.cache", "./.local/share/pnpm"];

/**
 * Pre-update backup: Postgres dump + archive of the Hermes volume.
 * Returns the backup's id (directory).
 */
export async function backup(label: string) {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
  const dir = join(config.backupsDir, id);
  await must(["mkdir", "-p", dir]);
  const dump = await compose(["exec", "-T", "postgres", "pg_dump", "-U", "agora", "--clean", "--if-exists", "agora"], {
    timeoutMs: 10 * 60_000,
  });
  await Bun.write(join(dir, "db.sql"), dump.stdout);
  // Named: a timeout kills the docker client, not the container, which would go on archiving.
  const container = `agora-backup-${id}`;
  await withHermesPaused(() => must([
    "docker", "run", "--rm", "--name", container,
    "-v", `${volumeName("hermes-data")}:/data:ro`,
    "-v", `${config.backupsVolume}:/backups`,
    "alpine", "tar", "czf", `/backups/${id}/hermes-data.tgz`, ...CACHES.map((c) => `--exclude=${c}`), "-C", "/data", ".",
  ], { timeoutMs: 20 * 60_000 })).catch(async (err) => {
    await run(["docker", "rm", "-f", container]);
    throw err;
  });
  await prune();
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
    "alpine", "sh", "-c", `find /data -mindepth 1 -delete && tar xzf /backups/${id}/hermes-data.tgz -C /data`,
  ], { timeoutMs: 20 * 60_000 });
}

export async function listBackups() {
  const entries = await readdir(config.backupsDir).catch(() => []);
  return entries.sort().reverse();
}

async function prune() {
  const all = await listBackups();
  for (const old of all.slice(config.keepBackups)) await rm(join(config.backupsDir, old), { recursive: true, force: true });
}
