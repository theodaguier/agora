import { CODE_ENGINE_NAMES, CODE_ENGINES, type CodeAccount, type CodeEngine, type CodeEngineInfo, type CodePermissionMode, type CodeStep, type CodeTodo } from "@agora/core";
import { canUseClaudeCode } from "./claude-code";
import { canUseCodex, codexModels, turnUsage, type CodexUsage } from "./codex";
import { activeCodexAccountId, codexEnv, listCodexAccounts } from "./codex-accounts";
import { clip, describeTool, type Transcript } from "./code-steps";
import { env } from "./env";
import { childEnv } from "./harden";
import { cliEnv, cliPath } from "./host";
import type { EngineUsage } from "./usage";

/**
 * The engines a code session can run on besides Claude Code: agent CLIs driven headless, one
 * process per instruction, resumed by the thread id they print (code-sessions.ts drives them).
 *
 * Unlike Claude Code they have no control protocol: nothing is asked during a run (they act on
 * their own, or only read and plan), a message written during a run waits for the next one, and a
 * stop kills the process.
 *
 * Each one's JSONL output becomes the same steps as Claude Code's: what it writes, its commands and
 * edits with their result, its task list.
 */

type Json = Record<string, any>;

/** What a line of the engine's output changed. */
export type EngineChange = {
  steps: CodeStep[];
  /** Its own id for the conversation, to resume it at the next instruction. */
  thread?: string;
  model?: string;
  activity?: string | null;
  todos?: CodeTodo[];
  usage?: EngineUsage[];
  /** End of the run: its answer (`error`: the run failed on it). */
  result?: { text: string; isError: boolean; durationMs?: number };
  /** A transient error (a retry): only reported if the run ends without an answer. */
  warning?: string;
};

export type HeadlessRun = {
  args: string[];
  env: Record<string, string>;
  /** Written to its stdin, then closed (null: the prompt is in the arguments). */
  stdin: string | null;
};

export type HeadlessEngine = {
  id: Exclude<CodeEngine, "claude">;
  command(o: { bin: string; cwd: string; prompt: string; model: string | null; mode: CodePermissionMode; thread: string | null; system: string }): Promise<HeadlessRun>;
  /** Reads one run's output, adding its steps to the session's transcript. */
  reader(t: Transcript, cwd: string, model: string | null): (ev: Json) => EngineChange;
  account(): Promise<CodeAccount | null>;
};

/* ---------- who may use which ---------- */

const ownerOf = (email: string) => email.trim().toLowerCase();

/** Same rule as Claude Code and Codex: its subscription is its owner's, used only for what they start. */
export function canUseCursor(user: { email: string } | null | undefined) {
  const owner = ownerOf(env.CURSOR_OWNER_EMAIL || env.CLAUDE_CODE_OWNER_EMAIL);
  return !!owner && user?.email.toLowerCase() === owner;
}

export function canUseEngine(user: { email: string } | null | undefined, engine: CodeEngine) {
  return engine === "claude" ? canUseClaudeCode(user) : engine === "codex" ? canUseCodex(user) : canUseCursor(user);
}

/** Starting or driving sessions at all: the owner of one of the engines. */
export const canUseCodeSessions = (user: { email: string } | null | undefined) => CODE_ENGINES.some((e) => canUseEngine(user, e));

/** The engine's binary on this machine. */
export const engineBin = (engine: CodeEngine) => cliPath(engine);

/** The engines this person can start a session on: theirs, and installed here. */
export function availableEngines(user: { email: string } | null | undefined): CodeEngineInfo[] {
  return CODE_ENGINES.filter((e) => canUseEngine(user, e) && engineBin(e)).map((id) => ({ id, name: CODE_ENGINE_NAMES[id] }));
}

export const isEngine = (value: unknown): value is CodeEngine => CODE_ENGINES.includes(value as CodeEngine);

/* ---------- models ---------- */

const CURSOR_MODELS_TTL = 10 * 60_000;
let cursorModelsCache: { at: number; models: Promise<{ id: string; label: string }[]> } | null = null;

