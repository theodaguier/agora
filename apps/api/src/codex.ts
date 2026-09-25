import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { activeCodexAccountId, codexEnv } from "./codex-accounts";
import { codexAppServer } from "./codex-app-server";
import { env } from "./env";
import type { HermesEvent, ModelInfo } from "./hermes";
import { readLines } from "./lines";
import type { EngineUsage } from "./usage";

/**
 * Codex engine: the official `codex exec` binary, on its owner's ChatGPT subscription: the machine's
 * login or one of the accounts added in Settings › Models (codex-accounts.ts).
 *
 * Like Claude Code, it is only offered to its owner, and only turns they start use it. The bot answers
 * in a read-only sandbox without a shell: web search only, none of the owner's own Codex config.
 */
export const CODEX_PROVIDER = "codex";
export const CODEX_LABEL = "Codex (abonnement personnel)";

const owner = () => (env.CODEX_OWNER_EMAIL || env.CLAUDE_CODE_OWNER_EMAIL).trim().toLowerCase();

/** Same rule as Claude Code: offered to its owner everywhere, used only for the turns they start. */
export function canUseCodex(user: { email: string } | null | undefined) {
  return !!owner() && user?.email.toLowerCase() === owner();
}

export const isCodexModel = (model: string | null | undefined) => !!model?.startsWith(`${CODEX_PROVIDER}::`);

const MODELS_TTL = 10 * 60_000;
/** Per account (the plan decides the models), "" for the machine's login. */
const modelsCache = new Map<string, { at: number; models: Promise<ModelInfo[]> }>();
const lastModels = new Map<string, ModelInfo[]>();

type ListedModel = { id: string; displayName?: string; description?: string; hidden?: boolean; supportedReasoningEfforts?: unknown[] };

/** The models Codex offers the active account (`model/list` of its app server), cached a few minutes. */
export async function codexModels(): Promise<ModelInfo[]> {
  const account = (await activeCodexAccountId()) ?? "";
  const cached = modelsCache.get(account);
  if (cached && Date.now() - cached.at <= MODELS_TTL) return cached.models;
  const models = (async () => {
    const childEnv = await codexEnv();
    const list: ListedModel[] = [];
    let cursor: string | null = null;
    do {
      const [page]: [{ data?: ListedModel[]; nextCursor?: string | null }] = await codexAppServer(childEnv, [{ method: "model/list", params: cursor ? { cursor } : {} }]);
      list.push(...(page.data ?? []));
      cursor = page.nextCursor ?? null;
    } while (cursor);
    return list
      .filter((m) => !m.hidden)
      .map((m) => ({ id: m.id, reasoning: !!m.supportedReasoningEfforts?.length, label: m.displayName ?? m.id, description: m.description }));
  })().then(
    (list) => (lastModels.set(account, list), list),
    (err) => {
      // Failure: no cache, retry on the next call; meanwhile the last known list, if any.
      modelsCache.delete(account);
      const last = lastModels.get(account);
      if (last) {
        console.error("codex: models refresh failed, serving the last list", err);
        return last;
      }
      throw err;
    },
  );
  modelsCache.set(account, { at: Date.now(), models });
  return models;
}

async function workspace() {
  const cwd = env.CODEX_CWD || join(homedir(), ".agora", "codex");
  await mkdir(cwd, { recursive: true });
  return cwd;
}

/* Codex names its threads itself: the one of each Agora session is remembered next to them, on disk. */
const threadsFile = () => join(homedir(), ".agora", "codex-threads.json");
let threads: Promise<Record<string, string>> | null = null;
const loadThreads = () => (threads ??= readFile(threadsFile(), "utf8").then((raw) => JSON.parse(raw) as Record<string, string>).catch((): Record<string, string> => ({})));
async function saveThread(sessionKey: string, threadId: string | null) {
  const map = await loadThreads();
  if (threadId) map[sessionKey] = threadId;
  else delete map[sessionKey];
  await writeFile(threadsFile(), JSON.stringify(map));
}

/**
 * Codex tools the bot doesn't get: running commands (its sandbox could still read the machine's
 * files), sub-agents, apps, the browser. `-c features.*` rather than `--disable`: an unknown name is
 * ignored instead of failing, whatever the Codex version.
 */
const DISABLED = ["shell_tool", "unified_exec", "code_mode_host", "multi_agent", "plugins", "apps", "browser_use", "computer_use", "image_generation", "hooks", "goals"];

