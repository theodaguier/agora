import { expect, test } from "bun:test";
import { createOAuthStatus, withOAuthLock, type OAuthFlow } from "./mcp-oauth-flows";

function setup() {
  const row = { id: crypto.randomUUID(), name: crypto.randomUUID(), status: "authorizing" };
  let finished = 0;
  let errors = 0;
  let current: string | undefined = "current";
  let flow: OAuthFlow = { server_name: row.name, status: "approved", error: null, tools: [{ name: "read" }] };
  const status = createOAuthStatus({
    load: async () => ({ ...row }),
    currentFlow: () => current,
    read: async () => flow,
    finish: async (_, tools) => {
      expect(tools).toEqual(["read"]);
      await Bun.sleep(5);
      row.status = "installed";
      finished++;
    },
    error: async () => { errors++; },
    invalidFlow: () => new Error("invalid flow"),
  });
  return { row, status, finished: () => finished, errors: () => errors, setFlow: (next: OAuthFlow) => { flow = next; }, forget: () => { current = undefined; } };
}

test("an unrelated approved OAuth flow cannot finalize a connector", async () => {
  const s = setup();
  s.setFlow({ server_name: "another-connector", status: "approved", error: null });
  await expect(s.status(s.row.id, "current")).rejects.toThrow("invalid flow");
  expect(s.finished()).toBe(0);
});

test("concurrent status polls finalize and restart only once", async () => {
  const s = setup();
  await Promise.all([s.status(s.row.id, "current"), s.status(s.row.id, "current")]);
  expect(s.finished()).toBe(1);
});

test("a replaced flow is rejected and Hermes's identity still works after an API restart", async () => {
  const s = setup();
  await expect(s.status(s.row.id, "old")).rejects.toThrow("invalid flow");
  s.forget();
  await s.status(s.row.id, "current");
  expect(s.finished()).toBe(1);
});

test("an error from another connector cannot change this connector", async () => {
  const s = setup();
  s.setFlow({ server_name: "another-connector", status: "error", error: "denied" });
  await expect(s.status(s.row.id, "current")).rejects.toThrow("invalid flow");
  expect(s.errors()).toBe(0);
});

test("an operation failure releases its connector lock", async () => {
  const name = crypto.randomUUID();
  await expect(withOAuthLock(name, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
  expect(await withOAuthLock(name, async () => "retry")).toBe("retry");
});
