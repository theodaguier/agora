import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "agora-backups-test-"));
const settings = { backupsDir: root, backupsVolume: "test-backups", keepBackups: 2 };
let fail = false;
mock.module("./config", () => ({ config: settings }));
mock.module("./prod", () => ({ withHermesPaused: (fn: () => Promise<unknown>) => fn() }));
mock.module("./exec", () => ({
  compose: async () => ({ stdout: "-- test dump" }),
  volumeName: () => "test-data",
  run: async () => ({ code: 0 }),
  must: async (cmd: string[]) => {
    if (fail) throw new Error("archive failed");
    const archive = cmd.find((arg) => arg.endsWith("/hermes-data.tgz"))!;
    await writeFile(join(root, basename(join(archive, "..")), "hermes-data.tgz"), "test archive");
  },
}));
const { backup, listBackups, pruneBackups } = await import("./backup");

beforeEach(async () => {
  fail = false;
  settings.keepBackups = 2;
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
