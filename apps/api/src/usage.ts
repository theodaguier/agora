/**
 * Token usage: collected from the engines, attributed, priced.
 *
 * - Hermes keeps cumulative counters per (session, model, task) in each
 *   profile's state.db (`session_model_usage`), cron jobs included. The
 *   collector reads them, turns what grew since the last read into
 *   `usage_event` rows and remembers the counters in `usage_cursor`.
 * - Claude Code reports each reply's usage in its `result` event: recorded as is.
 *
 * Cost is always an estimate, computed when read from the current prices:
 * the admin's price for the model, otherwise models.dev's (cache kept by Hermes),
 * otherwise what the engine estimated itself.
 */
import { Database } from "bun:sqlite";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "./db";
import { env } from "./env";
import type { UsageSource } from "./db/schema";
import { profileHome } from "./hermes";

const { agent, conversation, conversationMember, modelPrice, usageAttribution, usageCursor, usageEvent } = schema;

type Counters = {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
};
const COUNTERS = ["apiCalls", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "costUsd"] as const;

/* ---------- attribution ---------- */

/** Called when a turn starts: the session's next tokens belong to this employee. */
export async function attributeSession(profile: string, sessionId: string, who: { userId: string | null; agentId: string; conversationId: string }) {
  await db
    .insert(usageAttribution)
    .values({ profile, sessionId, ...who })
    .onConflictDoUpdate({ target: [usageAttribution.profile, usageAttribution.sessionId], set: { ...who, updatedAt: new Date() } });
}

type Attribution = {
  source: UsageSource;
  taskId: string | null;
  taskName: string | null;
  userId: string | null;
  agentId: string | null;
  conversationId: string | null;
};

const CRON_SESSION = /^cron_(.+)_\d{8}_\d{6}$/;
const CURATOR_SESSION = /^(?:agora|edo)-curator-/;
/** Morning recap (digest.ts). */
const DIGEST_SESSION = /^(?:agora|edo)-digest-/;
/** Canary checks run by the update service (hermes-contract.ts). */
const CONTRACT_SESSION = /^(?:agora|edo)-contract-/;
const CONVERSATION_SESSION = /^(?:agora|edo)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

/** Cron jobs of a profile (cron/jobs.json), id → name. */
async function cronJobNames(profile: string) {
  const names = new Map<string, string>();
  try {
    const raw = JSON.parse(await readFile(join(profileHome(profile), "cron", "jobs.json"), "utf8"));
    const jobs = Array.isArray(raw) ? raw : Array.isArray(raw?.jobs) ? raw.jobs : Object.entries(raw?.jobs ?? {}).map(([id, j]) => ({ id, ...(j as object) }));
    for (const j of jobs) if (j?.id) names.set(String(j.id), String(j.name || j.prompt || j.id).slice(0, 120));
  } catch {}
  return names;
}

/* ---------- Hermes collector ---------- */

type HermesRow = {
  session_id: string;
  model: string;
  provider: string;
  task: string;
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
  last_seen: number;
  source: string;
};

function hermesProfiles() {
  if (!env.HERMES_HOME) return [];
  const dir = join(env.HERMES_HOME, "profiles");
  const named = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  return ["default", ...named];
}

/** Last Hermes `last_seen` already read, per profile (rows seen since are re-read). */
const watermarks = new Map<string, number>();
/** Hermes may write a row's counters a little after its `last_seen`: always re-read this margin. */
const REREAD_SECONDS = 15 * 60;

let chain: Promise<unknown> = Promise.resolve();
/** One sync at a time: a turn ending during the periodic sweep must not count the same delta twice. */
function exclusive<T>(fn: () => Promise<T>) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** Turns what Hermes counted since the last read into usage events, for one profile or all of them. */
export function syncHermesUsage(profile?: string) {
  return exclusive(async () => {
    for (const p of profile ? [profile] : hermesProfiles()) {
      try {
        await syncProfile(p);
      } catch (err) {
        console.error(`usage: sync ${p}`, err);
      }
    }
  });
}

