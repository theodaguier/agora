/**
 * Claude Code sessions: a `claude` agent a bot (or its owner) starts on the
 * server, which everyone in the conversation can watch step by step, and the
 * owner can talk to, approve or stop (apps/api/src/code-sessions.ts).
 */

/**
 * running: working; waiting: an action is waiting for approval; idle: done with what it was asked,
 * ready for the next instruction; stopped: interrupted by someone; failed: the CLI ended on an error.
 */
export type CodeSessionStatus = "running" | "waiting" | "idle" | "stopped" | "failed";

export type CodeToolStatus = "running" | "done" | "error" | "denied";

export type CodeStep =
  /** What Claude Code writes between its actions (streamed). */
  | { id: string; kind: "text"; text: string; parentId?: string }
  | {
      id: string;
      kind: "tool";
      /** Claude Code's tool name: Bash, Edit, Read, Task… */
      name: string;
      /** One line: the command, the file, the pattern… */
      title: string;
      /** The detail of the call: full command, diff, file content, todo list… (truncated). */
      input?: string;
      /** What the tool returned (truncated). */
      output?: string;
      status: CodeToolStatus;
      /** A subagent's step: the Task/Agent call it belongs to. */
      parentId?: string;
    }
  /** An instruction sent to the session: the initial task, then each follow-up; `by` is the sender's name. */
  | { id: string; kind: "user"; text: string; by: string | null }
  /** stopped: by its owner; restart: the server restarted during a run; error: the CLI failed (`text`). */
  | { id: string; kind: "notice"; code: "stopped" | "restart" | "error"; text?: string };

/** An action Claude Code wants to run, waiting for the owner. */
export type CodeApproval = {
  id: string;
  tool: string;
  title: string;
  detail?: string;
  /** "session": allowed for the rest of this session, as Claude Code suggests it. */
  choices: ("once" | "session" | "deny")[];
};

/** The subscription is close to (warning) or at (rejected) one of its usage limits. */
export type CodeLimit = {
  status: "warning" | "rejected";
  /** Claude Code's window name: five_hour, seven_day… */
  window: string;
  /** 0 to 1. */
  utilization?: number;
  resetsAt?: string;
};

/** What a session consumed, all runs together (Claude Code's own count; cost: its API-price estimate). */
export type CodeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** Runs: one per instruction answered. */
  runs: number;
  /** Model calls. */
  turns: number;
  durationMs: number;
};

export type CodeSession = {
  id: string;
  conversationId: string;
  /** The bot that started it (null: started by its owner). */
  agentId: string | null;
  /** Owner of the subscription: the only one who can drive the session. */
  requestedBy: string | null;
  title: string;
  status: CodeSessionStatus;
  /** Working directory on the server. */
  cwd: string;
  model: string | null;
  /** What it is doing right now, in one line (Claude Code's own summary, or the running tool). */
  activity: string | null;
  /** Subscription usage warning, as Claude Code reports it. */
  limit: CodeLimit | null;
  approval: CodeApproval | null;
  /** Last answer, once idle. */
  result: string | null;
  usage: CodeUsage | null;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CodeSessionDetail = CodeSession & { steps: CodeStep[] };

/**
 * A session a bot started during its reply, kept with the reply: its card goes where the bot
 * was in its text when it started it (`after`: the end of the text written until then).
 */
export type CodeSessionRef = { id: string; title: string; after: string };

export type ReplyPart = { kind: "text"; text: string } | { kind: "code"; session: CodeSessionRef };

/**
 * A bot's reply cut where it started its Claude Code sessions: each card goes right after the text
 * the bot had written then. A session whose mark is not found (the text was reworded, or the mark
 * falls in a code block) goes before the text.
 */
export function placeCodeSessions(text: string, sessions: CodeSessionRef[] = []): ReplyPart[] {
  const before: ReplyPart[] = [];
  const parts: ReplyPart[] = [];
  let cursor = 0;
  for (const session of sessions) {
    const mark = session.after.trim();
    const at = mark ? text.indexOf(mark, cursor) : -1;
    const end = at + mark.length;
    // Inside a ``` block: cutting there would break its rendering.
    if (at < 0 || (text.slice(0, end).match(/```/g)?.length ?? 0) % 2 === 1) {
      before.push({ kind: "code", session });
      continue;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) parts.push({ kind: "text", text: chunk });
    parts.push({ kind: "code", session });
    cursor = end;
  }
  const rest = text.slice(cursor).trim();
  if (rest) parts.push({ kind: "text", text: rest });
  return [...before, ...parts];
}
