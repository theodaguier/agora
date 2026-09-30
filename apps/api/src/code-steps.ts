import { isAbsolute, relative } from "node:path";
import type { CodeLimit, CodePermissionMode, CodeStep, CodeTodo } from "@agora/core";

/**
 * Reads Claude Code's `stream-json` output (with --include-partial-messages)
 * and turns it into the steps members watch: what it writes, each tool call
 * with its detail and its result, subagents' steps under their Task call,
 * its task list, its permission mode.
 * Pure: no process, no database (code-sessions.ts drives it).
 */

/** Kept per step: enough to follow a diff or a test run, bounded so a session stays small. */
export const DETAIL_MAX = 6_000;

export type TranscriptChange = {
  /** Steps created or modified by this event. */
  steps: CodeStep[];
  /** One-line summary of what it is doing (null: nothing in progress). */
  activity?: string | null;
  limit?: CodeLimit | null;
  /** Claude Code's session id and model, from its init event, and the skills among its slash commands. */
  init?: { sessionId: string; model: string | null; skills?: string[] };
  /** Its task list changed. */
  todos?: CodeTodo[];
  /** Its permission mode changed (the owner's switch, a plan approved, or its own EnterPlanMode). */
  mode?: CodePermissionMode;
  /** End of a run: its final answer, and the event itself (tokens, cost, duration). */
  result?: { text: string; isError: boolean; subtype: string; event: Json };
};

type Json = Record<string, any>;

export class Transcript {
  readonly steps: CodeStep[] = [];
  private byId = new Map<string, CodeStep>();
  /** Per message: its streamed text steps, in order, and how many the full message already confirmed. */
  private texts = new Map<string, { ids: string[]; confirmed: number }>();
  /** Current streamed message per stream (main agent: ""). */
  private streaming = new Map<string, string>();
  /** Task list calls, applied once their result says they worked. */
  private todoCalls = new Map<string, { name: string; input: Json }>();

  constructor(
    private cwd: string,
    steps: CodeStep[] = [],
    public todos: CodeTodo[] = [],
  ) {
    for (const s of steps) this.add(s);
  }

  get(id: string) {
    return this.byId.get(id);
  }

  /** A step the session adds itself (instruction sent, notice). */
  add(step: CodeStep) {
    const existing = this.byId.get(step.id);
    if (existing) Object.assign(existing, step);
    else {
      this.steps.push(step);
      this.byId.set(step.id, step);
    }
    return this.byId.get(step.id)!;
  }

  /** Marks a tool call refused by the owner (its result then only says it was rejected). */
  deny(toolUseId: string) {
    const step = this.byId.get(toolUseId);
    if (step?.kind === "tool") step.status = "denied";
    return step;
  }

  /** Tool calls still marked running when the process ends: interrupted. */
  settle(): CodeStep[] {
    const changed: CodeStep[] = [];
    for (const s of this.steps) {
      if (s.kind === "tool" && s.status === "running") {
        s.status = "error";
        changed.push(s);
      }
    }
    return changed;
  }

  apply(ev: Json): TranscriptChange {
    switch (ev?.type) {
      case "stream_event":
        return { steps: this.streamEvent(ev.event ?? {}, ev.parent_tool_use_id ?? undefined) };
      case "assistant":
        return { steps: this.assistant(ev.message ?? {}, ev.parent_tool_use_id ?? undefined) };
      case "user": {
        const before = this.todos;
        const steps = this.toolResults(ev.message?.content, ev.tool_use_result);
        return { steps, ...(this.todos !== before && { todos: this.todos }) };
      }
      case "system":
        if (ev.subtype === "init") {
          const skills = Array.isArray(ev.skills) ? ev.skills.map(String) : undefined;
          return {
            steps: [],
            init: { sessionId: String(ev.session_id ?? ""), model: ev.model ? String(ev.model) : null, ...(skills && { skills }) },
            ...(isMode(ev.permissionMode) && { mode: ev.permissionMode }),
          };
        }
        if (ev.subtype === "status" && isMode(ev.permissionMode)) return { steps: [], mode: ev.permissionMode };
        if (ev.subtype === "task_summary") return { steps: [], activity: typeof ev.detail === "string" && ev.detail.trim() ? ev.detail.trim() : null };
        // The Anthropic API is slow or refusing (overload, rate limit): said, rather than "working" in silence.
        if (ev.subtype === "api_retry") {
          const error = typeof ev.error === "string" ? ev.error : ev.error?.type ? String(ev.error.type) : "";
          return { steps: [], activity: `Anthropic API: retry ${ev.attempt ?? "?"}/${ev.max_retries ?? "?"}${error ? ` (${error})` : ""}` };
        }
        return { steps: [] };
      case "rate_limit_event":
        return { steps: [], limit: rateLimit(ev.rate_limit_info) };
      case "result":
        return {
          steps: [],
          activity: null,
          result: { text: typeof ev.result === "string" ? ev.result : "", isError: !!ev.is_error, subtype: String(ev.subtype ?? ""), event: ev },
        };
      default:
        return { steps: [] };
    }
  }