function readHermesRows(profile: string, since: number) {
  const path = join(profileHome(profile), "state.db");
  if (!existsSync(path)) return null;
  const sqlite = new Database(path, { readonly: true });
  try {
    const hasTable = sqlite.query("select 1 from sqlite_master where type = 'table' and name = 'session_model_usage'").get();
    if (!hasTable) return null;
    const rows = sqlite
      .query<HermesRow, [number]>(
        `select u.session_id, u.model, u.billing_provider as provider, u.task,
                u.api_call_count as api_calls, u.input_tokens, u.output_tokens, u.cache_read_tokens,
                u.cache_write_tokens, u.reasoning_tokens,
                max(coalesce(u.actual_cost_usd, 0), coalesce(u.estimated_cost_usd, 0)) as cost_usd,
                coalesce(u.last_seen, u.first_seen, s.started_at) as last_seen, s.source
         from session_model_usage u join sessions s on s.id = u.session_id
         where coalesce(u.last_seen, u.first_seen, s.started_at) >= ?`,
      )
      .all(since);
    // Compression continues a session under a new id: attribute to the root session.
    const parent = sqlite.query<{ parent_session_id: string | null }, [string]>("select parent_session_id from sessions where id = ?");
    const roots = new Map<string, string>();
    for (const r of rows) {
      if (roots.has(r.session_id)) continue;
      let id = r.session_id;
      for (let i = 0; i < 20; i++) {
        const up = parent.get(id)?.parent_session_id;
        if (!up) break;
        id = up;
      }
      roots.set(r.session_id, id);
    }
    return { rows, roots };
  } finally {
    sqlite.close();
  }
}

async function syncProfile(profile: string) {
  if (!watermarks.has(profile)) {
    const [row] = await db.select({ last: max(usageCursor.lastSeen) }).from(usageCursor).where(eq(usageCursor.profile, profile));
    watermarks.set(profile, row?.last ?? 0);
  }
  const read = readHermesRows(profile, Math.max(0, watermarks.get(profile)! - REREAD_SECONDS));
  if (!read?.rows.length) return;
  const { rows, roots } = read;

  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const cursors = new Map<string, typeof usageCursor.$inferSelect>();
  for (let i = 0; i < sessionIds.length; i += 500) {
    const batch = await db
      .select()
      .from(usageCursor)
      .where(and(eq(usageCursor.profile, profile), inArray(usageCursor.sessionId, sessionIds.slice(i, i + 500))));
    for (const c of batch) cursors.set(`${c.sessionId}\0${c.provider}\0${c.model}\0${c.task}`, c);
  }

  const events: (typeof usageEvent.$inferInsert)[] = [];
  const updates: (typeof usageCursor.$inferInsert)[] = [];
  const attribute = await attributor(profile, [...new Set(rows.map((r) => roots.get(r.session_id)!))]);
  for (const r of rows) {
    const now: Counters = {
      apiCalls: r.api_calls ?? 0,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
      cacheReadTokens: r.cache_read_tokens ?? 0,
      cacheWriteTokens: r.cache_write_tokens ?? 0,
      reasoningTokens: r.reasoning_tokens ?? 0,
      costUsd: r.cost_usd ?? 0,
    };
    const prev = cursors.get(`${r.session_id}\0${r.provider ?? ""}\0${r.model}\0${r.task ?? ""}`);
    // A counter going down means Hermes reset the row: everything it holds is new.
    const reset = prev && COUNTERS.some((k) => now[k] < prev[k]);
    const delta = Object.fromEntries(COUNTERS.map((k) => [k, now[k] - (prev && !reset ? prev[k] : 0)])) as Counters;
    if (COUNTERS.every((k) => delta[k] <= 0)) continue;

    const who = attribute(roots.get(r.session_id)!, r.source);
    const { costUsd, ...tokens } = delta;
    events.push({
      id: crypto.randomUUID(),
      occurredAt: new Date(r.last_seen * 1000),
      engine: "hermes",
      profile,
      sessionId: r.session_id,
      ...who,
      provider: r.provider ?? "",
      model: r.model,
      ...tokens,
      reportedCostUsd: costUsd,
    });
    updates.push({ profile, sessionId: r.session_id, provider: r.provider ?? "", model: r.model, task: r.task ?? "", ...now, lastSeen: r.last_seen });
  }

  if (updates.length) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < events.length; i += 500) await tx.insert(usageEvent).values(events.slice(i, i + 500));
      for (let i = 0; i < updates.length; i += 500) {
        await tx
          .insert(usageCursor)
          .values(updates.slice(i, i + 500))
          .onConflictDoUpdate({
            target: [usageCursor.profile, usageCursor.sessionId, usageCursor.provider, usageCursor.model, usageCursor.task],
            set: Object.fromEntries(
              [...COUNTERS, "lastSeen"].map((k) => [k, sql.raw(`excluded.${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`)]),
            ),
          });
      }
    });
  }
  watermarks.set(profile, Math.max(watermarks.get(profile)!, ...rows.map((r) => r.last_seen)));
}

