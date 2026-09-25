import { eq } from "drizzle-orm";
import { CLAUDE_CODE_PROVIDER, claudeCodeModels } from "./claude-code";
import { CODEX_PROVIDER, codexModels } from "./codex";
import { db, schema } from "./db";
import { modelOptions, type ModelOptions } from "./hermes";

const { modelBlock } = schema;

/** Models blocked for this employee (`provider::model`, Claude Code's and Codex's included). */
export async function blockedModels(userId: string) {
  const rows = await db.select({ model: modelBlock.model }).from(modelBlock).where(eq(modelBlock.userId, userId));
  return new Set(rows.map((r) => r.model));
}

/** The profile's model options, narrowed to what this employee is allowed to use. */
export async function allowedModelOptions(profile: string, userId: string) {
  const [options, blocked] = await Promise.all([modelOptions(profile), blockedModels(userId)]);
  const ok = (provider: string, id: string) => !blocked.has(`${provider}::${id}`);
  return {
    ...options,
    models: options.models.filter((m) => ok(options.provider, m.id)),
    others: options.others
      .map((p) => ({ ...p, models: p.models.filter((m) => ok(p.provider, m.id)) }))
      .filter((p) => p.models.length),
    defaultAllowed: ok(options.provider, options.defaultModel),
  };
}

/** Claude Code models this employee is allowed to use (the caller checks they own the subscription). */
export async function allowedClaudeCodeModels(userId: string) {
  const [models, blocked] = await Promise.all([claudeCodeModels(), blockedModels(userId)]);
  return models.filter((m) => !blocked.has(`${CLAUDE_CODE_PROVIDER}::${m.id}`));
}

/** Codex models this employee is allowed to use (the caller checks they own the subscription). */
export async function allowedCodexModels(userId: string) {
  const [models, blocked] = await Promise.all([codexModels(), blockedModels(userId)]);
  return models.filter((m) => !blocked.has(`${CODEX_PROVIDER}::${m.id}`));
}

/**
 * Model to use for a Hermes turn requested by this employee: the thread's choice (or the profile's default model)
 * if allowed, otherwise the first allowed model, the profile's provider first. `undefined`: no model allowed.
 */
export async function resolveHermesModel(profile: string, userId: string | null, chosen: string | null): Promise<string | null | undefined> {
  if (!userId) return chosen;
  const blocked = await blockedModels(userId);
  if (!blocked.size) return chosen;
  const options: ModelOptions = await modelOptions(profile);
  if (chosen ? !blocked.has(chosen) : !blocked.has(`${options.provider}::${options.defaultModel}`)) return chosen;
  const candidates = [{ provider: options.provider, models: options.models }, ...options.others].flatMap((p) =>
    p.models.map((m) => `${p.provider}::${m.id}`),
  );
  return candidates.find((m) => !blocked.has(m));
}