  private streamEvent(e: Json, parentId?: string): CodeStep[] {
    const stream = parentId ?? "";
    if (e.type === "message_start") {
      this.streaming.set(stream, String(e.message?.id ?? crypto.randomUUID()));
      return [];
    }
    const messageId = this.streaming.get(stream);
    if (!messageId) return [];
    if (e.type === "content_block_start" && e.content_block?.type === "text") {
      const entry = this.textsOf(messageId);
      const id = `${messageId}:${entry.ids.length}`;
      entry.ids.push(id);
      return [this.add({ id, kind: "text", text: String(e.content_block.text ?? ""), ...(parentId && { parentId }) })];
    }
    if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) {
      const entry = this.texts.get(messageId);
      const step = entry && this.byId.get(entry.ids.at(-1)!);
      if (step?.kind !== "text") return [];
      step.text += String(e.delta.text);
      return [step];
    }
    if (e.type === "content_block_start" && e.content_block?.type === "tool_use" && e.content_block.id) {
      const id = String(e.content_block.id);
      if (this.byId.has(id)) return [];
      const name = String(e.content_block.name ?? "tool");
      return [this.add({ id, kind: "tool", name, title: name, status: "running", ...(parentId && { parentId }) })];
    }
    return [];
  }

  private textsOf(messageId: string) {
    let entry = this.texts.get(messageId);
    if (!entry) this.texts.set(messageId, (entry = { ids: [], confirmed: 0 }));
    return entry;
  }

  /** A complete message (one per content block): confirms the streamed text, fills in tool calls. */
  private assistant(message: Json, parentId?: string): CodeStep[] {
    const messageId = String(message.id ?? crypto.randomUUID());
    const changed: CodeStep[] = [];
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block?.type === "text" && typeof block.text === "string") {
        if (!block.text.trim()) continue;
        const entry = this.textsOf(messageId);
        // Streamed already: the full text replaces what the deltas built. Otherwise (subagents), a new step.
        let id = entry.ids[entry.confirmed];
        if (!id) entry.ids.push((id = `${messageId}:${entry.ids.length}`));
        entry.confirmed++;
        changed.push(this.add({ id, kind: "text", text: block.text, ...(parentId && { parentId }) }));
      } else if (block?.type === "tool_use" && block.id) {
        const id = String(block.id);
        const name = String(block.name ?? "tool");
        const described = describeTool(name, block.input ?? {}, this.cwd);
        const previous = this.byId.get(id);
        const status = previous?.kind === "tool" ? previous.status : "running";
        if (TODO_TOOLS.has(name)) this.todoCalls.set(id, { name, input: block.input ?? {} });
        changed.push(this.add({ id, kind: "tool", name, ...described, status, ...(parentId && { parentId }) }));
      }
    }
    return changed;
  }

  /** `structured`: the event's tool_use_result, what the tool returned as data (the id of a task created). */
  private toolResults(content: unknown, structured?: Json): CodeStep[] {
    if (!Array.isArray(content)) return [];
    const changed: CodeStep[] = [];
    for (const block of content) {
      if (block?.type !== "tool_result" || !block.tool_use_id) continue;
      const id = String(block.tool_use_id);
      const text = resultText(block.content);
      const call = this.todoCalls.get(id);
      if (call) {
        this.todoCalls.delete(id);
        if (!block.is_error) this.applyTodos(call.name, call.input, text, structured);
      }
      const step = this.byId.get(id);
      if (step?.kind !== "tool") continue;
      const output = clip(text);
      if (output) step.output = output;
      if (step.status !== "denied") step.status = block.is_error ? "error" : "done";
      changed.push(step);
    }
    return changed;
  }

  /** The task list after one of its calls: a new array whenever it changes. */
  private applyTodos(name: string, input: Json, result: string, structured?: Json) {
    if (name === "TodoWrite") {
      const todos: Json[] = Array.isArray(input.todos) ? input.todos : [];
      this.todos = todos.map((t, i) => ({
        id: String(t.id ?? i + 1),
        content: String(t.content ?? ""),
        ...(t.activeForm && { activeForm: String(t.activeForm) }),
        status: todoStatus(t.status),
      }));
    } else if (name === "TaskCreate") {
      const id = structured?.task?.id ?? /Task #(\S+) created/.exec(result)?.[1];
      if (!id) return;
      // A new list once the previous one is done, as Claude Code clears it.
      const kept = this.todos.every((t) => t.status === "completed") ? [] : this.todos;
      const todo: CodeTodo = { id: String(id), content: String(input.subject ?? ""), status: "pending", ...(input.activeForm && { activeForm: String(input.activeForm) }) };
      this.todos = [...kept.filter((t) => t.id !== todo.id), todo];
    } else if (name === "TaskUpdate") {
      const id = String(input.taskId ?? "");
      if (!this.todos.some((t) => t.id === id)) return;
      if (input.status === "deleted") {
        this.todos = this.todos.filter((t) => t.id !== id);
        return;
      }
      this.todos = this.todos.map((t) =>
        t.id !== id
          ? t
          : {
              ...t,
              ...(input.subject && { content: String(input.subject) }),
              ...(input.activeForm && { activeForm: String(input.activeForm) }),
              ...(input.status && { status: todoStatus(input.status) }),
            },
      );
    }
  }
}