/** Resolves who and what a Hermes session's tokens belong to. */
async function attributor(profile: string, rootIds: string[]) {
  const [agents, explicit, jobs] = await Promise.all([
    db.select({ id: agent.id }).from(agent).where(eq(agent.hermesProfile, profile)),
    rootIds.length
      ? db
          .select()
          .from(usageAttribution)
          .where(and(eq(usageAttribution.profile, profile), inArray(usageAttribution.sessionId, rootIds)))
      : [],
    cronJobNames(profile),
  ]);
  const profileAgent = agents[0]?.id ?? null;
  const byRoot = new Map(explicit.map((a) => [a.sessionId, a]));

  // Conversations named by session ids without an explicit attribution (history, sessions from before this feature).
  const convIds = [...new Set(rootIds.filter((id) => !byRoot.has(id)).map((id) => id.match(CONVERSATION_SESSION)?.[1]).filter((id): id is string => !!id))];
  const convs = convIds.length
    ? await db.select({ id: conversation.id, kind: conversation.kind }).from(conversation).where(inArray(conversation.id, convIds))
    : [];
  const members = convs.length
    ? await db
        .select({ conversationId: conversationMember.conversationId, userId: conversationMember.userId })
        .from(conversationMember)
        .where(inArray(conversationMember.conversationId, convs.map((c) => c.id)))
    : [];
  const soleMember = new Map<string, string | null>();
  for (const c of convs) {
    const list = members.filter((m) => m.conversationId === c.id);
    soleMember.set(c.id, c.kind === "direct" && list.length === 1 ? list[0]!.userId : null);
  }

  return (root: string, hermesSource: string): Attribution => {
    const known = byRoot.get(root);
    if (known) return { source: "chat", taskId: null, taskName: null, userId: known.userId, agentId: known.agentId ?? profileAgent, conversationId: known.conversationId };
    const cron = root.match(CRON_SESSION);
    if (cron || hermesSource === "cron") {
      const jobId = cron?.[1] ?? root;
      return { source: "cron", taskId: jobId, taskName: jobs.get(jobId) ?? jobId, userId: null, agentId: profileAgent, conversationId: null };
    }
    if (CURATOR_SESSION.test(root)) {
      return { source: "system", taskId: "curator", taskName: "Curation de la mémoire", userId: null, agentId: null, conversationId: null };
    }
    if (DIGEST_SESSION.test(root)) {
      return { source: "system", taskId: "digest", taskName: "Récap du matin", userId: null, agentId: null, conversationId: null };
    }
    if (CONTRACT_SESSION.test(root)) {
      return { source: "system", taskId: "contract", taskName: "Vérification des mises à jour", userId: null, agentId: null, conversationId: null };
    }
    const convId = root.match(CONVERSATION_SESSION)?.[1];
    if (convId && soleMember.has(convId)) {
      return { source: "chat", taskId: null, taskName: null, userId: soleMember.get(convId) ?? null, agentId: profileAgent, conversationId: convId };
    }
    return { source: "system", taskId: `hermes:${hermesSource}`, taskName: `Autres sessions Hermes (${hermesSource})`, userId: null, agentId: profileAgent, conversationId: null };
  };
}

const SWEEP_MS = 60_000;
let sweeper: ReturnType<typeof setInterval> | null = null;

/** Periodic sweep: catches cron jobs, the curator and whatever a turn's own sync missed. */
export function startUsageCollector() {
  if (sweeper || !env.HERMES_HOME) return;
  const run = () => void syncHermesUsage().catch((err) => console.error("usage: sweep", err));
  run();
  sweeper = setInterval(run, SWEEP_MS);
}

