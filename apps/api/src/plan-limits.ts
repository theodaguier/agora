/**
 * How much of their subscription's rate limits the coding engines installed on the machine have
 * used (Claude Code, Codex): the rolling 5-hour window and the weekly one, as the CLIs show them.
 *
 * - Claude Code: Anthropic's OAuth usage endpoint, with the active account's token. It throttles
 *   hard (Retry-After of half an hour), so it is read at most every 5 minutes and the last answer
 *   is served in between and while throttled. A setup-token (the server's usual login) has no
 *   access to it: its limits come from the headers of a one-token request instead.
 * - Codex: `account/rateLimits/read` of its app server, for the active account.
 */
import { claudeAccessToken, listClaudeAccounts } from "./claude-accounts";
import { canUseClaudeCode } from "./claude-code";
import { canUseCodex } from "./codex";
import { codexRateLimits, listCodexAccounts } from "./codex-accounts";
import type { SubscriptionAccountsState } from "./subscription-accounts";
import { env } from "./env";
import { claudeHeaderLimits, Throttled, type PlanLimits, type PlanWindow } from "./plan-windows";

export type { PlanLimits, PlanWindow };

const FIVE_HOURS = 300;
const WEEK = 7 * 24 * 60;

type Engine = {
  id: PlanLimits["id"];
  bin: () => string;
  canUse: (user: { email: string }) => boolean;
  ttl: number;
  accounts: () => Promise<SubscriptionAccountsState>;
  read: () => Promise<Pick<PlanLimits, "plan" | "windows"> | null>;
};

type ClaudeWindow = { utilization?: number | null; resets_at?: string | null } | null;

/**
 * Until when the usage endpoint is not asked again for a token: forever once it refused it (403, no
 * `user:profile` scope), until its Retry-After when it throttles. Meanwhile the limits come from the
 * headers of a one-token request, which never stop.
 */
const usageEndpointOff = new Map<string, number>();

const ENGINES: Engine[] = [
  {
    id: "claude-code",
    bin: () => env.CLAUDE_CODE_BIN,
    canUse: canUseClaudeCode,
    ttl: 5 * 60_000,
    accounts: listClaudeAccounts,
    read: async () => {
      const token = await claudeAccessToken();
      if (!token) return null;
      // A setup-token (`claude setup-token`, the server's usual login) can't read the usage endpoint,
      // and the endpoint throttles hard (an hour): either way, the headers answer.
      if ((usageEndpointOff.get(token) ?? 0) > Date.now()) return claudeHeaderLimits(token);
      const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 403 || res.status === 429) {
        await res.body?.cancel();
        usageEndpointOff.set(token, res.status === 403 ? Infinity : Date.now() + Math.max(60, Number(res.headers.get("retry-after")) || 900) * 1000);
        return claudeHeaderLimits(token);
      }
      if (!res.ok) throw new Error(`claude usage: HTTP ${res.status}`);
      const body = (await res.json()) as Record<"five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet", ClaudeWindow | undefined>;
      const win = (w: ClaudeWindow | undefined, windowMins: number, model: string | null = null): PlanWindow[] =>
        w && typeof w.utilization === "number" ? [{ usedPercent: w.utilization, resetsAt: w.resets_at ?? null, windowMins, model }] : [];
      return {
        plan: null,
        windows: [
          ...win(body.five_hour, FIVE_HOURS),
          ...win(body.seven_day, WEEK),
          ...win(body.seven_day_opus, WEEK, "Opus"),
          ...win(body.seven_day_sonnet, WEEK, "Sonnet"),
        ],
      };
    },
  },
  {
    id: "codex",
    bin: () => env.CODEX_BIN,
    canUse: canUseCodex,
    ttl: 2 * 60_000,
    accounts: listCodexAccounts,
    read: async () => {
      const r = await codexRateLimits();
      if (!r) return null;
      const windows = [r.primary, r.secondary].flatMap((w) =>
        w
          ? [{ usedPercent: w.usedPercent, resetsAt: w.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null, windowMins: w.windowDurationMins ?? FIVE_HOURS, model: null }]
          : [],
      );
      return { plan: r.planType ?? null, windows };
    },
  },
];

type Entry = { at: number; next: number; value: PlanLimits | null; pending?: Promise<void> };
const cache = new Map<string, Entry>();

function limitsOf(engine: Engine): Promise<PlanLimits | null> {
  const entry = cache.get(engine.id) ?? { at: 0, next: 0, value: null };
  cache.set(engine.id, entry);
  if (Date.now() < entry.next) return Promise.resolve(entry.value);
  entry.pending ??= engine
    .read()
    .then((r) => {
      entry.value = r ? { id: engine.id, account: null, ...r, at: new Date().toISOString() } : null;
      entry.next = Date.now() + engine.ttl;
    })
    .catch((err) => {
      // Keep the last answer: the sidebar would rather show a slightly old figure than nothing.
      entry.next = err instanceof Throttled ? err.until : Date.now() + engine.ttl;
      if (!(err instanceof Throttled)) console.error(`plan-limits: ${engine.id}`, err);
    })
    .finally(() => (entry.pending = undefined));
  return entry.pending.then(() => entry.value);
}

/** The plans this employee may use whose CLI is installed here (only their owner sees them). */
export async function planLimits(user: { email: string }): Promise<PlanLimits[]> {
  const engines = ENGINES.filter((e) => e.canUse(user) && Bun.which(e.bin()));
  const all = await Promise.all(
    engines.map(async (e) => {
      const [limits, accounts] = await Promise.all([limitsOf(e), e.accounts().catch(() => null)]);
      if (!limits?.windows.length) return null;
      // Who is signed in comes from the account list (cached a minute), so a switch shows at once.
      const active = accounts?.active ? accounts.accounts.find((a) => a.id === accounts.active) : accounts?.machine;
      return { ...limits, account: active?.email ?? null, plan: limits.plan ?? active?.plan ?? null };
    }),
  );
  return all.filter((p): p is PlanLimits => !!p);
}