/** `agent models`: one `id - Name` line per model of the account (the current one marked). */
function cursorModels(): Promise<{ id: string; label: string }[]> {
  if (cursorModelsCache && Date.now() - cursorModelsCache.at < CURSOR_MODELS_TTL) return cursorModelsCache.models;
  const bin = engineBin("cursor");
  const models = (async () => {
    if (!bin) return [];
    const proc = Bun.spawn([bin, "models"], { env: cliEnv(bin, childEnv({ NO_COLOR: "1" })), stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 30_000 });
    const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const list: { id: string; label: string }[] = [];
    for (const line of out.replace(/\x1b\[[0-9;]*m/g, "").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9][\w.:[\]-]*)\s+-\s+(.+?)\s*(?:\((?:current|default)[^)]*\))?\s*$/i);
      if (m) list.push({ id: m[1]!, label: m[2]! });
    }
    return list;
  })().catch((err) => {
    console.error("code engines: cursor models", err);
    cursorModelsCache = null;
    return [];
  });
  cursorModelsCache = { at: Date.now(), models };
  return models;
}

/** The models a session on this engine can be given; empty: none listed, the engine picks. */
export async function engineModels(engine: Exclude<CodeEngine, "claude">): Promise<{ id: string; label: string }[]> {
  if (engine === "codex") return (await codexModels()).map((m) => ({ id: m.id, label: m.label ?? m.id }));
  return cursorModels();
}

/* ---------- Codex ---------- */

/** `/bin/zsh -lc "npm test"` → `npm test`: the command as it was written. */
const unwrapShell = (command: string) => {
  const m = command.match(/^\S*\/(?:ba|z)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/) ?? command.match(/^\S*\/(?:ba|z)?sh\s+-l?c\s+(\S+)$/);
  return m ? (m[2] ?? m[1]!).replace(/\\"/g, '"') : command;
};

const PLAN_NOTE =
  "Mode plan : tu ne modifies aucun fichier et ne lances rien qui change l'état du projet. Lis ce qu'il faut, puis réponds avec un plan détaillé que le propriétaire validera avant que tu agisses.";

const codex: HeadlessEngine = {
  id: "codex",
  async command({ bin, prompt, model, mode, thread, system }) {
    const plan = mode === "plan";
    const instructions = [system, plan && PLAN_NOTE].filter(Boolean).join("\n\n");
    return {
      args: [
        bin,
        "exec",
        ...(thread ? ["resume", thread] : []),
        "--json",
        "--skip-git-repo-check",
        // None of the owner's config.toml (MCP servers, profiles, hooks): the project's AGENTS.md still applies.
        "--ignore-user-config",
        // As Claude Code's sessions: it acts on its own (git, network, installs), or only reads in plan mode.
        ...(plan ? ["-c", 'sandbox_mode="read-only"', "-c", 'approval_policy="never"'] : ["--dangerously-bypass-approvals-and-sandbox"]),
        ...(model ? ["--model", model] : []),
        // A JSON string is a valid TOML string.
        ...(instructions ? ["-c", `developer_instructions=${JSON.stringify(instructions)}`] : []),
        "-",
      ],
      env: cliEnv(bin, await codexEnv()),
      stdin: prompt,
    };
  },
  reader(t, cwd, model) {
    // Item ids restart at item_0 with every run.
    const run = crypto.randomUUID().slice(0, 8);
    const id = (item: Json) => `codex-${run}-${String(item.id ?? crypto.randomUUID())}`;
    return (ev) => {
      const item: Json = ev.item ?? {};
      const done = ev.type === "item.completed";
      if (ev.type === "thread.started" && ev.thread_id) return { steps: [], thread: String(ev.thread_id) };
      if (ev.type === "turn.started") return { steps: [], activity: null };
      if (ev.type === "turn.completed") return { steps: [], ...(ev.usage && { usage: turnUsage(ev.usage as CodexUsage, model ?? "codex") }) };
      if (ev.type === "turn.failed") return { steps: [], result: { text: String(ev.error?.message ?? "turn failed"), isError: true } };
      if (ev.type === "error") return { steps: [], warning: String(ev.message ?? "") };
      if (ev.type !== "item.started" && ev.type !== "item.updated" && !done) return { steps: [] };
      switch (item.type) {
        case "agent_message":
          return done && item.text ? { steps: [t.add({ id: id(item), kind: "text", text: String(item.text) })] } : { steps: [] };
        case "reasoning":
          return { steps: [], activity: item.text ? String(item.text).replace(/\*\*/g, "").split("\n")[0]!.slice(0, 200) : undefined };
        case "command_execution": {
          const command = unwrapShell(String(item.command ?? ""));
          const failed = done && (item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0));
          const output = String(item.aggregated_output ?? "");
          return {
            steps: [
              t.add({
                id: id(item),
                kind: "tool",
                name: "Bash",
                ...describeTool("Bash", { command }, cwd),
                ...(done && { output: clip(output || (typeof item.exit_code === "number" ? `exit code ${item.exit_code}` : "")) }),
                status: !done ? "running" : failed ? "error" : "done",
              }),
            ],
            activity: done ? undefined : command.split("\n")[0]!.slice(0, 200),
          };
        }
        case "file_change": {
          const changes: Json[] = Array.isArray(item.changes) ? item.changes : [];
          const paths = changes.map((c) => describeTool("Read", { file_path: c.path }, cwd).title);
          return {
            steps: [
              t.add({
                id: id(item),
                kind: "tool",
                name: "Edit",
                title: paths.join(", ") || "Edit",
                input: clip(changes.map((c) => `${{ add: "+", delete: "-", update: "~" }[String(c.kind)] ?? "~"} ${c.path}`).join("\n")),
                status: !done ? "running" : item.status === "failed" ? "error" : "done",
              }),
            ],
          };
        }
        case "mcp_tool_call": {
          const name = `${item.server ?? "mcp"}.${item.tool ?? "tool"}`;
          const result = item.error?.message ?? item.result;
          return {
            steps: [
              t.add({
                id: id(item),
                kind: "tool",
                name,
                title: name,
                ...(item.arguments && { input: clip(JSON.stringify(item.arguments, null, 2)) }),
                ...(done && result !== undefined && { output: clip(typeof result === "string" ? result : JSON.stringify(result, null, 2)) }),
                status: !done ? "running" : item.status === "failed" || item.error ? "error" : "done",
              }),
            ],
          };
        }
        case "web_search":
          return { steps: [t.add({ id: id(item), kind: "tool", name: "WebSearch", ...describeTool("WebSearch", { query: item.query }, cwd), status: done ? "done" : "running" })] };
        case "todo_list": {
          const items: Json[] = Array.isArray(item.items) ? item.items : [];
          const current = items.findIndex((i) => !i.completed);
          const todos: CodeTodo[] = items.map((i, n) => ({ id: String(n), content: String(i.text ?? ""), status: i.completed ? "completed" : n === current ? "in_progress" : "pending" }));
          return { steps: [], todos };
        }
        default:
          return { steps: [] };
      }
    };
  },
  async account() {
    const [id, state] = await Promise.all([activeCodexAccountId(), listCodexAccounts().catch(() => null)]);
    const a = id ? state?.accounts.find((x) => x.id === id) : state?.machine;
    return { id, email: a?.email ?? null, plan: a?.plan ?? null };
  },
};

