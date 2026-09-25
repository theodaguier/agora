import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env";
import type { HermesEvent, ModelInfo } from "./hermes";
import { anthropicModels, newestFirst, type CatalogModel } from "./model-catalog";
import type { EngineUsage } from "./usage";
import { activeClaudeAccountId, claudeCodeEnv } from "./claude-accounts";
import { readLines } from "./lines";

/**
 * Claude Code engine: the official `claude -p` binary, on its owner's Claude
 * subscription: the machine's login or one of the accounts added in
 * Settings › Models (claude-accounts.ts).
 *
 * A subscription is personal: the engine is only offered to its owner
 * (CLAUDE_CODE_OWNER_EMAIL), in their private conversations. Other
 * employees and groups stay on Hermes.
 */
export const CLAUDE_CODE_PROVIDER = "claude-code";
export const CLAUDE_CODE_LABEL = "Claude Code (abonnement personnel)";

const MODELS_TTL = 10 * 60_000;
/** Per account (the plan decides the models), "" for the machine's login. */
const modelsCache = new Map<string, { at: number; models: Promise<ModelInfo[]> }>();
/** Last list built per account: served when a refresh fails, so one bad spawn doesn't hide the section. */
const lastModels = new Map<string, ModelInfo[]>();
/** Claude Code aliases ("opus[1m]", "sonnet"…) and the model each one points to today. */
let aliases = new Map<string, string>();

/**
 * Claude models the subscription can use, by exact version: the ones Claude Code
 * offers in its `/model` menu (the `initialize` control request, the one the Agent
 * SDK uses), completed with the Anthropic models of the public models.dev registry,
 * which `--model` accepts too. Both lists are fetched, not written here. Cached for
 * a few minutes, for the active account.
 */
export async function claudeCodeModels(): Promise<ModelInfo[]> {
  const account = (await activeClaudeAccountId()) ?? "";
  const cached = modelsCache.get(account);
  if (cached && Date.now() - cached.at <= MODELS_TTL) return cached.models;
  const models = fetchModels().then(
    (list) => (lastModels.set(account, list), list),
    (err) => {
      // Failure: no cache, retry on the next call; meanwhile the last known list, if any.
      modelsCache.delete(account);
      const last = lastModels.get(account);
      if (last) {
        console.error("claude code: models refresh failed, serving the last list", err);
        return last;
      }
      throw err;
    },
  );
  modelsCache.set(account, { at: Date.now(), models });
  return models;
}

/** Exact model behind a Claude Code alias stored by an older thread ("opus[1m]" → "claude-opus-5-5[1m]"). */
export const resolveClaudeCodeModel = (id: string) => aliases.get(id) ?? id;

type MenuModel = { value: string; resolvedModel?: string; displayName?: string; description?: string; supportsAdaptiveThinking?: boolean };

const ONE_M = "[1m]";
const baseId = (id: string) => (id.endsWith(ONE_M) ? id.slice(0, -ONE_M.length) : id);

async function fetchModels(): Promise<ModelInfo[]> {
  const [menu, catalog] = await Promise.all([
    menuModels(),
    anthropicModels().catch((err) => (console.error("claude code: models.dev catalog", err), [] as CatalogModel[])),
  ]);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  // "default" is Claude Code's default choice, not a model.
  const offered = menu.filter((m) => m.value && m.value !== "default");
  aliases = new Map(offered.filter((m) => m.resolvedModel && m.resolvedModel !== m.value).map((m) => [m.value, m.resolvedModel!]));

  const models = new Map<string, ModelInfo & { released?: string }>();
  for (const m of offered) {
    const id = m.resolvedModel ?? m.value;
    const known = byId.get(baseId(id));
    models.set(id, {
      id,
      reasoning: !!m.supportsAdaptiveThinking,
      label: label(id, known?.name ?? m.displayName ?? id),
      description: m.description,
      released: known?.release_date,
    });
  }
  const bases = new Set([...models.keys()].map(baseId));
  for (const m of catalog) {
    // "(latest)" entries are undated aliases of a dated one listed too.
    if (bases.has(m.id) || /\(latest\)/i.test(m.name)) continue;
    models.set(m.id, { id: m.id, reasoning: !!m.reasoning, label: label(m.id, m.name), released: m.release_date });
  }
  return (await newestFirst([...models.values()], (m) => m.released)).map(({ released: _, ...m }) => m);
}

/** "Claude Opus 5.5" + "[1m]" → "Opus 5.5 · 1M". */
const label = (id: string, name: string) => `${name.replace(/^Claude\s+/i, "")}${id.endsWith(ONE_M) ? " · 1M" : ""}`;

/** The `/model` menu of the Claude Code signed in on this machine. */
async function menuModels(): Promise<MenuModel[]> {
  const cwd = await workspace();
  const proc = Bun.spawn(
    [env.CLAUDE_CODE_BIN, "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--setting-sources", "project", "--strict-mcp-config"],
    { cwd, env: await claudeCodeEnv(), stdin: "pipe", stdout: "pipe", stderr: "ignore" },
  );
  const timer = setTimeout(() => proc.kill(), 30_000);
  try {
    proc.stdin.write(`${JSON.stringify({ type: "control_request", request_id: "agora-models", request: { subtype: "initialize" } })}\n`);
    proc.stdin.flush();
    for await (const line of readLines(proc.stdout)) {
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type !== "control_response" || ev.response?.request_id !== "agora-models") continue;
      if (ev.response.subtype !== "success") throw new Error(`Claude Code: ${ev.response.error ?? "initialize refused"}`);
      return ev.response.response?.models ?? [];
    }
    throw new Error("Claude Code did not return the model list");
  } finally {
    clearTimeout(timer);
    proc.kill();
  }
}

