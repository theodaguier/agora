import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STALE_DEPENDENCIES_SCRIPT } from "./cleanup";

const root = await mkdtemp(join(tmpdir(), "agora-hermes-data-"));
afterAll(() => rm(root, { recursive: true, force: true }));

async function folder(path: string, daysOld = 0) {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.js"), "");
  const at = new Date(Date.now() - daysOld * 24 * 60 * 60_000);
  await utimes(dir, at, at);
}

test("dependencies not reinstalled for 2 days go from the bots' folders and code worktrees, nothing else", async () => {
  await folder("etouch-wt/auth/node_modules/react", 10);
  await folder("etouch-wt/auth/apps/web/.next", 10);
  await folder("etouch-wt/auth/node_modules", 10);
  await folder("etouch-wt/auth/src");
  await folder("qa-page/node_modules", 0.5);
  await folder("lazy-packages/node_modules", 10);
  await folder("profiles/bot/node_modules", 10);
  await folder(".agora/claude-code/worktrees/agora-1a2b/node_modules", 10);
  await folder(".agora/claude-code/worktrees/agora-1a2b/apps/web/.turbo", 10);
  await folder(".bun/install/cache/node_modules", 10);
  const r = Bun.spawnSync(["sh", "-c", STALE_DEPENDENCIES_SCRIPT, "sh", root]);
  expect(r.exitCode).toBe(0);
  expect(r.stdout.toString().trim()).toBe("4");
  expect((await readdir(join(root, "etouch-wt/auth"))).sort()).toEqual(["apps", "src"]);
  expect(await readdir(join(root, "etouch-wt/auth/apps/web"))).toEqual([]);
  expect(await readdir(join(root, "qa-page"))).toEqual(["node_modules"]);
  expect(await readdir(join(root, "lazy-packages"))).toEqual(["node_modules"]);
  expect(await readdir(join(root, "profiles/bot"))).toEqual(["node_modules"]);
  expect((await readdir(join(root, ".agora/claude-code/worktrees/agora-1a2b"))).sort()).toEqual(["apps"]);
  expect(await readdir(join(root, ".agora/claude-code/worktrees/agora-1a2b/apps/web"))).toEqual([]);
  expect(await readdir(join(root, ".bun/install/cache"))).toEqual(["node_modules"]);
});
