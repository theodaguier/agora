import { desc, eq, inArray } from "drizzle-orm";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { CodeApproval, CodeSession, CodeSessionDetail, CodeSessionStatus, CodeStep, CodeUsage } from "@agora/core";
import { claudeCodeEnv } from "./claude-accounts";
import { resultUsage, sessionExists, workspace, type ClaudeResult } from "./claude-code";
import { clip, Transcript } from "./code-steps";
import { db, schema } from "./db";
import { env } from "./env";
import { publishToConversation } from "./events";
import { readLines } from "./lines";
import { postEvent } from "./messages";
import { recordEngineUsage } from "./usage";

/**
 * Claude Code sessions: a `claude` agent working in a directory of the
 * server, started by a bot (the agora_code Hermes plugin) on behalf of the
 * owner of the subscription, in a conversation.
 *
 * Every step (what it writes, each tool call with its detail and result) is
 * streamed to the conversation's members as it happens. The owner can write
 * to it while it works (the message reaches it at its next tool call),
 * approve or deny the actions Claude Code asks about, and stop it.
 *
 * One `claude -p` process per run: it starts with an instruction and ends
 * with its answer; the next instruction resumes the same Claude Code session
 * (its id is the session's). Stdin stays open during the run for the owner's
 * messages and answers (stream-json control protocol, --permission-prompt-tool stdio).
 */

type Row = typeof schema.codeSession.$inferSelect;
type Permissions = Row["permissions"];
type Json = Record<string, any>;
type Instruction = { text: string; by: string | null };

type PendingApproval = CodeApproval & { requestId: string; toolUseId?: string; input: Json; suggestions: Json[] };

type Live = {
  row: Row;
  transcript: Transcript;
  /** A run is under way, from the spawn to the exit (the process may not be there yet). */
  running: boolean;
  proc: Subprocess<"pipe", "pipe", "pipe"> | null;
  /** Instructions not written yet (the process is starting). */
  outbox: Instruction[];
  /** Written, not yet taken into account by Claude Code (--replay-user-messages acknowledges each). */
  unread: Instruction[];
  approval: PendingApproval | null;
  activity: string | null;
  limit: CodeSession["limit"];
  stopping: boolean;
  /** Steps changed since the last broadcast. */
  dirty: Map<string, CodeStep>;
  summaryDirty: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

const live = new Map<string, Live>();

const FLUSH_MS = 150;
const SAVE_MS = 2_000;
/** Steps kept in the database: the latest ones. */
const MAX_STEPS = 800;
const STOP_GRACE_MS = 5_000;
/** Allowed without asking in the session's directory: file edits. Commands and the rest are asked. */
const DEFAULT_MODE = "acceptEdits";

const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,99}$/;

export class CodeSessionError extends Error {
  constructor(public code: "not_found" | "invalid" | "gone") {
    super(code);
  }
}

/* ---------- reading ---------- */

