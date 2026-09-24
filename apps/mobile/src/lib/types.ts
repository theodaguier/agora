import type { ConversationEvent } from "@agora/core";

/* The API's shapes, as in apps/web/src/lib/api.ts (same names). */

export type AvatarShape = "bean" | "pill" | "triangle" | "shield" | "circle" | "cloud" | "drop";

export type AgentAvatarSpec = { shape: AvatarShape; color: string };

export type AgentSummary = { id: string; name: string; avatar: AgentAvatarSpec; onboarding?: boolean };

export type Person = { id: string; name: string; image: string | null; username?: string | null; title?: string };

/** Colleague's profile, as everyone sees it. */
export type UserProfile = {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  title: string;
  bio: string;
  email: string;
  createdAt: string;
  currentTask: { id: string; title: string; status: TaskStatus } | null;
};

export type ConversationKind = "direct" | "group";

/** Sidebar row. */
export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  members: Person[];
  agents: AgentSummary[];
  preview: { text: string; event: ConversationEvent | null; author: string | null; fromMe: boolean } | null;
  lastAt: string;
  unread: boolean;
};

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  assignees: { id: string; name: string; image: string | null; current: boolean }[];
};

/** The signed-in account, from Better Auth's session. */
export type SessionUser = { id: string; name: string; email: string; image: string | null; role: string | null };

/* ---------- Conversation ---------- */

/** Approval requested by the agent during its turn (sensitive command, question from an MCP server). */
export type PendingApproval = { id: string; command: string; description: string; choices: ("once" | "session" | "always" | "deny")[] };

/** Bot reply being written. */
export type ActiveTurn = {
  turnId: string;
  agentId: string;
  requestedBy: string | null;
  text: string;
  tools: { name: string; status: string }[];
  approval?: PendingApproval | null;
};

export type ConversationDetail = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  createdBy: string | null;
  members: Person[];
  agents: AgentSummary[];
  turns: ActiveTurn[];
};

export type Author =
  | { kind: "user"; id: string; name: string; image: string | null }
  | { kind: "agent"; id: string; name: string; avatar: AgentAvatarSpec }
  | null;

export type Attachment = { id: string; name: string; mime: string; size: number };

/** Snapshot of the message being answered, frozen at send time. */
export type ReplyTo = { id: string; authorName: string; text: string; attachment?: Pick<Attachment, "id" | "name" | "mime"> };

/** In a group, `agentId` is the bot whose skill was picked. A routine is designated by its Hermes job id. */
export type Invocation = { kind: "skill" | "mcp"; name: string; agentId?: string } | { kind: "routine"; id: string; name: string };

export const invocationKey = (v: Invocation) =>
  v.kind === "routine" ? `routine:${v.id}` : v.agentId ? `${v.kind}:${v.agentId}:${v.name}` : `${v.kind}:${v.name}`;

/** Multiple-choice question asked by a bot (```choices``` block in its reply). */
export type Choices = { question: string; hint?: string; options: { label: string; description?: string }[] };

/** Form posted by a bot (```questions``` block in its reply). */
export type Questions = {
  title?: string;
  questions: { label: string; hint?: string; type: "single" | "multi" | "text"; options: { label: string; description?: string }[]; required: boolean }[];
};

export type McpRequest = {
  id: string;
  name: string;
  title: string;
  description: string;
  transport: "remote" | "stdio";
  url: string | null;
  command: string | null;
  env: { name: string; description?: string; required: boolean; secret: boolean }[];
  auth: "none" | "header" | "oauth";
  docsUrl: string | null;
  status: "pending" | "approved" | "authorizing" | "installed" | "rejected";
  error: string | null;
  tools: string[] | null;
  agentId: string | null;
  conversationId: string | null;
  createdAt: string;
  canDecide: boolean;
  canConnect: boolean;
  /** Integration type (known or guessed from the name). */
  type: import("@agora/core").IntegrationType;
  /** OAuth callback to declare in the service when using one's own OAuth client. */
  redirectUri?: string | null;
};

export type SkillRequest = {
  id: string;
  /** `install`: from the hub, for the bot; `create`: written by the bot (its SKILL.md in `content`), for every bot. */
  kind: "install" | "create";
  identifier: string;
  name: string;
  reason: string;
  description: string;
  category: string | null;
  content: string | null;
  status: "pending" | "installing" | "installed" | "rejected";
  error: string | null;
  agentId: string | null;
  conversationId: string | null;
  createdAt: string;
  canDecide: boolean;
};

export type Message = {
  id: string;
  kind: "user" | "bot" | "event";
  text: string;
  data: {
    tools?: { name: string; status: string }[];
    /** Approvals granted or denied during the turn. */
    approvals?: { command: string; choice: string; by: string | null }[];
    attachments?: Attachment[];
    invocations?: Invocation[];
    choices?: Choices;
    questions?: Questions;
    mentions?: string[];
    /** MCP connector request issued by the bot (request id). */
    mcpRequest?: string;
    /** Skill request issued by the bot (request id). */
    skillRequest?: string;
    replyTo?: ReplyTo;
    /** Forwarded message: its original author. */
    forwarded?: { authorName: string };
    /** System message parameters, rendered in the reader's language. */
    event?: import("@agora/core").ConversationEvent;
    /** Views of connector data shown by the bot (```view``` block). */
    views?: import("@agora/core").ViewBlock[];
    /** Employee's answer to a draft the bot showed. */
    viewAction?: import("@agora/core").ViewAction;
  } | null;
  createdAt: string;
  author: Author;
};

/** A pinned message, or one of its files. */
export type Pin = { id: string; pinnedAt: string; pinnedBy: string | null; message: Message; attachment: Attachment | null };

/** What a pin points to: a message, or one of its files. */
export type PinTarget = { messageId: string; attachmentId?: string };

/** Models offered for a conversation (the composer's picker). */
export type ModelOptions = {
  provider: string;
  defaultModel: string;
  models: { id: string; reasoning: boolean }[];
  /** Other providers signed in on Hermes, usable for this thread. */
  others: { provider: string; models: { id: string; reasoning: boolean }[] }[];
  /** Is the profile's default model allowed for this employee? */
  defaultAllowed: boolean;
  /** Model chosen for this conversation (null = the agent's). */
  selected?: string | null;
  /** Provider of the chosen model ("claude-code" = Claude Code engine). */
  selectedProvider?: string | null;
  /** Claude Code engine, offered only to the subscription holder, in private conversations. */
  claudeCode?: {
    provider: string;
    label: string;
    models: { id: string; reasoning: boolean; label?: string; description?: string }[];
  } | null;
};
