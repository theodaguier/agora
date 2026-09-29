import { desc, eq, inArray } from "drizzle-orm";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { CodeApproval, CodeGitAction, CodeSession, CodeSessionDetail, CodeSessionStatus, CodeStep, CodeUsage } from "@agora/core";
import { activateClaudeAccount, activeClaudeAccountId, claudeCodeEnv, claudeProfiles } from "./claude-accounts";
import { resultUsage, sessionExists, workspace, type ClaudeResult } from "./claude-code";
import * as gitOps from "./code-git";
import { GitError, githubEnv, githubToken, parseRepo, prepareRepo, readGit, sessionBranch } from "./code-git";
import { clip, Transcript } from "./code-steps";
import { db, schema } from "./db";
import { env } from "./env";
import { publishToConversation } from "./events";
import { readLines } from "./lines";
import { postEvent } from "./messages";
import { screenEnv } from "./screen";
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
  /** Clone to make before the next run (the first one; again after a failed clone). */
  prepare: { repo: string; branch: string; author: { name: string; email: string } } | null;
  /** Instructions of a run whose clone failed: they go with the next one. */
  held: Instruction[];
  /** A git action of the owner is under way. */
  gitBusy: boolean;
  /** The clone's state being read (one read at a time), and when the last one started. */
  gitReading: Promise<void> | null;
  gitReadAt: number;
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

/** Claude Code's answer when the account ran out of its subscription's usage. */
const LIMIT_HIT = /hit your .*limit|usage limit reached|limit reached/i;

const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,99}$/;

export class CodeSessionError extends Error {
  /** `detail`: what went wrong, for the person (a git failure, a bad repository). */
  constructor(
    public code: "not_found" | "invalid" | "gone" | "busy" | "git",
    public detail?: string,
  ) {
    super(detail ?? code);
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
    repo: r.repo,
    git: r.git,
    model: r.model,
    account: r.account,
    activity: s.activity,
    limit: s.limit,
    approval: a && { id: a.id, tool: a.tool, title: a.title, ...(a.detail && { detail: a.detail }), choices: a.choices },
    result: r.result,
    usage: r.usage,
    stepCount: s.transcript.steps.length,
    instruction: lastInstruction(s.transcript.steps),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const INSTRUCTION_MAX = 200;

/** The last instruction given to the session, cut short: what it is working on, and who asked. */
function lastInstruction(steps: CodeStep[]): CodeSession["instruction"] {
  const last = steps.findLast((st) => st.kind === "user");
  if (last?.kind !== "user") return null;
  const text = last.text.replace(/\s+/g, " ").trim();
  return { by: last.by, text: text.length > INSTRUCTION_MAX ? `${text.slice(0, INSTRUCTION_MAX - 1)}…` : text };
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
    prepare: null,
    held: [],
    gitBusy: false,
    gitReading: null,
    gitReadAt: 0,
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

/**
 * What a bot needs to follow a session: status, answer, the actions since the last instruction,
 * and the instructions and git actions of everyone (its owner drives it from the panel too).
 */
export async function codeSessionReport(id: string) {
  const s = await load(id);
  const steps = s.transcript.steps;
  const since = steps.findLastIndex((st) => st.kind === "user");
  const actions = steps
    .slice(since + 1)
    .filter((st): st is Extract<CodeStep, { kind: "tool" }> => st.kind === "tool" && !st.parentId)
    .slice(-25)
    .map((st) => `${{ done: "✓", running: "…", error: "✗", denied: "✗ (refusé)" }[st.status]} ${st.name}: ${st.title}`);
  const history = steps
    .filter((st) => st.kind === "user" || st.kind === "git")
    .slice(-10)
    .map((st) => (st.kind === "user" ? `${st.by ?? "?"}: ${clipLine(st.text, 400)}` : `[git ${st.action}${st.ok ? "" : " failed"}${st.by ? ` by ${st.by}` : ""}] ${st.text}`));
  const { id: _, conversationId: __, agentId: ___, requestedBy: ____, ...rest } = summary(s);
  return { session_id: id, ...rest, actions, history };
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
        git: r.git,
        account: r.account,
        steps: s.transcript.steps.slice(-MAX_STEPS),
        usage: r.usage,
        updatedAt: r.updatedAt,
      })
      .where(eq(schema.codeSession.id, r.id));
  } catch (err) {
    console.error("code session: save", err);
  }
}

