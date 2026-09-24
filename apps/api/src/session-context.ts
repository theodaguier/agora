import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import { profileHome } from "./hermes";

/** What /context shows: how full the bot's Hermes session is. */
export type SessionContext = {
  model: string | null;
  messages: number;
  /** Estimate of the context currently sent to the model (≈ 4 characters per token). */
  tokens: number;
  /** Model's context window, when models.dev knows it. */
  window: number | null;
  /** Hermes compressed the session on its own since it started. */
  autoCompressions: number;
  /** Totals billed on this session (all compressions included). */
  totals: { input: number; output: number; cacheRead: number };
};

type Row = {
  id: string;
  model: string | null;
  billing_provider: string | null;
  end_reason: string | null;
  system_prompt: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
};

/** Reads a session from the profile's state.db; null if Hermes hasn't created it yet. */
export async function sessionContext(profile: string, sessionId: string): Promise<SessionContext | null> {
  const path = join(profileHome(profile), "state.db");
  if (!existsSync(path)) return null;
  const sqlite = new Database(path, { readonly: true });
  try {
    const byId = sqlite.query<Row, [string]>(
      "select id, model, billing_provider, end_reason, system_prompt, input_tokens, output_tokens, cache_read_tokens from sessions where id = ?",
    );
    const child = sqlite.query<Row, [string]>(
      "select id, model, billing_provider, end_reason, system_prompt, input_tokens, output_tokens, cache_read_tokens from sessions where parent_session_id = ? order by started_at desc limit 1",
    );
    let row = byId.get(sessionId);
    if (!row) return null;
    const totals = { input: row.input_tokens, output: row.output_tokens, cacheRead: row.cache_read_tokens };
    // Auto-compression continues the session under a new id.
    let autoCompressions = 0;
    for (let next = row.end_reason === "compression" ? child.get(row.id) : null; next && autoCompressions < 50; next = next.end_reason === "compression" ? child.get(next.id) : null) {
      row = next;
      autoCompressions++;
      totals.input += next.input_tokens;
      totals.output += next.output_tokens;
      totals.cacheRead += next.cache_read_tokens;
    }
    const active = sqlite
      .query<{ n: number; chars: number }, [string]>(
        "select count(*) as n, coalesce(sum(length(coalesce(content, '')) + length(coalesce(tool_calls, ''))), 0) as chars from messages where session_id = ? and active = 1",
      )
      .get(row.id) ?? { n: 0, chars: 0 };
    const chars = active.chars + (row.system_prompt?.length ?? 0);
    return {
      model: row.model,
      messages: active.n,
      tokens: Math.round(chars / 4),
      window: row.model ? await contextWindow(row.billing_provider, row.model) : null,
      autoCompressions,
      totals,
    };
  } finally {
    sqlite.close();
  }
}

type ModelsDev = Record<string, { models?: Record<string, { limit?: { context?: number } }> }>;

/** Context window from the models.dev catalog Hermes keeps in cache. */
async function contextWindow(provider: string | null, model: string) {
  if (!env.HERMES_HOME) return null;
  let catalog: ModelsDev;
  try {
    catalog = JSON.parse(await readFile(join(env.HERMES_HOME, "models_dev_cache.json"), "utf8"));
  } catch {
    return null;
  }
  const exact = provider ? catalog[provider]?.models?.[model]?.limit?.context : undefined;
  if (exact) return exact;
  for (const p of Object.values(catalog)) {
    const context = p.models?.[model]?.limit?.context;
    if (context) return context;
  }
  return null;
}
