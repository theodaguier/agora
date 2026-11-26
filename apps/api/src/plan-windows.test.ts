import { afterEach, expect, test } from "bun:test";
import { claudeHeaderLimits } from "./plan-windows";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const reply = (status: number, headers: Record<string, string>) => {
  globalThis.fetch = (async () => new Response("{}", { status, headers })) as unknown as typeof fetch;
};

test("a setup-token's limits come from the rate-limit headers", async () => {
  // What Anthropic answered the production server's setup-token on 2026-11-26.
  reply(200, {
    "anthropic-ratelimit-unified-7d-reset": "1795917600",
    "anthropic-ratelimit-unified-7d-status": "allowed",
    "anthropic-ratelimit-unified-7d-utilization": "0.48",
    "anthropic-ratelimit-unified-fallback-percentage": "0.5",
    "anthropic-ratelimit-unified-reset": "1795917600",
    "anthropic-ratelimit-unified-status": "allowed",
  });
  expect(await claudeHeaderLimits("t")).toEqual({
    plan: null,
    windows: [{ usedPercent: 48, resetsAt: new Date(1795917600 * 1000).toISOString(), windowMins: 7 * 24 * 60, model: null }],
  });
});

test("the session and per-model windows are read too", async () => {
  reply(200, {
    "anthropic-ratelimit-unified-5h-utilization": "0.1",
    "anthropic-ratelimit-unified-7d-utilization": "0.5",
    "anthropic-ratelimit-unified-7d_opus-utilization": "0.25",
  });
  const r = await claudeHeaderLimits("t");
  expect(r?.windows.map((w) => [w.windowMins, w.model, w.usedPercent, w.resetsAt])).toEqual(
    expect.arrayContaining([
      [300, null, 10, null],
      [10080, null, 50, null],
      [10080, "Opus", 25, null],
    ]),
  );
});

test("an error without any limit is an error", async () => {
  reply(401, {});
  await expect(claudeHeaderLimits("t")).rejects.toThrow("HTTP 401");
});