const TODO_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate"]);

const todoStatus = (s: unknown): CodeTodo["status"] => (s === "completed" || s === "in_progress" ? s : "pending");

const MODES = new Set(["default", "acceptEdits", "plan", "bypassPermissions"]);
export const isMode = (m: unknown): m is CodePermissionMode => typeof m === "string" && MODES.has(m);

export const clip = (text: string, max = DETAIL_MAX) => (text.length > max ? `${text.slice(0, max)}\n…` : text);

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c?.type === "text" ? String(c.text ?? "") : c?.type === "image" ? "[image]" : ""))
    .filter(Boolean)
    .join("\n");
}

const firstLine = (text: string, max = 160) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

/** Paths inside the session's directory, relative to it. */
function shortPath(path: unknown, cwd: string) {
  const p = String(path ?? "");
  if (!p || !isAbsolute(p)) return p;
  const rel = relative(cwd, p);
  return rel && !rel.startsWith("..") ? rel : p;
}

function diff(oldText: unknown, newText: unknown) {
  const lines = (t: unknown, sign: string) =>
    String(t ?? "")
      .split("\n")
      .map((l) => `${sign} ${l}`);
  return [...lines(oldText, "-"), ...lines(newText, "+")].join("\n");
}

const TODO_MARK: Record<string, string> = { completed: "[x]", in_progress: "[~]", pending: "[ ]" };

