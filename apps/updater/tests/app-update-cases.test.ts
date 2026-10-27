import { beforeEach, expect, mock, test } from "bun:test";

let failure = "build", currentId = "old-container";
let commands: string[][] = [], restored = 0;
let outcomes: string[] = [];
const state = { rejected: { app: [] as string[] } };
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
mock.module("../src/config", () => ({ config: { project: "agora", projectDir: "/infra" }, usesRegistry: () => true, appImage: (kind: string, version: string) => `registry/app-${kind}:${version}` }));
mock.module("../src/backup", () => ({ backup: async () => { if (failure === "backup") throw new Error("archive failed"); return "backup-id"; }, restoreDatabase: async () => { restored++; } }));
mock.module("../src/prod", () => ({ contractEnv: async () => ({ appVersion: "0.45.0", hermesVersion: "fixture", env: {}, uid: "10000:10000" }), waitApi: async (version: string) => { if (version === "0.45.3" && failure === "health") throw new Error("unhealthy target"); } }));
mock.module("../src/contract", () => ({ checkContract: async () => ({}), regressions: () => [], regressionError: () => new Error("contract") }));
mock.module("../src/envfile", () => ({ setEnv: async (...args: string[]) => { commands.push(["setEnv", ...args]); } }));
mock.module("../src/repo", () => ({ checkoutVersion: async (version: string) => { commands.push(["checkout", version]); } }));
mock.module("../src/state", () => ({ loadState: async () => state, saveState: async () => {} }));
mock.module("../src/run-log", () => ({ startRun: async () => ({ entry: {} as { backup?: string }, step: async () => {}, finish: async (status: string) => { outcomes.push(status); } }) }));
const command = async (args: string[]) => {
  commands.push(args);
  if (args[1] === "inspect") {
    if (args.includes("{{.Id}} {{.Image}}")) return ok("old-container sha256:working-api");
    if (args.includes("{{.Image}}")) return ok("sha256:working-web");
    return ok(currentId);
  }
  return ok();
};
mock.module("../src/exec", () => ({
  containerName: (name: string) => `agora-${name}-1`, volumeName: (name: string) => `agora_${name}`,
  run: command, must: command,
  compose: async (args: string[]) => {
    commands.push(["compose", ...args]);
    if (args[0] === "build" && failure === "build") throw new Error("disk full");
    if (args[0] === "up") {
      if (failure === "up") throw new Error("recreation failed before touching the old API");
      currentId = "new-container";
    }
    return ok();
  },
}));
const { updateApp } = await import("../src/app-update");
beforeEach(() => { failure = "build"; currentId = "old-container"; restored = 0; commands = []; outcomes = []; state.rejected.app = []; });

test("disk failure during build keeps the old API and never rewinds its database", async () => {
  await updateApp("0.45.3", "manual");
  expect(restored).toBe(0);
  expect(commands.some((c) => c[0] === "compose" && c[1] === "stop")).toBe(false);
  expect(commands).toContainEqual(["setEnv", "APP_VERSION", "0.45.0"]);
  expect(outcomes).toEqual(["rolled_back"]);
});

test("a failed target health check restores the database and reuses cached old images", async () => {
  failure = "health";
  await updateApp("0.45.3", "manual");
  expect(restored).toBe(1);
  expect(commands.filter((c) => c[0] === "compose" && c[1] === "build")).toHaveLength(1);
  const starts = commands.filter((c) => c[0] === "compose" && c[1] === "up");
  expect(starts).toHaveLength(2);
  for (const cmd of starts) { expect(cmd).toContain("--no-build"); expect(cmd).toContain("never"); }
  expect(commands).toContainEqual(["docker", "tag", "sha256:working-api", "agora-api:0.45.0-fixture"]);
  expect(outcomes).toEqual(["rolled_back"]);
});

test("failure before replacing the original container also keeps the live database", async () => {
  failure = "up";
  await updateApp("0.45.3", "manual");
  expect(restored).toBe(0);
  expect(commands.some((c) => c[0] === "compose" && c[1] === "stop")).toBe(false);
  expect(outcomes).toEqual(["rolled_back"]);
});

test("backup failure leaves the production API untouched", async () => {
  failure = "backup";
  await updateApp("0.45.3", "manual");
  expect(restored).toBe(0);
  expect(commands.some((c) => c[0] === "compose")).toBe(false);
  expect(outcomes).toEqual(["failed"]);
});