function imageFile(dataUrl: string, dir: string, i: number) {
  const m = dataUrl.match(/^data:image\/([\w.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { path: join(dir, `image-${i}.${m[1]!.replace("jpeg", "jpg")}`), data: Buffer.from(m[2]!, "base64") };
}

export async function* codexChat(opts: {
  /** Agora session id (the same as for Hermes): one Codex thread per conversation. */
  sessionKey: string;
  text: string;
  images?: string[];
  model: string;
  system?: string;
  signal?: AbortSignal;
}): AsyncGenerator<HermesEvent> {
  const cwd = await workspace();
  const known = (await loadThreads())[opts.sessionKey];
  const run = runCodex({ ...opts, cwd, thread: known });
  let produced = false;
  try {
    for await (const ev of run) {
      produced = true;
      yield ev;
    }
  } catch (err) {
    // Its thread is gone (sessions deleted): a new one, once.
    if (!known || produced || opts.signal?.aborted) throw err;
    console.error("codex: resume failed, new thread", err);
    await saveThread(opts.sessionKey, null);
    yield* runCodex({ ...opts, cwd, thread: undefined });
  }
}

async function* runCodex(opts: {
  sessionKey: string;
  text: string;
  images?: string[];
  model: string;
  system?: string;
  signal?: AbortSignal;
  cwd: string;
  thread: string | undefined;
}): AsyncGenerator<HermesEvent> {
  const tmp = join(opts.cwd, ".images", crypto.randomUUID());
  const images = (opts.images ?? []).map((url, i) => imageFile(url, tmp, i)).filter((f) => !!f);
  if (images.length) {
    await mkdir(tmp, { recursive: true });
    await Promise.all(images.map((f) => writeFile(f.path, f.data)));
  }
  const args = [
    env.CODEX_BIN,
    "exec",
    ...(opts.thread ? ["resume", opts.thread] : []),
    "--json",
    "--skip-git-repo-check",
    // None of the owner's config.toml (MCP servers, profiles…): only what the app sets here.
    "--ignore-user-config",
    "--model", opts.model,
    "-c", 'sandbox_mode="read-only"',
    "-c", 'approval_policy="never"',
    "-c", 'web_search="live"',
    ...DISABLED.flatMap((f) => ["-c", `features.${f}=false`]),
    // A JSON string is a valid TOML string.
    ...(opts.system ? ["-c", `developer_instructions=${JSON.stringify(opts.system)}`] : []),
    ...images.flatMap((f) => ["--image", f.path]),
    "-",
  ];

  const proc = Bun.spawn(args, { cwd: opts.cwd, env: await codexEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const abort = () => proc.kill();
  opts.signal?.addEventListener("abort", abort, { once: true });
  proc.stdin.write(opts.text);
  proc.stdin.end();

  let failure: string | null = null;
  let lastError: string | null = null;
  let messages = 0;
  try {
    for await (const line of readLines(proc.stdout)) {
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "thread.started" && ev.thread_id && ev.thread_id !== opts.thread) {
        await saveThread(opts.sessionKey, ev.thread_id);
      } else if (ev.type === "item.started" && ev.item && TOOL_ITEMS.has(ev.item.type)) {
        yield { type: "tool", name: toolName(ev.item), status: "running" };
      } else if (ev.type === "item.completed" && ev.item?.type === "agent_message" && ev.item.text) {
        // Several messages in one turn read as paragraphs of one reply.
        yield { type: "delta", text: `${messages++ ? "\n\n" : ""}${ev.item.text}` };
      } else if (ev.type === "turn.completed" && ev.usage) {
        yield { type: "usage", usage: turnUsage(ev.usage, opts.model) };
      } else if (ev.type === "turn.failed") {
        failure = ev.error?.message ?? "turn failed";
      } else if (ev.type === "error" && ev.message) {
        // Mostly retries ("Reconnecting… 2/5"): only fatal if the turn fails.
        lastError = ev.message;
      }
    }
    const code = await proc.exited;
    if (opts.signal?.aborted) return;
    if (failure) throw new Error(`Codex: ${failure}`);
    if (code !== 0) throw new Error(`Codex (code ${code}): ${lastError ?? (await new Response(proc.stderr).text()).trim().split("\n").at(-1)?.slice(0, 500)}`);
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    if (proc.exitCode === null) proc.kill();
    if (images.length) await rm(tmp, { recursive: true, force: true });
  }
}

const TOOL_ITEMS = new Set(["web_search", "mcp_tool_call", "command_execution", "file_change"]);
const toolName = (item: { type: string; server?: string; tool?: string }) => (item.type === "mcp_tool_call" && item.tool ? `${item.server ?? "mcp"}.${item.tool}` : item.type);

type CodexUsage = { input_tokens?: number; cached_input_tokens?: number; cache_write_input_tokens?: number; output_tokens?: number };

/** `input_tokens` includes the cached ones. A subscription: no cost reported. */
function turnUsage(u: CodexUsage, model: string): EngineUsage[] {
  const cached = u.cached_input_tokens ?? 0;
  return [
    {
      model,
      inputTokens: Math.max(0, (u.input_tokens ?? 0) - cached),
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: u.cache_write_input_tokens ?? 0,
      costUsd: 0,
    },
  ];
}
