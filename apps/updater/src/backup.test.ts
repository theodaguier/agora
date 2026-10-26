import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, statfs, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "agora-backups-test-"));
const settings = { backupsDir: root, backupsVolume: "test-backups", keepBackups: 2, backupBudgetPercent: 20 };
let fail = false;
let spaceKiB = "2097152";
let pauses = 0;
mock.module("./config", () => ({ config: settings }));
mock.module("./prod", () => ({ withHermesPaused: (fn: () => Promise<unknown>) => { pauses++; return fn(); } }));
mock.module("./exec", () => ({
  compose: async () => ({ stdout: "-- test dump" }),
  volumeName: () => "test-data",
  run: async () => ({ code: 0 }),
  must: async (cmd: string[]) => {
    if (cmd.includes("--network=none")) return { stdout: spaceKiB };
    if (fail) throw new Error("archive failed");
    const archive = cmd.find((arg) => arg.endsWith("/hermes-data.tgz"))!;
    await writeFile(join(root, basename(join(archive, "..")), "hermes-data.tgz"), "test archive");
  },
}));
const { backup, listBackups, pruneBackups } = await import("./backup");

beforeEach(async () => {
  fail = false;
  spaceKiB = "2097152";
  pauses = 0;
  settings.keepBackups = 2;
  settings.backupBudgetPercent = 20;
  for (const name of await readdir(root)) await rm(join(root, name), { recursive: true, force: true });
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function fixture(day: string, complete = true) {
  const id = `2026-10-${day}T00-00-00-000Z-app-0.44.1`;
  const dir = join(root, id);
  await mkdir(dir);
  await writeFile(join(dir, "db.sql"), "dump");
  if (complete) await writeFile(join(dir, "hermes-data.tgz"), "archive");
  return id;
}

test("an archive failure removes its partial files and preserves usable backups", async () => {
  const kept = await fixture("01");
  fail = true;
  await expect(backup("app-0.44.2")).rejects.toThrow("archive failed");
  expect(await readdir(root)).toEqual([kept]);
  expect(await listBackups()).toEqual([kept]);
});

test("insufficient or invalid disk capacity fails before pausing Hermes", async () => {
  const kept = await fixture("01");
  for (const space of ["524288", "invalid", ""]) {
    spaceKiB = space;
    await expect(backup("app-0.45.1")).rejects.toThrow("backup space");
  }
  expect(pauses).toBe(0);
  expect(await readdir(root)).toEqual([kept]);
});

test("a successful backup becomes visible only as a complete backup", async () => {
  const id = await backup("app-0.44.2");
  expect(await listBackups()).toEqual([id]);
  expect((await readdir(join(root, id))).sort()).toEqual(["db.sql", "hermes-data.tgz"]);
});

test("retention counts complete backups and ignores unrelated files", async () => {
  const old = await fixture("01");
  const recent = await fixture("02");
  const newest = await fixture("03");
  await fixture("04", false);
  await writeFile(join(root, "notes.txt"), "keep");
  await pruneBackups();
  expect(await listBackups()).toEqual([newest, recent]);
  expect(await readdir(root)).not.toContain(old);
  expect(await readdir(root)).toContain("notes.txt");
});

test("a stale interrupted attempt is cleaned without a successful new backup", async () => {
  const stale = await fixture("01", false);
  const partial = join(root, ".partial-interrupted");
  await mkdir(partial);
  const old = new Date(Date.now() - 2 * 24 * 60 * 60_000);
  await utimes(join(root, stale), old, old);
  await utimes(partial, old, old);
  await pruneBackups();
  expect(await readdir(root)).toEqual([]);
});

test("an invalid retention value cannot delete rollback backups", async () => {
  const kept = await fixture("01");
  settings.keepBackups = 0;
  await expect(pruneBackups()).rejects.toThrow("positive integer");
  expect(await listBackups()).toEqual([kept]);
});

test("disk budget prunes oldest archives even below the count limit", async () => {
  settings.keepBackups = 7;
  const fs = await statfs(root);
  const size = Math.floor(fs.blocks * fs.bsize * 0.08);
  const ids = [await fixture("01"), await fixture("02"), await fixture("03")];
  // Sparse files exercise real stat sizes without allocating the archive payloads.
  for (const id of ids) await truncate(join(root, id, "hermes-data.tgz"), size);
  await pruneBackups();
  expect(await listBackups()).toEqual([ids[2]!, ids[1]!]);
});

test("a single oversized latest backup is always retained", async () => {
  const fs = await statfs(root);
  const old = await fixture("01"), latest = await fixture("02");
  await truncate(join(root, latest, "hermes-data.tgz"), Math.floor(fs.blocks * fs.bsize * 0.21));
  await pruneBackups();
  expect(await listBackups()).toEqual([latest]);
  expect(await readdir(root)).not.toContain(old);
});

test("an invalid budget fails before removing any archive", async () => {
  const kept = await fixture("01");
  settings.backupBudgetPercent = 100;
  await expect(pruneBackups()).rejects.toThrow("BACKUP_BUDGET_PERCENT");
  expect(await listBackups()).toEqual([kept]);
});

test("the size budget can be explicitly disabled", async () => {
  const fs = await statfs(root);
  const old = await fixture("01"), latest = await fixture("02");
  await truncate(join(root, latest, "hermes-data.tgz"), Math.floor(fs.blocks * fs.bsize * 0.21));
  settings.backupBudgetPercent = 0;
  await pruneBackups();
  expect(await listBackups()).toEqual([latest, old]);
});

test("free space for the next backup is measured again after removing the oldest", async () => {
  settings.keepBackups = 7;
  const gb = 1024 ** 3;
  const ids = [await fixture("01"), await fixture("02"), await fixture("03")];
  for (const [i, id] of ids.entries()) await truncate(join(root, id, "hermes-data.tgz"), (i === 0 ? 4 : 7) * gb);
  let reads = 0;
  await pruneBackups(async () => ({ total: 100 * gb, available: (++reads >= 3 ? 9 : 5) * gb }));
  expect(await listBackups()).toEqual([ids[2]!, ids[1]!]);
  expect(reads).toBe(3);
});