/** Status reached at the end of a run: saved and broadcast right away, with where its clone stands now. */
async function settle(s: Live, status: CodeSessionStatus) {
  s.row.status = status;
  await refreshGit(s);
  touch(s, [], true);
  await save(s);
  await flush(s);
}

function setStatus(s: Live, status: CodeSessionStatus) {
  if (s.row.status === status) return;
  s.row.status = status;
  touch(s, [], true);
}

/** Reads of the clone asked from the panel, at most this often: each one queries GitHub. */
const GIT_READ_MS = 15_000;
/** A tool call after which the branch or its pull request may have changed. */
const GIT_TOUCHING = /\bgit\b[^\n|;&]*?\s(push|commit|merge|rebase|reset|checkout|switch|pull)\b|\bgh\s+pr\b|github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/;

/**
 * The clone's state read again and broadcast, one read at a time: during a run after a tool call
 * that pushed or touched a pull request, and when a member looks at the session (`throttle`: not
 * more often than GIT_READ_MS, a merge done on GitHub shows up at the next look).
 */
async function rereadGit(s: Live, throttle: boolean) {
  if (s.gitReading) return s.gitReading;
  if (throttle && Date.now() - s.gitReadAt < GIT_READ_MS) return;
  s.gitReadAt = Date.now();
  const before = JSON.stringify(s.row.git);
  s.gitReading = (async () => {
    try {
      await refreshGit(s);
      if (JSON.stringify(s.row.git) !== before) {
        touch(s, [], true);
        if (!s.running) await save(s);
      }
    } finally {
      s.gitReading = null;
    }
  })();
  return s.gitReading;
}

/** A member looking at the session: its branch and pull request as they are now (a PR merged on GitHub). */
export async function refreshCodeSessionGit(id: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (!s.gitBusy && !s.prepare) await rereadGit(s, true);
  return summary(s);
}

/**
 * Reads where the clone stands. A pull request Claude Code opened itself (gh, in its terminal) is
 * found by the links it printed, and announced like one opened from the panel.
 */
async function refreshGit(s: Live) {
  const before = s.row.git?.pr ?? null;
  const texts = s.transcript.steps.flatMap((st) => (st.kind === "tool" ? [st.input ?? "", st.output ?? ""] : st.kind === "text" ? [st.text] : []));
  s.row.git = await readGit(s.row.cwd, { repo: s.row.repo, pulls: gitOps.pullRequestLinks(texts) }).catch(
    (err) => (console.error("code session: git state", err), s.row.git),
  );
  const pr = s.row.git?.pr;
  if (!pr || (before?.number === pr.number && before.url === pr.url) || s.gitBusy) return;
  // Opened from the panel: runGitAction announces it.
  if (s.transcript.steps.some((st) => st.kind === "git" && st.action === "pr" && st.ok && st.text.includes(`#${pr.number}`))) return;
  gitStep(s, "pr", true, gitOps.prFoundText(pr), null);
  await postEvent(s.row.conversationId, {
    type: "code.pr",
    actor: "Claude Code",
    title: s.row.title,
    sessionId: s.row.id,
    number: pr.number,
    url: pr.url,
    merged: pr.state === "merged",
  }).catch((err) => console.error("code session: pr event", err));
}