/* ---------- Cursor ---------- */

/** Cursor's tool kinds (`shellToolCall`…) under Claude Code's names, so they read the same. */
const CURSOR_TOOLS: Record<string, string> = {
  shell: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  delete: "Delete",
  grep: "Grep",
  glob: "Glob",
  ls: "LS",
  updateTodos: "TodoWrite",
  todo: "TodoWrite",
  webSearch: "WebSearch",
  webFetch: "WebFetch",
};

/** Cursor's arguments under Claude Code's names, for describeTool. */
function cursorInput(name: string, args: Json): Json {
  const path = args.path ?? args.filePath ?? args.targetFile;
  switch (name) {
    case "Bash":
      return { command: args.command ?? "" };
    case "Read":
    case "Delete":
    case "LS":
      return { file_path: path };
    case "Write":
      return { file_path: path, content: args.fileText ?? args.contents ?? "" };
    case "Edit":
      return { file_path: path, old_string: args.oldString ?? args.old_string ?? "", new_string: args.newString ?? args.new_string ?? args.streamContent ?? "" };
    case "Grep":
    case "Glob":
      return { pattern: args.pattern ?? args.globPattern ?? args.query, path: args.path ?? args.targetDirectory };
    case "TodoWrite":
      return { todos: (Array.isArray(args.todos) ? args.todos : []).map((t: Json) => ({ content: t.content, status: todoStatus(t.status) })) };
    default:
      return args;
  }
}

/** `TODO_STATUS_IN_PROGRESS`, `in_progress`, `completed`… */
const todoStatus = (status: unknown): CodeTodo["status"] => {
  const s = String(status ?? "").toLowerCase();
  return /complete|done/.test(s) ? "completed" : /progress/.test(s) ? "in_progress" : "pending";
};

