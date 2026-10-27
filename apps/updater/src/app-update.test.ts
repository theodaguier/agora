import { expect, test } from "bun:test";

test("update failure and rollback scenarios run in an isolated updater process", async () => {
  const proc = Bun.spawn([process.execPath, "test", new URL("../tests/app-update-cases.test.ts", import.meta.url).pathname], { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if (code) throw new Error(stdout + stderr);
  expect(code).toBe(0);
});
