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
  | { id: string; kind: "notice"; code: "stopped" | "restart" | "error"; text?: string }
  /** A git or GitHub action Agora ran for the session (clone, or the owner's from the panel); `text`: its outcome in one line. */
  | { id: string; kind: "git"; action: CodeGitAction; ok: boolean; text: string; by: string | null; detail?: string };

/** clone: the session's worktree prepared (the repository's clone fetched, the project's credentials written); worktree: its worktree deleted. */
export type CodeGitAction = "clone" | "commit" | "push" | "pr" | "merge" | "pull" | "worktree";

/**
 * A session started on a GitHub repository works in a git worktree of its own, from the clone the
 * repository's sessions share. Once it is done, its owner deletes the worktree: the branch stays in
 * the clone, and a new instruction checks it out again in a fresh worktree.
 */
export type CodeWorktree = {
  /** The branch it works on (the one checked out when it was deleted). */
  branch: string;
  /** Deleted, when. */
  removedAt: string | null;
};

/** A pull request of the session's branch on GitHub. */
export type CodePullRequest = {
  number: number;
  url: string;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  base: string;
};

/** Where the session's working directory stands, when it is a GitHub clone (read after each run and action). */
export type CodeGit = {
  /** owner/name on GitHub (null: another remote, or none). */
  repo: string | null;
  branch: string | null;
  /** The repository's default branch, target of the pull requests. */
  base: string | null;
  /** Files changed and not committed. */
  changes: number;
  /** Those files (the first 200), with their lines added and removed. */
  files?: CodeGitFile[];
  /** Commits not pushed (all of them when the branch was never pushed). */
  ahead: number;
  /** Commits of the pushed branch not pulled yet. */
  behind: number;
  /** The branch exists on GitHub. */
  pushed: boolean;
  lastCommit: { sha: string; subject: string } | null;
  pr: CodePullRequest | null;
  /** Agora has a GitHub token: pushing, pull requests and merging are possible. */
  github: boolean;
};

/** A file changed and not committed; lines are null for a binary. */
export type CodeGitFile = { path: string; state: "added" | "modified" | "deleted" | "renamed"; added: number | null; removed: number | null };

/**
 * Claude Code's permission mode, as in its terminal (shift+tab): default asks before each edit or
 * command, acceptEdits lets the edits through, plan only reads and writes a plan to approve,
 * bypassPermissions acts on its own (the sessions' default).
 */
export type CodePermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";

export const CODE_PERMISSION_MODES: CodePermissionMode[] = ["bypassPermissions", "acceptEdits", "default", "plan"];

/** A question Claude Code asks with its AskUserQuestion tool; "Other" (a free answer) is always possible. */
export type CodeQuestion = {
  question: string;
  /** Its short label (a chip in Claude Code). */
  header: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
};

/**
 * What Claude Code waits for from the owner.
 * tool: an action to allow (default and acceptEdits modes, or a tool it asks about);
 * question: its questions to answer (AskUserQuestion), `answers` keyed by question;
 * plan: its plan to approve (ExitPlanMode), or to send back with what to change.
 */
export type CodeApproval = {
  id: string;
  /** Missing: tool (sessions saved before questions and plans). */
  kind?: "tool" | "question" | "plan";
  tool: string;
  title: string;
  detail?: string;
  /** "session": allowed for the rest of this session, as Claude Code suggests it. A question can only be answered or dismissed ("deny"). */
  choices: ("once" | "session" | "deny")[];
  questions?: CodeQuestion[];
  /** The plan, in Markdown. */
  plan?: string;
};

/** The owner's answer to an approval: `answers` for a question, `feedback` when a plan goes back to planning. */
export type CodeApprovalAnswer = {
  choice: CodeApproval["choices"][number];
  answers?: Record<string, string>;
  feedback?: string;
};

/** The next mode, as Shift+Tab cycles them in Claude Code's terminal. */
export const nextCodeMode = (mode: CodePermissionMode) => CODE_PERMISSION_MODES[(CODE_PERMISSION_MODES.indexOf(mode) + 1) % CODE_PERMISSION_MODES.length]!;

/** A session's status in words (the codeSessions messages): what it waits for, when it waits. */
export function codeStatusText(
  t: { waitingQuestion: string; waitingPlan: string; status: Record<CodeSessionStatus, string> },
  session: { status: CodeSessionStatus; approval: CodeApproval | null },
) {
  if (session.status === "waiting" && session.approval?.kind === "question") return t.waitingQuestion;
  if (session.status === "waiting" && session.approval?.kind === "plan") return t.waitingPlan;
  return t.status[session.status];
}

/** What it waits for, in one line: the action and its target, or the question, or the plan's title. */
export const codeApprovalLine = (a: CodeApproval) => (a.kind === "question" || a.kind === "plan" ? a.title : `${a.tool} · ${a.title}`);

/** The value of "Other" among a question's picked options: the owner's own words. */
export const OTHER_ANSWER = "\u0000other";

/** One question's answer: the options picked, joined, and the owner's own words when "Other" is picked. */
export function questionAnswer(picked: string[], other: string) {
  const own = picked.includes(OTHER_ANSWER) ? other.trim() : "";
  return [...picked.filter((p) => p !== OTHER_ANSWER), ...(own ? [own] : [])].join(", ");
}

/** An item of Claude Code's task list (TodoWrite, or TaskCreate/TaskUpdate). */
export type CodeTodo = {
  id: string;
  content: string;
  /** What it says while doing it ("Running the tests"). */
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
};

/** A slash command the session knows: a skill (project's, or bundled with Claude Code) or a command. */
export type CodeCommand = {
  name: string;
  description: string;
  argumentHint?: string;
  skill: boolean;
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

/** A Claude account Claude Code can run on (Settings › Models): the server's login (id null) or one added. */
/** A GitHub repository a new session can work in (the instance's token reaches it). */
export type CodeRepo = { repo: string; private: boolean; pushedAt: string | null };

export type CodeAccount = { id: string | null; email: string | null; plan?: string | null };

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
  /** GitHub repository (owner/name) it was cloned from, when started on one. */
  repo: string | null;
  /** State of its clone (null: not a git repository, or not read yet); as it was last read, once its worktree is deleted. */
  git: CodeGit | null;
  /** Its worktree (null: a directory of its own, started without a repository or before worktrees). */
  worktree: CodeWorktree | null;
  model: string | null;
  /** Its permission mode, for the next run and the one under way. */
  mode: CodePermissionMode;
  /** Claude Code's task list, as it last wrote it. */
  todos: CodeTodo[];
  /** The slash commands and skills it offers (read at each run's start; empty before the first). */
  commands: CodeCommand[];
  /** The Claude account (profile) its last run used: id null for the server's own login. */
  account: CodeAccount | null;
  /** What it is doing right now, in one line (Claude Code's own summary, or the running tool). */
  activity: string | null;
  /** Subscription usage warning, as Claude Code reports it. */
  limit: CodeLimit | null;
  approval: CodeApproval | null;
  /** Last answer, once idle. */
  result: string | null;
  usage: CodeUsage | null;
  stepCount: number;
  /** The last instruction it was given, cut short, and its sender's name: what it is working on, and who asked. */
  instruction: { by: string | null; text: string } | null;
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