function gitStep(s: Live, action: CodeGitAction, ok: boolean, text: string, by: string | null) {
  touch(s, [s.transcript.add({ id: crypto.randomUUID(), kind: "git", action, ok, text, by })]);
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
  /** GitHub repository (owner/name or URL) cloned into the directory before the first run. */
  repo?: string;
  /** Its branch to work on (default: a new one named after the session). */
  branch?: string;
}): Promise<CodeSession> {
  const task = opts.task.trim();
  const project = opts.project?.trim();
  const model = opts.model?.trim() || null;
  if (!task || (project && !PROJECT.test(project)) || (model && !MODEL.test(model))) throw new CodeSessionError("invalid");
  const repo = opts.repo?.trim() ? parseRepo(opts.repo) : null;
  if (opts.repo?.trim() && !repo) throw new CodeSessionError("invalid", `Not a GitHub repository: ${opts.repo}. Expected owner/name or its URL.`);
  const id = crypto.randomUUID();
  const cwd = join(await workspace(), "projects", project || (repo ? `${repo.split("/")[1]}-${id.slice(0, 8)}` : `session-${id.slice(0, 8)}`));
  await mkdir(cwd, { recursive: true });
  // Untitled (started from the panel): Claude Code names it from the task, the first line otherwise.
  const named = opts.title.trim() ? null : await nameTask(cwd, task);
  const title = opts.title.trim().slice(0, 200) || named?.title || task.split("\n")[0]!.slice(0, 120);
  const [owner] = repo ? await db.select({ name: schema.user.name, email: schema.user.email }).from(schema.user).where(eq(schema.user.id, opts.requestedBy)) : [];
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
      repo,
      model,
      permissions: { allowedTools: [], dirs: [] },
      steps: [],
    })
    .returning();
  const s = fromRow(row!);
  if (named) recordQuickUsage(s.row, named.result);
  if (repo) s.prepare = { repo, branch: opts.branch?.trim() || sessionBranch(title, id), author: owner ?? { name: "Agora", email: "agora@localhost" } };
  live.set(id, s);
  if (opts.announce) await announceCodeSession(opts.conversationId, id, title, opts.botName);
  instruct(s, { text: task, by: opts.by });
  return summary(s);
}

const TITLE_TIMEOUT_MS = 30_000;

const TITLE_SYSTEM = [
  "You name a coding task, like the title of its ticket. Answer with the title only: no preamble, no quotes, no final period.",
  "At most 60 characters, in the language of the task. Name what is to be done, not how. Keep the issue or pull request number the task refers to (#402).",
].join("\n");