/* ---------- Claude Code ---------- */

export type EngineUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

export async function recordClaudeCodeUsage(usage: EngineUsage[], who: { userId: string | null; agentId: string; conversationId: string; sessionId: string }) {
  const rows = usage.filter((u) => u.inputTokens || u.outputTokens || u.cacheReadTokens || u.cacheWriteTokens);
  if (!rows.length) return;
  await db.insert(usageEvent).values(
    rows.map(({ costUsd, model, ...tokens }) => ({
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      engine: "claude-code" as const,
      source: "chat" as const,
      sessionId: who.sessionId,
      userId: who.userId,
      agentId: who.agentId,
      conversationId: who.conversationId,
      provider: "anthropic",
      // Claude Code suffixes some ids with a context variant (`claude-opus-5-5[1m]`).
      model: model.replace(/\[[^\]]*\]$/, ""),
      apiCalls: 1,
      ...tokens,
      reportedCostUsd: costUsd,
    })),
  );
}

/* ---------- prices ---------- */

/** USD per million tokens. */
export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type PriceSource = "admin" | "models.dev" | "engine";

let modelsDev: { mtime: number; data: Record<string, { models?: Record<string, { cost?: Partial<Record<"input" | "output" | "cache_read" | "cache_write", number>> }> }> } | null = null;

/** models.dev catalogue, as cached by Hermes (refreshed by it). */
async function modelsDevCatalogue() {
  if (!env.HERMES_HOME) return {};
  const path = join(env.HERMES_HOME, "models_dev_cache.json");
  try {
    const mtime = statSync(path).mtimeMs;
    if (modelsDev?.mtime !== mtime) modelsDev = { mtime, data: JSON.parse(await readFile(path, "utf8")) };
    return modelsDev.data;
  } catch {
    return {};
  }
}

function modelsDevPrice(catalogue: Awaited<ReturnType<typeof modelsDevCatalogue>>, provider: string, model: string): Price | null {
  const cost = catalogue[provider]?.models?.[model]?.cost ?? (model.includes("/") ? catalogue[model.split("/")[0]!]?.models?.[model.split("/").slice(1).join("/")]?.cost : undefined);
  if (!cost || (cost.input == null && cost.output == null)) return null;
  return { input: cost.input ?? 0, output: cost.output ?? 0, cacheRead: cost.cache_read ?? cost.input ?? 0, cacheWrite: cost.cache_write ?? cost.input ?? 0 };
}

/** Effective price lookup: admin override, then models.dev. */
export async function priceBook() {
  const [overrides, catalogue] = await Promise.all([db.select().from(modelPrice), modelsDevCatalogue()]);
  const admin = new Map(overrides.map((o) => [`${o.provider}\0${o.model}`, o]));
  return (provider: string, model: string): { price: Price; source: PriceSource; catalogue: Price | null } | { price: null; source: "engine"; catalogue: null } => {
    const own = admin.get(`${provider}\0${model}`);
    const fromCatalogue = modelsDevPrice(catalogue, provider, model);
    if (own) return { price: { input: own.input, output: own.output, cacheRead: own.cacheRead, cacheWrite: own.cacheWrite }, source: "admin", catalogue: fromCatalogue };
    if (fromCatalogue) return { price: fromCatalogue, source: "models.dev", catalogue: fromCatalogue };
    return { price: null, source: "engine", catalogue: null };
  };
}

export type TokenTotals = Omit<Counters, "costUsd">;

export function estimateCost(price: Price | null, t: TokenTotals, reported: number) {
  if (!price) return reported;
  return (t.inputTokens * price.input + t.outputTokens * price.output + t.cacheReadTokens * price.cacheRead + t.cacheWriteTokens * price.cacheWrite) / 1e6;
}

export async function setModelPrice(provider: string, model: string, price: Price, userId: string) {
  await db
    .insert(modelPrice)
    .values({ provider, model, ...price, updatedBy: userId })
    .onConflictDoUpdate({ target: [modelPrice.provider, modelPrice.model], set: { ...price, updatedBy: userId, updatedAt: new Date() } });
}

export async function resetModelPrice(provider: string, model: string) {
  await db.delete(modelPrice).where(and(eq(modelPrice.provider, provider), eq(modelPrice.model, model)));
}