function summary(s: Live): CodeSession {
  const r = s.row;
  const a = s.approval;
  return {
    id: r.id,
    conversationId: r.conversationId,
    agentId: r.agentId,
    requestedBy: r.requestedBy,
    title: r.title,
    status: r.status,
    cwd: r.cwd,
    model: r.model,
    activity: s.activity,
    limit: s.limit,
    approval: a && { id: a.id, tool: a.tool, title: a.title, ...(a.detail && { detail: a.detail }), choices: a.choices },
    result: r.result,
    usage: r.usage,
    stepCount: s.transcript.steps.length,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function fromRow(row: Row): Live {
  return {
    row,
    transcript: new Transcript(row.cwd, row.steps),
    running: false,
    proc: null,
    outbox: [],
    unread: [],
    approval: null,
    activity: null,
    limit: null,
    stopping: false,
    dirty: new Map(),
    summaryDirty: false,
    flushTimer: null,
    saveTimer: null,
  };
}

/** The live session, loaded from the database when it is not running. */
async function load(id: string, conversationId?: string): Promise<Live> {
  let s = live.get(id);
  if (!s) {
    const [row] = await db.select().from(schema.codeSession).where(eq(schema.codeSession.id, id));
    if (!row) throw new CodeSessionError("not_found");
    // Loaded meanwhile by another request.
    s = live.get(id) ?? fromRow(row);
    live.set(id, s);
  }
  if (conversationId && s.row.conversationId !== conversationId) throw new CodeSessionError("not_found");
  return s;
}

export async function getCodeSession(id: string, conversationId?: string): Promise<CodeSessionDetail> {
  const s = await load(id, conversationId);
  return { ...summary(s), steps: s.transcript.steps };
}

/** A conversation's sessions, newest first, without their steps. */
export async function listCodeSessions(conversationId: string): Promise<CodeSession[]> {
  const rows = await db
    .select()
    .from(schema.codeSession)
    .where(eq(schema.codeSession.conversationId, conversationId))
    .orderBy(desc(schema.codeSession.createdAt));
  return rows.map((row) => summary(live.get(row.id) ?? fromRow(row)));
}

/** What a bot needs to follow the session it started: status, answer, and the actions since its last instruction. */
export async function codeSessionReport(id: string) {
  const s = await load(id);
  const steps = s.transcript.steps;
  const since = steps.findLastIndex((st) => st.kind === "user");
  const actions = steps
    .slice(since + 1)
    .filter((st): st is Extract<CodeStep, { kind: "tool" }> => st.kind === "tool" && !st.parentId)
    .slice(-25)
    .map((st) => `${{ done: "✓", running: "…", error: "✗", denied: "✗ (refusé)" }[st.status]} ${st.name}: ${st.title}`);
  const { id: _, conversationId: __, agentId: ___, requestedBy: ____, ...rest } = summary(s);
  return { session_id: id, ...rest, actions };
}

/* ---------- broadcasting and saving ---------- */

function touch(s: Live, steps: (CodeStep | undefined)[] = [], summaryChanged = false) {
  for (const step of steps) if (step) s.dirty.set(step.id, step);
  if (summaryChanged || steps.length) s.summaryDirty = true;
  s.flushTimer ??= setTimeout(() => void flush(s), FLUSH_MS);
  s.saveTimer ??= setTimeout(() => void save(s), SAVE_MS);
}

async function flush(s: Live) {
  if (s.flushTimer) clearTimeout(s.flushTimer);
  s.flushTimer = null;
  const { conversationId, id } = s.row;
  const steps = [...s.dirty.values()];
  s.dirty.clear();
  try {
    for (const step of steps) await publishToConversation(conversationId, { type: "code.step", conversationId, sessionId: id, step });
    if (s.summaryDirty) {
      s.summaryDirty = false;
      await publishToConversation(conversationId, { type: "code.session", conversationId, session: summary(s) });
    }
  } catch (err) {
    console.error("code session: broadcast", err);
  }
}

async function save(s: Live) {
  if (s.saveTimer) clearTimeout(s.saveTimer);
  s.saveTimer = null;
  const r = s.row;
  r.updatedAt = new Date();
  try {
    await db
      .update(schema.codeSession)
      .set({
        status: r.status,
        result: r.result,
        model: r.model,
        permissions: r.permissions,
        steps: s.transcript.steps.slice(-MAX_STEPS),
        usage: r.usage,
        updatedAt: r.updatedAt,
      })
      .where(eq(schema.codeSession.id, r.id));
  } catch (err) {
    console.error("code session: save", err);
  }
}

/** Status reached at the end of a run: saved and broadcast right away. */
async function settle(s: Live, status: CodeSessionStatus) {
  s.row.status = status;
  touch(s, [], true);
  await save(s);
  await flush(s);
}

function setStatus(s: Live, status: CodeSessionStatus) {
  if (s.row.status === status) return;
  s.row.status = status;
  touch(s, [], true);
}

function notice(s: Live, code: "stopped" | "restart" | "error", text?: string) {
  touch(s, [s.transcript.add({ id: crypto.randomUUID(), kind: "notice", code, ...(text && { text }) })]);
}

/* ---------- starting and driving ---------- */

export async function startCodeSession(opts: {
  conversationId: string;
  agentId: string | null;
  /** Owner of the subscription on whose behalf it runs (checked by the caller). */
  requestedBy: string;
  /** Who gives the instruction, as shown in the steps (the bot's name, or the owner's). */
  by: string;
  /** The bot's name for the conversation's event line (null: started by the owner). */
  botName: string | null;
  /** Posts the conversation's event line; false when the card goes into the bot's reply instead. */
  announce: boolean;
  title: string;
  task: string;
  /** Sub-directory of the Claude Code workspace, shared by the sessions that name it (a repo, a project). */
  project?: string;
  model?: string;
}): Promise<CodeSession> {
  const task = opts.task.trim();
  const project = opts.project?.trim();
  const model = opts.model?.trim() || null;
  if (!task || (project && !PROJECT.test(project)) || (model && !MODEL.test(model))) throw new CodeSessionError("invalid");
  const id = crypto.randomUUID();
  const cwd = join(await workspace(), "projects", project || `session-${id.slice(0, 8)}`);
  await mkdir(cwd, { recursive: true });
  const title = opts.title.trim().slice(0, 200) || task.split("\n")[0]!.slice(0, 120);
  const [row] = await db
    .insert(schema.codeSession)
    .values({
      id,
      conversationId: opts.conversationId,
      agentId: opts.agentId,
      requestedBy: opts.requestedBy,
      title,
      status: "running",
      cwd,
      model,
      permissions: { allowedTools: [], dirs: [] },
      steps: [],
    })
    .returning();
  const s = fromRow(row!);
  live.set(id, s);
  if (opts.announce) await announceCodeSession(opts.conversationId, id, title, opts.botName);
  instruct(s, { text: task, by: opts.by });
  return summary(s);
}

/** The conversation's event line for a session, with its card (when no reply of the bot holds it). */
export const announceCodeSession = (conversationId: string, sessionId: string, title: string, bot: string | null) =>
  postEvent(conversationId, { type: "code.started", bot, title, sessionId });

/**
 * An instruction for the session: written to Claude Code while it works (it reads it at its next
 * tool call), or the start of a new run that resumes the session.
 */
export async function sendToCodeSession(id: string, text: string, by: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (!text.trim()) throw new CodeSessionError("invalid");
  instruct(s, { text: text.trim(), by });
  return summary(s);
}

function instruct(s: Live, m: Instruction) {
  touch(s, [s.transcript.add({ id: crypto.randomUUID(), kind: "user", text: m.text, by: m.by })]);
  if (s.running && !s.stopping) {
    if (s.proc) deliver(s, m);
    else s.outbox.push(m);
    return;
  }
  s.outbox.push(m);
  // Stopping: the new run starts once the current one has exited.
  if (!s.running) start(s);
}

function deliver(s: Live, m: Instruction) {
  s.unread.push(m);
  write(s, { type: "user", message: { role: "user", content: [{ type: "text", text: m.text }] } });
}

export async function answerCodeApproval(id: string, approvalId: string, choice: CodeApproval["choices"][number], conversationId?: string) {
  const s = await load(id, conversationId);
  const a = s.approval;
  if (!a || a.id !== approvalId || !s.proc) throw new CodeSessionError("gone");
  if (!a.choices.includes(choice)) throw new CodeSessionError("invalid");
  s.approval = null;
  let response: Json;
  if (choice === "deny") {
    response = { behavior: "deny", message: "The user denied this action. Do not retry it: take another approach, or stop and explain what you need." };
    if (a.toolUseId) touch(s, [s.transcript.deny(a.toolUseId)]);
  } else if (choice === "session") {
    const suggestions = a.suggestions.length ? a.suggestions : [{ type: "addRules", rules: [{ toolName: a.tool }], behavior: "allow", destination: "session" }];
    s.row.permissions = remember(s.row.permissions, suggestions);
    response = { behavior: "allow", updatedInput: a.input, updatedPermissions: suggestions };
  } else {
    response = { behavior: "allow", updatedInput: a.input };
  }
  write(s, { type: "control_response", response: { subtype: "success", request_id: a.requestId, response } });
  s.row.status = "running";
  touch(s, [], true);
  return summary(s);
}

/**
 * The model of the next runs; a run under way switches right away (Claude Code's set_model
 * control request). The caller checks the model is one the owner may use.
 */
export async function setCodeSessionModel(id: string, model: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (!MODEL.test(model)) throw new CodeSessionError("invalid");
  s.row.model = model;
  if (s.proc) write(s, { type: "control_request", request_id: crypto.randomUUID(), request: { subtype: "set_model", model } });
  touch(s, [], true);
  await save(s);
  return summary(s);
}

/** Stops the run under way: Claude Code is interrupted (the tool in progress stops), then killed if it does not end. */
export async function stopCodeSession(id: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (!s.running) return summary(s);
  s.stopping = true;
  s.outbox = [];
  s.unread = [];
  s.approval = null;
  const proc = s.proc;
  if (proc) {
    write(s, { type: "control_request", request_id: crypto.randomUUID(), request: { subtype: "interrupt" } });
    setTimeout(() => {
      if (s.proc === proc) proc.kill();
    }, STOP_GRACE_MS);
  }
  touch(s, [], true);
  return summary(s);
}

/** At startup: the runs the previous process had under way died with it. */
export async function recoverCodeSessions() {
  const rows = await db.select({ id: schema.codeSession.id }).from(schema.codeSession).where(inArray(schema.codeSession.status, ["running", "waiting"]));
  for (const { id } of rows) {
    const s = await load(id);
    notice(s, "restart");
    await settle(s, "stopped");
  }
}

/* ---------- the process ---------- */

function write(s: Live, line: Json) {
  try {
    s.proc?.stdin.write(`${JSON.stringify(line)}\n`);
    s.proc?.stdin.flush();
  } catch (err) {
    console.error("code session: stdin", err);
  }
}

/** "Allow for the session" suggestions, kept as flags for the next runs. */
export function remember(p: Permissions, suggestions: Json[]): Permissions {
  const allowedTools = new Set(p.allowedTools);
  const dirs = new Set(p.dirs);
  let mode = p.mode;
  for (const s of suggestions) {
    if (s?.type === "addRules" && s.behavior === "allow") {
      for (const r of Array.isArray(s.rules) ? s.rules : []) {
        if (r?.toolName) allowedTools.add(r.ruleContent ? `${r.toolName}(${r.ruleContent})` : String(r.toolName));
      }
    } else if (s?.type === "setMode" && typeof s.mode === "string") {
      mode = s.mode;
    } else if (s?.type === "addDirectories") {
      for (const d of Array.isArray(s.directories) ? s.directories : []) dirs.add(String(d));
    }
  }
  return { allowedTools: [...allowedTools], dirs: [...dirs], ...(mode && { mode }) };
}

function start(s: Live) {
  s.running = true;
  s.stopping = false;
  s.row.result = null;
  setStatus(s, "running");
  execute(s)
    .catch(async (err) => {
      console.error("code session: run", err);
      s.proc = null;
      // The CLI could not even start: its instructions would fail the same way.
      s.outbox = [];
      notice(s, "error", clip(String(err instanceof Error ? err.message : err), 1_000));
      await settle(s, "failed");
    })
    .finally(() => {
      s.running = false;
      s.proc = null;
      s.approval = null;
      s.activity = null;
      // An instruction arrived while it was stopping: it starts the next run.
      if (s.outbox.length) start(s);
    });
}

async function execute(s: Live): Promise<void> {
  const r = s.row;
  const allowed = [...env.CLAUDE_CODE_ALLOWED_TOOLS.split(/[\s,]+/).filter(Boolean), ...r.permissions.allowedTools];
  const args = [
    env.CLAUDE_CODE_BIN,
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    // Tells which of the owner's messages Claude Code has taken into account.
    "--replay-user-messages",
    // Actions outside the allowed ones are asked on stdout (can_use_tool) and answered on stdin.
    "--permission-prompt-tool", "stdio",
    "--permission-mode", r.permissions.mode || DEFAULT_MODE,
    // None of the owner's hooks, CLAUDE.md or personal MCP servers; the project's own settings apply.
    "--setting-sources", "project",
    "--strict-mcp-config",
    ...((await sessionExists(r.id)) ? ["--resume", r.id] : ["--session-id", r.id]),
    ...(r.model ? ["--model", r.model] : []),
    ...(allowed.length ? ["--allowedTools", ...allowed] : []),
    ...r.permissions.dirs.flatMap((d) => ["--add-dir", d]),
  ];
  const proc = Bun.spawn(args, { cwd: r.cwd, env: await claudeCodeEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  s.proc = proc;
  // Stopped while it was starting.
  if (s.stopping) proc.kill();
  for (const m of s.outbox.splice(0)) deliver(s, m);

  let result: { text: string; isError: boolean } | null = null;
  for await (const line of readLines(proc.stdout)) {
    let ev: Json;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === "control_request") {
      onControlRequest(s, ev);
      continue;
    }
    if (ev.type === "control_response") continue;
    // One of the instructions written, now in Claude Code's context.
    if (ev.type === "user" && ev.isReplay) {
      s.unread.shift();
      continue;
    }
    const change = s.transcript.apply(ev);
    let summaryChanged = false;
    if (change.init?.model && change.init.model !== r.model) {
      r.model = change.init.model;
      summaryChanged = true;
    }
    if (change.activity !== undefined && change.activity !== s.activity) {
      s.activity = change.activity;
      summaryChanged = true;
    }
    if (change.limit !== undefined && JSON.stringify(change.limit) !== JSON.stringify(s.limit)) {
      s.limit = change.limit;
      summaryChanged = true;
    }
    touch(s, change.steps, summaryChanged);
    if (change.result) {
      result = change.result;
      r.result = result.text || null;
      account(s, change.result.event);
      // Everything written has been answered: the run ends (stdin closed, the process exits).
      if (!s.unread.length || s.stopping) proc.stdin.end();
    }
  }
  const code = await proc.exited;
  s.proc = null;
  s.approval = null;
  s.activity = null;
  touch(s, s.transcript.settle(), true);

  if (s.stopping) {
    notice(s, "stopped");
    return settle(s, "stopped");
  }
  // Written but never taken into account (the process ended first): they go to the next run.
  if (s.unread.length) s.outbox.unshift(...s.unread.splice(0));
  if (result?.isError || (!result && code !== 0)) {
    const detail = result?.text || (await new Response(proc.stderr).text().catch(() => "")).trim() || `exit code ${code}`;
    notice(s, "error", clip(detail, 1_000));
    return settle(s, "failed");
  }
  return settle(s, "idle");
}

/** A run's tokens: added to the session's totals and to the organization's usage (Settings › Usage), as a "code" task. */
function account(s: Live, ev: Json) {
  const r = s.row;
  const usage = resultUsage(ev as ClaudeResult, r.model ?? "claude");
  const total: CodeUsage = r.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, runs: 0, turns: 0, durationMs: 0 };
  for (const u of usage) {
    total.inputTokens += u.inputTokens;
    total.outputTokens += u.outputTokens;
    total.cacheReadTokens += u.cacheReadTokens;
    total.cacheWriteTokens += u.cacheWriteTokens;
    total.costUsd += u.costUsd;
  }
  total.runs += 1;
  total.turns += Number(ev.num_turns) || 0;
  total.durationMs += Number(ev.duration_ms) || 0;
  r.usage = total;
  touch(s, [], true);
  recordEngineUsage(
    "claude-code",
    usage,
    { userId: r.requestedBy, agentId: r.agentId, conversationId: r.conversationId, sessionId: r.id },
    { source: "code", taskId: r.id, taskName: r.title },
  ).catch((err) => console.error("code session: usage", err));
}

function onControlRequest(s: Live, ev: Json) {
  const req = ev.request ?? {};
  if (req.subtype !== "can_use_tool") {
    write(s, { type: "control_response", response: { subtype: "error", request_id: ev.request_id, error: `Unsupported request: ${req.subtype}` } });
    return;
  }
  const tool = String(req.tool_name ?? "tool");
  const toolUseId = req.tool_use_id ? String(req.tool_use_id) : undefined;
  const step = toolUseId ? s.transcript.get(toolUseId) : undefined;
  const detail = step?.kind === "tool" ? step.input : clip(JSON.stringify(req.input ?? {}, null, 2));
  s.approval = {
    id: crypto.randomUUID(),
    requestId: String(ev.request_id),
    toolUseId,
    tool,
    title: step?.kind === "tool" ? step.title : String(req.description ?? tool),
    ...(detail && { detail }),
    input: req.input ?? {},
    suggestions: Array.isArray(req.permission_suggestions) ? req.permission_suggestions : [],
    choices: ["once", "session", "deny"],
  };
  s.row.status = "waiting";
  touch(s, [], true);
}
