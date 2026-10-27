import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = await mkdtemp(join(tmpdir(), "agora-offsite-test-"));
afterAll(() => rm(scratch, { recursive: true, force: true }));

async function run(space: string, fail = false, snapshotFails = false) {
  const dir = await mkdtemp(join(scratch, "case-"));
  const bin = join(dir, "bin");
  await mkdir(bin);
  await copyFile(new URL("./agora", import.meta.url), join(dir, "agora"));
  await writeFile(join(dir, ".env"), "RESTIC_REPOSITORY=test\nRESTIC_PASSWORD=test\n");
  const trace = join(dir, "trace");
  // macOS has no util-linux flock; the real Linux lock is exercised on the server.
  await writeFile(join(bin, "flock"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  await writeFile(join(bin, "docker"), `#!/usr/bin/env bash
printf '%s\\n' "$1" >> "$AUDIT_TRACE"
if [[ "$1" == "compose" ]]; then
  if [[ " $* " == *" ps -q hermes "* ]]; then echo test-hermes; else echo test-dump; fi
elif [[ "$1" == "run" ]]; then
  [[ " $* " != *" forget "* ]] || printf 'retention\\n' >> "$AUDIT_TRACE"
  if [[ " $* " == *" timeout 120 "* ]]; then
    [[ "$AUDIT_FAIL" == "0" ]] || exit 1
    echo "$AUDIT_SPACE"
  elif [[ " $* " == *" /archive.py "* && "$AUDIT_SNAPSHOT_FAIL" == "1" ]]; then exit 1
  elif [[ " $* " == *" --stdin "* ]]; then cat >/dev/null; fi
fi
`, { mode: 0o755 });
  const proc = Bun.spawn(["bash", join(dir, "agora"), "backup-offsite"], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, AUDIT_TRACE: trace, AUDIT_SPACE: space, AUDIT_FAIL: fail ? "1" : "0", AUDIT_SNAPSHOT_FAIL: snapshotFails ? "1" : "0" },
    stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr, commands: (await readFile(trace, "utf8")).trim().split("\n") };
}

test("insufficient snapshot space fails before pausing Hermes and cleans its staging volume", async () => {
  const r = await run("524288");
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("Not enough space");
  expect(r.commands).not.toContain("pause");
  expect(r.commands).toContain("volume");
  expect(r.commands).toContain("retention");
});

test("an unavailable space estimate also leaves Hermes running", async () => {
  const r = await run("", true);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("Cannot estimate backup space");
  expect(r.commands).not.toContain("pause");
  expect(r.commands).toContain("retention");
});

test("adequate space permits the existing snapshot and off-site flow", async () => {
  const r = await run("2097152");
  expect(r.code).toBe(0);
  expect(r.commands).not.toContain("pause");
  expect(r.stdout).toContain("Off-site backup done");
});

test("a failed online snapshot leaves Hermes running and applies retention", async () => {
  const r = await run("2097152", false, true);
  expect(r.code).toBe(1);
  expect(r.commands).not.toContain("pause");
  expect(r.commands).not.toContain("unpause");
  expect(r.commands).toContain("retention");
});