/** A title for a task given without one, by Claude Code: null when it could not write one. */
async function nameTask(cwd: string, task: string) {
  const answer = await quickClaude(cwd, TITLE_SYSTEM, clip(task, 4_000), TITLE_TIMEOUT_MS);
  const title = answer && cleanMessage(answer.text).split("\n")[0]!.replace(/[.\s]+$/, "").slice(0, 120);
  return title ? { title, result: answer.result } : null;
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
  s.outbox.push(...s.held.splice(0), m);
  // Stopping: the new run starts once the current one has exited; a git action: once it is done.
  if (!s.running && !s.gitBusy) start(s);
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

export type GitRequest =
  /** An empty message: Claude Code writes it from the diff. */
  | { action: "commit"; message: string }
  | { action: "push" }
  | { action: "pull" }
  | { action: "pr"; title: string; body: string; draft: boolean }
  | { action: "merge"; method: "squash" | "merge" | "rebase" };

/**
 * A git action of the owner, from the panel: never while Claude Code works in the directory.
 * Recorded in the steps (the bot reads them), and in the conversation for a pull request.
 */
export async function runGitAction(id: string, req: GitRequest, by: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (s.running || s.gitBusy) throw new CodeSessionError("busy");
  s.gitBusy = true;
  const cwd = s.row.cwd;
  try {
    const outcome = await {
      commit: async () => gitOps.commit(cwd, (req as Extract<GitRequest, { action: "commit" }>).message.trim() || (await writeCommitMessage(s))),
      push: () => gitOps.push(cwd),
      pull: () => gitOps.pull(cwd),
      pr: () => gitOps.openPullRequest(cwd, req as Extract<GitRequest, { action: "pr" }>),
      merge: () => gitOps.mergePullRequest(cwd, (req as Extract<GitRequest, { action: "merge" }>).method),
    }[req.action]();
    gitStep(s, req.action, true, outcome.text, by);
    if (outcome.pr && (outcome.opened || req.action === "merge")) {
      await postEvent(s.row.conversationId, {
        type: "code.pr",
        actor: by,
        title: s.row.title,
        sessionId: s.row.id,
        number: outcome.pr.number,
        url: outcome.pr.url,
        merged: req.action === "merge",
      }).catch((err) => console.error("code session: pr event", err));
    }
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
    gitStep(s, req.action, false, err.message, by);
    throw new CodeSessionError("git", err.message);
  } finally {
    s.gitBusy = false;
    await refreshGit(s);
    touch(s, [], true);
    await save(s);
    await flush(s);
    // An instruction came during the action.
    if (s.outbox.length && !s.running) start(s);
  }
  return summary(s);
}

/* ---------- commit messages ---------- */

/** Fast and cheap: a commit message or a title needs no more. */
const QUICK_MODEL = "haiku";
const COMMIT_TIMEOUT_MS = 90_000;

const COMMIT_SYSTEM = [
  "You write git commit messages. Answer with the message only: no preamble, no code fence, no quotes.",
  "First line: at most 72 characters, imperative mood, what the change does. Follow the convention of the repository's recent subjects (prefixes such as feat:/fix(scope):, language, casing); plain imperative English when there are none.",
  "Then, only when the change is not obvious from the first line: a blank line and a short body saying why, wrapped at 72 characters. Never list the files.",
].join("\n");

/** The owner's request, while no run is working in the directory: a message for every change, to edit before committing. */
export async function commitMessageFor(id: string, conversationId?: string) {
  const s = await load(id, conversationId);
  if (s.running || s.gitBusy) throw new CodeSessionError("busy");
  return writeCommitMessage(s);
}

/**
 * A commit message for every change of the session's clone, by Claude Code (on the owner's active
 * account) from the diff, the task and the repository's recent subjects. Counted in the session's usage.
 */
async function writeCommitMessage(s: Live) {
  let material: Awaited<ReturnType<typeof gitOps.commitMaterial>>;
  try {
    material = await gitOps.commitMaterial(s.row.cwd);
  } catch (err) {
    if (err instanceof GitError) throw new CodeSessionError("git", err.message);
    throw err;
  }
  const prompt = [
    `Task of the session: ${s.row.title}`,
    material.recent.length ? `Recent subjects of the repository:\n${material.recent.map((l) => `- ${l}`).join("\n")}` : "",
    material.stat ? `Diff stat:\n${material.stat}` : "",
    material.untracked.length ? `New files:\n${material.untracked.join("\n")}` : "",
    material.diff ? `Diff:\n${material.diff}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const answer = await quickClaude(s.row.cwd, COMMIT_SYSTEM, prompt, COMMIT_TIMEOUT_MS);
  const message = answer ? cleanMessage(answer.text) : "";
  if (!message) throw new CodeSessionError("git", "Claude Code could not write the commit message.");
  if (answer) recordQuickUsage(s.row, answer.result);
  return message;
}

/**
 * One short answer from Claude Code (Haiku, on the owner's active account): no tools, no session
 * kept. Null when it failed, logged.
 */
async function quickClaude(cwd: string, system: string, prompt: string, timeout: number) {
  const args = [
    env.CLAUDE_CODE_BIN,
    "-p",
    "--output-format", "json",
    "--model", QUICK_MODEL,
    "--system-prompt", system,
    // Nothing to run nor read: everything it needs is in the prompt.
    "--tools", "",
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  const proc = Bun.spawn(args, { cwd, env: await claudeCodeEnv(), stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout });
  proc.stdin.write(prompt);
  proc.stdin.end();
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  let result: (ClaudeResult & { result?: string; is_error?: boolean }) | null = null;
  try {
    result = JSON.parse(out);
  } catch {
    // Reported below.
  }
  if (!result || result.is_error || !String(result.result ?? "").trim()) {
    console.error("code session: quick answer", err.slice(-500) || out.slice(-500));
    return null;
  }
  return { text: String(result.result), result };
}

/** Counted in the session's usage. */
function recordQuickUsage(row: Row, result: ClaudeResult) {
  recordEngineUsage(
    "claude-code",
    resultUsage(result, QUICK_MODEL),
    { userId: row.requestedBy, agentId: row.agentId, conversationId: row.conversationId, sessionId: row.id },
    { source: "code", taskId: row.id, taskName: row.title },
  ).catch((e) => console.error("code session: usage", e));
}

/** Without the fence or quotes a model sometimes adds anyway. */
const cleanMessage = (text: string) =>
  text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .replace(/^["'`](.*)["'`]$/s, "$1")
    .trim()
    .slice(0, 5_000);

/* ---------- what the bots know ---------- */

const clipLine = (text: string, max: number) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** The clone's state in one line, for a bot. */
function gitLine(git: CodeSession["git"]) {
  if (!git) return null;
  const parts = [git.repo ?? "dépôt local", git.branch ? `branche ${git.branch}` : "aucune branche"];
  if (git.changes) parts.push(`${git.changes} fichier(s) modifié(s) non commités`);
  if (git.ahead) parts.push(git.pushed ? `${git.ahead} commit(s) non poussé(s)` : `${git.ahead} commit(s), branche jamais poussée`);
  if (git.pr) parts.push(`PR #${git.pr.number} ${{ open: "ouverte", closed: "fermée", merged: "mergée" }[git.pr.state]} (${git.pr.url})`);
  if (!git.github) parts.push("pas d'accès GitHub");
  return parts.join(", ");
}

/**
 * The browser the API image ships (infra/api-runtime.Dockerfile). Left to itself, Claude Code runs
 * `playwright install`, which hangs there: the browsers directory belongs to root.
 */
const browserNote = (chromium: string) =>
  [
    `Chromium est déjà installé sur cette machine, avec ses bibliothèques système : ${chromium}.`,
    "Ne lance jamais `playwright install` ni `npx playwright install-deps`, et n'installe aucun autre navigateur : le téléchargement bloque la session.",
    `Si la version de Playwright du projet réclame une autre révision, lance Chromium avec executablePath: "${chromium}" (Puppeteer le trouve déjà via PUPPETEER_EXECUTABLE_PATH).`,
    "Les membres de la conversation voient en direct la page du navigateur que tu lances, tant qu'il est ouvert : pour leur montrer un rendu, garde-le ouvert sur cette page le temps de l'examiner.",
  ].join("\n");

/**
 * The standing rule of a bot that has the agora_code tools, in a turn its owner started: code goes
 * through a session. Without it, a conversation where no session ran yet says nothing of them, and
 * a bot with a GitHub connector writes the fix itself, out of sight, file by file.
 */
export const CODE_DELEGATION_PROMPT = [
  "# Travail de code : sessions Claude Code",
  "Tu as les outils claude_code_start, claude_code_wait, claude_code_send et claude_code_stop (tool_describe si tu ne vois pas leurs paramètres).",
  "Tout travail sur du code (corriger une issue, écrire une fonctionnalité, un correctif, un test, ouvrir une PR) passe par une session : claude_code_start avec repo (owner/nom), un titre qui nomme la tâche et un brief complet (but, contraintes, comment vérifier). La session clone le dépôt, a git et gh, et les membres de la conversation la suivent en direct.",
  "Ne code jamais toi-même : ni fichier créé, modifié ou poussé avec le connecteur GitHub (branches, commits, PR comprises), ni dans ton terminal. Lire une issue ou quelques fichiers pour écrire le brief reste permis, sans t'y attarder.",
  "Une session par tâche : chaque nouvelle issue ou fonctionnalité a sa propre session (claude_code_start, avec le même project pour réutiliser le clone), pour que la conversation la voie sous son propre titre. claude_code_send ne sert qu'à poursuivre ou corriger la tâche de la session, et il est refusé une fois sa PR mergée ou fermée.",
  "Annonce la session en une phrase à la conversation, puis suis-la avec claude_code_wait. Relancer une session avec claude_code_send s'annonce aussi.",
].join("\n");

/**
 * The conversation's Claude Code sessions, as they stand, for the system prompt of every bot turn:
 * what the owner told them from the panel, the git actions, their last answer. A bot only hears of
 * a session through its own tool calls otherwise, and would miss what happened since.
 */
export async function codeSessionsContext(conversationId: string) {
  const rows = await db
    .select()
    .from(schema.codeSession)
    .where(eq(schema.codeSession.conversationId, conversationId))
    .orderBy(desc(schema.codeSession.updatedAt))
    .limit(6);
  const recent = rows.filter((r) => Date.now() - r.updatedAt.getTime() < 14 * 24 * 3_600_000);
  if (!recent.length) return "";
  const agentIds = [...new Set(recent.map((r) => r.agentId).filter((a): a is string => !!a))];
  const agentNames = new Map(
    agentIds.length ? (await db.select({ id: schema.agent.id, name: schema.agent.name }).from(schema.agent).where(inArray(schema.agent.id, agentIds))).map((a) => [a.id, a.name]) : [],
  );
  const profiles = recent.some((r) => live.get(r.id)?.limit?.status === "rejected") ? await claudeProfiles().catch(() => []) : [];
  const status: Record<CodeSessionStatus, string> = {
    running: "en cours",
    waiting: "attend une autorisation de son propriétaire",
    idle: "a terminé ce qu'on lui a demandé",
    stopped: "arrêtée",
    failed: "en échec",
  };
  const blocks = recent.map((row) => {
    const s = live.get(row.id) ?? fromRow(row);
    const r = s.row;
    const steps = s.transcript.steps;
    const by = r.agentId ? (agentNames.get(r.agentId) ?? "un bot") : "son propriétaire";
    const lines = [`## « ${r.title} » (session_id ${r.id})`, `Lancée par ${by}. État : ${status[r.status]}${r.model ? `, modèle ${r.model}` : ""}.`];
    const git = gitLine(r.git);
    if (git) lines.push(`Dépôt : ${git}.`);
    if (r.account?.email) lines.push(`Compte Claude de son dernier run : ${r.account.email}.`);
    if (s.limit?.status === "rejected") {
      const others = profiles.filter((p) => p.id !== r.account?.id).map((p) => p.email ?? "compte du serveur");
      lines.push(
        `Limite de l'abonnement atteinte${s.limit.resetsAt ? `, reprise ${s.limit.resetsAt}` : ""}.` +
          (others.length ? ` Autre compte prêt : ${others.join(", ")}. Propose au propriétaire d'y passer (bouton de la session), elle reprendra d'elle-même.` : ""),
      );
    }
    const events = steps.filter((st) => st.kind === "user" || st.kind === "git" || st.kind === "notice").slice(-8);
    if (events.length) {
      lines.push("Dernières instructions et actions :");
      for (const st of events) {
        if (st.kind === "user") lines.push(`- ${st.by ?? "?"} a écrit à Claude Code : ${clipLine(st.text, 300)}`);
        else if (st.kind === "git") lines.push(`- ${st.ok ? "" : "ÉCHEC "}${st.action}${st.by ? ` par ${st.by}` : ""} : ${clipLine(st.text, 300)}`);
        else if (st.kind === "notice") lines.push(`- ${{ stopped: "Arrêtée", restart: "Interrompue par un redémarrage", error: "Erreur" }[st.code]}${st.text ? ` : ${clipLine(st.text, 300)}` : ""}`);
      }
    }
    if (r.result) lines.push(`Sa dernière réponse :\n${clipLine(r.result, 1500)}`);
    return lines.join("\n");
  });
  return [
    "# Sessions Claude Code de cette conversation",
    "État réel, relu à chaque message : il fait foi sur ce que tu croyais savoir. Le propriétaire peut piloter une session sans toi, depuis son panneau (instructions, autorisations, commit, push, PR, merge) : tout ce qu'il y a fait est ci-dessous.",
    "Règles :",
    "- Une session qui porte sur une tâche fait ce travail : ne le refais jamais toi-même en parallèle. Suis-la (claude_code_wait) ou écris-lui (claude_code_send).",
    "- Une session par tâche : une nouvelle issue ou fonctionnalité ouvre sa propre session (claude_code_start, avec le même project pour réutiliser le clone), jamais un claude_code_send à une session lancée pour autre chose.",
    "- N'affirme rien sur ce qu'une session a produit sans t'appuyer sur ce bloc ou sur claude_code_wait.",
    "- Si une session est bloquée (limite, erreur, autorisation), dis-le et demande au propriétaire comment continuer avant de changer d'approche.",
    "- Ne lance ni n'installe jamais le CLI `claude` dans ton terminal : passe par les outils claude_code_*.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

/**
 * The subscription ran out: Claude Code moves to another of the owner's accounts (the active one of
 * Settings › Models, for the engine too), and the session picks up where it stopped.
 */
export async function switchCodeSessionAccount(id: string, accountId: string | null, by: { id: string; name: string }, conversationId?: string) {
  const s = await load(id, conversationId);
  if (!(await claudeProfiles()).some((p) => p.id === accountId)) throw new CodeSessionError("invalid", "Unknown or signed-out Claude account.");
  await activateClaudeAccount(accountId, by.id);
  const limited = s.limit?.status === "rejected";
  s.limit = null;
  touch(s, [], true);
  if (limited && !s.running) instruct(s, { text: RESUME, by: by.name });
  return summary(s);
}

const RESUME = "Tu avais été arrêté par la limite de l'abonnement : reprends exactement là où tu t'étais arrêté.";

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
  if (s.prepare) {
    const { repo, branch, author } = s.prepare;
    try {
      gitStep(s, "clone", true, await prepareRepo(r.cwd, repo, { branch, author }), null);
      s.prepare = null;
    } catch (err) {
      if (!(err instanceof GitError)) throw err;
      gitStep(s, "clone", false, err.message, null);
      // Its instructions wait for the next one, which tries the clone again.
      s.held.push(...s.outbox.splice(0));
      return settle(s, "failed");
    }
    await refreshGit(s);
    touch(s, [], true);
  }
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
    // Nothing is asked: the owner chose to let the sessions act on their own (they still watch and can stop them).
    "--dangerously-skip-permissions",
    // None of the owner's hooks, CLAUDE.md or personal MCP servers; the project's own settings apply.
    "--setting-sources", "project",
    "--strict-mcp-config",
    ...((await sessionExists(r.id)) ? ["--resume", r.id] : ["--session-id", r.id]),
    ...(r.model ? ["--model", r.model] : []),
    ...(allowed.length ? ["--allowedTools", ...allowed] : []),
    ...r.permissions.dirs.flatMap((d) => ["--add-dir", d]),
    ...(env.CHROMIUM_PATH ? ["--append-system-prompt", browserNote(env.CHROMIUM_PATH)] : []),
  ];
  // git and gh reach GitHub with the vault's token (the clone's credential helper reads it from there).
  // The browsers it launches show on the conversation's screen.
  const spawnEnv = {
    ...(await claudeCodeEnv()),
    ...githubEnv(await githubToken()),
    ...(await screenEnv(r.conversationId, `code-${r.id}`).catch(() => ({}))),
  };
  // The account this run uses, shown in the panel (the active one of Settings › Models).
  const accountId = await activeClaudeAccountId();
  const profile = (await claudeProfiles().catch(() => [])).find((p) => p.id === accountId);
  r.account = { id: accountId, email: profile?.email ?? null, plan: profile?.plan ?? null };
  touch(s, [], true);
  const proc = Bun.spawn(args, { cwd: r.cwd, env: spawnEnv, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
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
    // It pushed, committed or opened a pull request: the panel shows it now, not at the end of the run.
    if (change.steps.some((st) => st?.kind === "tool" && st.status !== "running" && GIT_TOUCHING.test(`${st.input ?? ""}\n${st.output ?? ""}`))) {
      void rereadGit(s, false).catch((err) => console.error("code session: git state", err));
    }
    if (change.result) {
      result = change.result;
      r.result = result.text || null;
      // "You've hit your session limit · resets …": the run ends on it, sometimes without a rate-limit event.
      if (result.isError && LIMIT_HIT.test(result.text) && s.limit?.status !== "rejected") {
        s.limit = { status: "rejected", window: s.limit?.window ?? "session", ...(s.limit?.resetsAt && { resetsAt: s.limit.resetsAt }) };
      }
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