/** What a finished call returned: its output, or its error. */
function cursorResult(result: Json | undefined): { output?: string; failed: boolean } {
  if (!result) return { failed: false };
  if (result.error || result.failure || result.rejected) {
    const e = result.error ?? result.failure ?? result.rejected;
    return { output: typeof e === "string" ? e : String(e?.errorMessage ?? e?.message ?? e?.reason ?? JSON.stringify(e)), failed: true };
  }
  const ok: Json = result.success ?? result;
  const text =
    [ok.stdout, ok.stderr].filter((x) => typeof x === "string" && x).join("\n") ||
    (typeof ok.content === "string" ? ok.content : "") ||
    (typeof ok.output === "string" ? ok.output : "");
  const failed = typeof ok.exitCode === "number" && ok.exitCode !== 0;
  return { output: text || (Object.keys(ok).length ? JSON.stringify(ok, null, 2) : undefined), failed };
}

const cursor: HeadlessEngine = {
  id: "cursor",
  async command({ bin, cwd, prompt, model, mode, thread, system }) {
    // No system prompt of its own: what Agora tells it opens the first instruction.
    const text = [!thread && system && `<agora>\n${system}\n</agora>`, prompt].filter(Boolean).join("\n\n");
    return {
      args: [
        bin,
        "-p",
        "--output-format", "stream-json",
        // Its workspace is the session's directory, trusted without the prompt a headless run cannot answer.
        "--workspace", cwd,
        "--trust",
        ...(mode === "plan" ? ["--mode", "plan"] : ["--force"]),
        ...(model ? ["--model", model] : []),
        ...(thread ? ["--resume", thread] : []),
        text,
      ],
      env: cliEnv(bin, childEnv({ NO_COLOR: "1" })),
      stdin: null,
    };
  },
  reader(t, cwd) {
    let text: CodeStep | null = null;
    const calls = new Map<string, string>();
    return (ev) => {
      if (ev.type === "system" && ev.subtype === "init") return { steps: [], ...(ev.session_id && { thread: String(ev.session_id) }), ...(ev.model && { model: String(ev.model) }) };
      if (ev.type === "assistant") {
        const chunk = (Array.isArray(ev.message?.content) ? ev.message.content : [])
          .filter((c: Json) => c?.type === "text")
          .map((c: Json) => String(c.text ?? ""))
          .join("");
        if (!chunk) return { steps: [] };
        // One message between two tool calls: its pieces go into one step.
        if (text?.kind === "text") return { steps: [t.add({ ...text, text: text.text + chunk })] };
        text = t.add({ id: crypto.randomUUID(), kind: "text", text: chunk });
        return { steps: [text] };
      }
      if (ev.type === "tool_call") {
        text = null;
        const call: Json = ev.tool_call ?? {};
        const [key, body] = (Object.entries(call)[0] ?? ["tool", {}]) as [string, Json];
        const kind = key.replace(/ToolCall$/, "");
        const name = key === "function" ? String(body?.name ?? "tool") : (CURSOR_TOOLS[kind] ?? kind);
        let args: Json = body?.args ?? {};
        if (key === "function" && typeof body?.arguments === "string") {
          try {
            args = JSON.parse(body.arguments);
          } catch {
            args = { arguments: body.arguments };
          }
        }
        const input = cursorInput(name, args);
        const id = calls.get(String(ev.call_id)) ?? `cursor-${String(ev.call_id ?? crypto.randomUUID())}`;
        calls.set(String(ev.call_id), id);
        const done = ev.subtype === "completed";
        const { output, failed } = done ? cursorResult(body?.result) : { output: undefined, failed: false };
        const step = t.add({
          id,
          kind: "tool",
          name,
          ...describeTool(name, input, cwd),
          ...(output && { output: clip(output) }),
          status: !done ? "running" : failed ? "error" : "done",
        });
        const todos = name === "TodoWrite" && Array.isArray(input.todos) ? input.todos.map((x: Json, n: number) => ({ id: String(n), content: String(x.content ?? ""), status: x.status })) : undefined;
        return { steps: [step], activity: done ? null : step.kind === "tool" ? step.title : null, ...(todos && { todos }) };
      }
      if (ev.type === "result") {
        return {
          steps: [],
          activity: null,
          ...(ev.session_id && { thread: String(ev.session_id) }),
          result: { text: typeof ev.result === "string" ? ev.result : "", isError: !!ev.is_error || ev.subtype === "error", durationMs: Number(ev.duration_ms) || undefined },
        };
      }
      return { steps: [] };
    };
  },
  // Its login (`agent login`) is the machine's: not read at every run.
  account: async () => null,
};

export const headlessEngine = (engine: Exclude<CodeEngine, "claude">): HeadlessEngine => (engine === "codex" ? codex : cursor);
