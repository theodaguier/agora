/**
 * The figures of a coding subscription's limits, and how a Claude token without the `user:profile`
 * scope (a setup-token) still reads them. No server dependency: plan-limits.ts and its test use it.
 */

/** `model`: a window that only counts one model family (Claude's weekly Opus or Sonnet limit). */
export type PlanWindow = { usedPercent: number; resetsAt: string | null; windowMins: number; model: string | null };
/** `account`: the email of the subscription in use, `at`: when the figures were read. */
export type PlanLimits = { id: "claude-code" | "codex"; plan: string | null; account: string | null; windows: PlanWindow[]; at: string };

/** The provider asked to wait: nothing is read again before `until`. */
export class Throttled extends Error {
  constructor(public until: number) {
    super("throttled");
  }
}

/** Claude's window names in its rate-limit headers: 5h, 7d, then per model (7d_opus…). */
const HEADER_WINDOW = /^anthropic-ratelimit-unified-(\d+)([hd])(?:_(\w+))?-utilization$/;

/**
 * The limits a token without the `user:profile` scope can still see: every reply of the API carries
 * them in its `anthropic-ratelimit-unified-*` headers (utilization from 0 to 1, reset in Unix seconds),
 * so a one-token request reads them. Claude Code itself reads the same headers.
 */
export async function claudeHeaderLimits(token: string): Promise<Pick<PlanLimits, "plan" | "windows"> | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1,
      // Subscription tokens only answer as Claude Code.
      system: "You are Claude Code, Anthropic's official CLI for Claude.",
      messages: [{ role: "user", content: "." }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  await res.body?.cancel();
  if (res.status === 429 && !res.headers.has("anthropic-ratelimit-unified-status"))
    throw new Throttled(Date.now() + Math.max(60, Number(res.headers.get("retry-after")) || 900) * 1000);
  const windows: PlanWindow[] = [];
  for (const [name, value] of res.headers) {
    const m = HEADER_WINDOW.exec(name);
    if (!m || !Number.isFinite(Number(value))) continue;
    const [, n, unit, model] = m;
    const reset = Number(res.headers.get(name.replace(/-utilization$/, "-reset")));
    windows.push({
      usedPercent: Number(value) * 100,
      resetsAt: reset ? new Date(reset * 1000).toISOString() : null,
      windowMins: Number(n) * (unit === "h" ? 60 : 24 * 60),
      model: model ? model.charAt(0).toUpperCase() + model.slice(1) : null,
    });
  }
  if (!windows.length && !res.ok) throw new Error(`claude limits: HTTP ${res.status}`);
  return { plan: null, windows };
}