async function workspace() {
  const cwd = env.CLAUDE_CODE_CWD || join(homedir(), ".agora", "claude-code");
  await mkdir(cwd, { recursive: true });
  return cwd;
}

/**
 * Claude Code runs on the host's `claude` login, the owner's own subscription: offered to the owner in
 * every conversation (direct or group), and only turns the owner starts use it — anyone else's turn in a
 * group goes to the bot's Hermes model, so the subscription is never used on someone else's behalf.
 */
export function canUseClaudeCode(user: { email: string } | null | undefined) {
  const owner = env.CLAUDE_CODE_OWNER_EMAIL.trim().toLowerCase();
  return !!owner && user?.email.toLowerCase() === owner;
}

export const isClaudeCodeModel = (model: string | null | undefined) => !!model?.startsWith(`${CLAUDE_CODE_PROVIDER}::`);

/** Claude Code requires a session UUID: derived deterministically from the Agora session id. */
function sessionUuid(key: string) {
  const h = createHash("sha256").update(`agora-claude-code:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** An existing session is resumed (--resume); otherwise it is created under this id (--session-id). */
async function sessionExists(id: string) {
  const projects = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  for await (const _ of new Bun.Glob(`*/${id}.jsonl`).scan({ cwd: projects, onlyFiles: true })) return true;
  return false;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function imageBlock(dataUrl: string): ContentBlock | null {
  const m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  return m ? { type: "image", source: { type: "base64", media_type: m[1]!, data: m[2]! } } : null;
}

export async function* claudeCodeChat(opts: {
  /** Agora session id (the same as for Hermes): one Claude Code session per conversation. */
  sessionKey: string;
  text: string;
  images?: string[];
  model: string;
  system?: string;
  /** Directories the agent may read in addition to its workspace (attachments). */
  readDirs?: string[];
  signal?: AbortSignal;
}): AsyncGenerator<HermesEvent> {
  const cwd = await workspace();
  const sessionId = sessionUuid(opts.sessionKey);
  const allowed = env.CLAUDE_CODE_ALLOWED_TOOLS.split(/[\s,]+/).filter(Boolean);
  const args = [
    env.CLAUDE_CODE_BIN,
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model", opts.model,
    // None of the owner's hooks, CLAUDE.md or personal MCP servers: only what the app provides.
    "--setting-sources", "project",
    "--strict-mcp-config",
    ...((await sessionExists(sessionId)) ? ["--resume", sessionId] : ["--session-id", sessionId]),
    ...(opts.system ? ["--append-system-prompt", opts.system] : []),
    ...(allowed.length ? ["--allowedTools", ...allowed] : []),
    ...[...new Set(opts.readDirs ?? [])].flatMap((d) => ["--add-dir", d]),
  ];

  const proc = Bun.spawn(args, { cwd, env: await claudeCodeEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const abort = () => proc.kill();
  opts.signal?.addEventListener("abort", abort, { once: true });

  const content: ContentBlock[] = [
    { type: "text", text: opts.text },
    ...(opts.images ?? []).map(imageBlock).filter((b): b is ContentBlock => !!b),
  ];
  proc.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`);
  proc.stdin.end();

  let result: ClaudeResult | null = null;
  try {
    for await (const line of readLines(proc.stdout)) {
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "stream_event") {
        const e = ev.event;
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
          yield { type: "delta", text: e.delta.text };
        } else if (e?.type === "content_block_start" && e.content_block?.type === "tool_use") {
          yield { type: "tool", name: String(e.content_block.name ?? "outil"), status: "running" };
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    }
    const code = await proc.exited;
    // Even when interrupted: tokens spent until then were billed.
    if (result) yield { type: "usage", usage: resultUsage(result, opts.model) };
    if (opts.signal?.aborted) return;
    if (result?.is_error) throw new Error(`Claude Code: ${result.result ?? "error"}`);
    if (code !== 0) throw new Error(`Claude Code (code ${code}): ${(await new Response(proc.stderr).text()).slice(0, 500)}`);
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    if (proc.exitCode === null) proc.kill();
  }
}

type ClaudeResult = {
  is_error?: boolean;
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  total_cost_usd?: number;
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; costUSD?: number }>;
};

/** Per-model usage from the `result` event (the main model plus any helper model Claude Code called). */
function resultUsage(result: ClaudeResult, model: string): EngineUsage[] {
  const perModel = Object.entries(result.modelUsage ?? {});
  if (perModel.length) {
    return perModel.map(([id, u]) => ({
      model: id,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadTokens: u.cacheReadInputTokens ?? 0,
      cacheWriteTokens: u.cacheCreationInputTokens ?? 0,
      costUsd: u.costUSD ?? 0,
    }));
  }
  const u = result.usage ?? {};
  return [
    {
      model,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      costUsd: result.total_cost_usd ?? 0,
    },
  ];
}