/** The one-line title and the detail of a tool call, from its input. */
export function describeTool(name: string, input: Json, cwd: string): { title: string; input?: string } {
  const detail = (text: string) => (text ? clip(text) : undefined);
  switch (name) {
    case "Bash":
      return { title: firstLine(String(input.description || input.command || name)), input: detail(`$ ${String(input.command ?? "")}`) };
    case "Read":
      return { title: shortPath(input.file_path, cwd) || name };
    case "Write":
      return { title: shortPath(input.file_path, cwd) || name, input: detail(String(input.content ?? "")) };
    case "Edit":
      return { title: shortPath(input.file_path, cwd) || name, input: detail(diff(input.old_string, input.new_string)) };
    case "MultiEdit":
      return {
        title: shortPath(input.file_path, cwd) || name,
        input: detail((Array.isArray(input.edits) ? input.edits : []).map((e: Json) => diff(e.old_string, e.new_string)).join("\n…\n")),
      };
    case "NotebookEdit":
      return { title: shortPath(input.notebook_path, cwd) || name, input: detail(String(input.new_source ?? "")) };
    case "Glob":
    case "Grep":
      return { title: [input.pattern, input.path && shortPath(input.path, cwd), input.glob].filter(Boolean).join("  ") || name };
    case "WebFetch":
      return { title: String(input.url ?? name), input: detail(String(input.prompt ?? "")) };
    case "WebSearch":
      return { title: String(input.query ?? name) };
    case "Task":
    case "Agent":
      return { title: firstLine(String(input.description || input.subagent_type || name)), input: detail(String(input.prompt ?? "")) };
    case "Skill":
      return { title: `/${String(input.skill ?? input.command ?? name)}${input.args ? ` ${firstLine(String(input.args), 120)}` : ""}` };
    case "TaskCreate":
      return { title: firstLine(String(input.subject || name)), input: detail(String(input.description ?? "")) };
    case "TaskUpdate":
      return { title: [`#${String(input.taskId ?? "?")}`, input.status, input.subject && firstLine(String(input.subject))].filter(Boolean).join(" · ") };
    case "TaskGet":
      return { title: `#${String(input.taskId ?? "?")}` };
    case "ToolSearch":
      return { title: String(input.query ?? name) };
    case "AskUserQuestion": {
      const questions: Json[] = Array.isArray(input.questions) ? input.questions : [];
      return {
        title: firstLine(String(questions[0]?.question ?? name)),
        input: detail(
          questions
            .map((q) => [String(q.question ?? ""), ...(Array.isArray(q.options) ? q.options : []).map((o: Json) => `- ${o.label}${o.description ? ` — ${o.description}` : ""}`)].join("\n"))
            .join("\n\n"),
        ),
      };
    }
    case "ExitPlanMode": {
      const plan = String(input.plan ?? "");
      return { title: firstLine(planTitle(plan) || name), input: detail(plan) };
    }
    case "TodoWrite": {
      const todos: Json[] = Array.isArray(input.todos) ? input.todos : [];
      const current = todos.find((t) => t.status === "in_progress");
      return {
        title: firstLine(String(current?.activeForm || current?.content || name)),
        input: detail(todos.map((t) => `${TODO_MARK[t.status] ?? "[ ]"} ${t.content}`).join("\n")),
      };
    }
    default: {
      const json = Object.keys(input).length ? JSON.stringify(input, null, 2) : "";
      return { title: name, input: detail(json) };
    }
  }
}

/** Section names Claude Code's plans are made of: not what the plan is about. */
const PLAN_SECTIONS = /^(context|contexte|plan|overview|summary|résumé|goal|objectif|approach|approche|steps|étapes|verification|vérification)$/i;

/** A plan's title: its first heading naming what it does, not one of its usual sections. */
export function planTitle(plan: string) {
  for (const m of plan.matchAll(/^#+\s+(.+?)\s*#*$/gm)) if (!PLAN_SECTIONS.test(m[1]!)) return m[1]!;
  return null;
}

function rateLimit(info: Json | undefined): CodeLimit | null {
  if (!info) return null;
  const status = info.status === "rejected" ? "rejected" : info.status === "allowed_warning" ? "warning" : null;
  if (!status) return null;
  const window = String(info.rateLimitType ?? "");
  const resetsAt = typeof info.resetsAt === "number" ? new Date(info.resetsAt * 1000).toISOString() : undefined;
  return { status, window, ...(typeof info.utilization === "number" && { utilization: info.utilization }), ...(resetsAt && { resetsAt }) };
}
