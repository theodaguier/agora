import type { ConversationEvent, IntegrationType, ViewAction, ViewBlock } from "@agora/core";
import { defineMessages, getLocale, tr } from "@/i18n";

const messages = defineMessages({
  en: { avatarUploadFailed: "Couldn't upload the photo." },
  fr: { avatarUploadFailed: "Envoi de la photo impossible." },
});
import type { AvatarShape } from "./agent-avatar";

export type AgentAvatarSpec = { shape: AvatarShape; color: string };

export type AgentSummary = { id: string; name: string; avatar: AgentAvatarSpec; onboarding: boolean };

/** A bot's profile, as everyone sees it; `access`: you may write to it. */
export type AgentProfile = AgentSummary & { createdAt: string; access: boolean };

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
  /** When they joined. */
  createdAt: string;
  /** What they're working on right now. */
  currentTask: { id: string; title: string; status: TaskStatus } | null;
};

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Day it is due (YYYY-MM-DD), or null. */
  dueOn: string | null;
  /** People working on it. */
  /** People working on it; `current`: it's what they're working on right now. */
  assignees: { id: string; name: string; image: string | null; current: boolean }[];
  /** The bot that assigned it, otherwise the colleague. */
  assignedBy:
    | { kind: "agent"; id: string; name: string; avatar: AgentAvatarSpec }
    | { kind: "user"; id: string; name: string; image: string | null }
    | null;
  /** For a bot's task: the colleague whose conversation it came from. */
  requestedBy: { id: string; name: string } | null;
  conversationId: string | null;
  completedAt: string | null;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

/** Figures of one part of the morning recap: the whole team, or the signed-in account. */
export type DigestStats = {
  tasks: { done: number; created: number; open: number; overdue: number };
  messages: number;
  conversations: number;
  agents: number;
  /** Null when usage is shown to admins only. */
  usage: {
    tokens: number;
    cost: number;
    byAgent: { id: string; name: string; avatar: AgentAvatarSpec; tokens: number; cost: number }[];
    byModel: { provider: string; model: string; tokens: number; cost: number }[];
  } | null;
  /** Local hours ("00"–"23") when the period is one day, days (YYYY-MM-DD) otherwise. */
  series: { t: string; messages: number; tokens: number; tasksDone: number }[];
  /** Most active members (team part). */
  people?: { id: string; name: string; image: string | null; tasksDone: number; messages: number }[];
};

/** Morning recap (08:30): the previous day, or the previous week on Mondays. Texts mention people as @handle and bots as @Name. */
export type Digest = {
  id: string;
  /** Day it was written (YYYY-MM-DD). */
  day: string;
  kind: "daily" | "weekly";
  /** Days covered, inclusive (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
  team: { headline: string; done: string[]; inProgress: string[]; next: string[] };
  /** Addressed to the signed-in account; null when they had nothing going on. */
  personal: { headline: string; done: string[]; next: string[]; attention: string[]; stats: DigestStats | null } | null;
  stats: DigestStats | null;
  /** Every bot, so their mentions show with their avatar. */
  agents: AgentSummary[];
  createdAt: string;
  seen: boolean;
};

/** Morning recap settings (admin). Days: 0 = Sunday … 6 = Saturday. */
export type DigestConfig = { enabled: boolean; time: string; days: number[]; weeklyDay: number | null; personal: boolean; usageForMembers: boolean };

export type DigestAdmin = {
  config: DigestConfig;
  timezone: string;
  last: { day: string; kind: Digest["kind"]; periodStart: string; periodEnd: string; status: "ready" | "empty" | "failed"; error: string | null; updatedAt: string } | null;
  next: { day: string; time: string; kind: Digest["kind"] } | null;
  running: boolean;
};

/** Profile editable by its owner (and prefilled by an invitation). */
export type ProfileInput = { firstName: string; lastName: string; title: string; username?: string; bio?: string };

export type ConversationKind = "direct" | "group";

/** Sidebar row. */
export type InboxKind = "mention" | "reply" | "task.assigned" | "task.done";

/** A mention, a reply or a task that concerns you. */
export type InboxItem = {
  id: string;
  kind: InboxKind;
  /** Excerpt of the message, or the task's title when it was sent. */
  text: string;
  read: boolean;
  createdAt: string;
  conversationId: string | null;
  messageId: string | null;
  task: { id: string; title: string; status: TaskStatus } | null;
  actor: { kind: "agent"; id: string; name: string; avatar: AgentAvatarSpec } | { kind: "user"; id: string; name: string; image: string | null } | null;
};

export type Inbox = { items: InboxItem[]; unread: number };

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

/** Bot reply being written. */
/** Approval requested by the agent during its turn (sensitive command, question from an MCP server). */
export type PendingApproval = { id: string; command: string; description: string; choices: ("once" | "session" | "always" | "deny")[] };

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

/** A routine is designated by its Hermes job id; its name is only for display. */
/** In a group, `agentId` is the bot whose skill was picked. */
export type Invocation = { kind: "skill" | "mcp"; name: string; agentId?: string } | { kind: "routine"; id: string; name: string };

export const invocationKey = (v: Invocation) =>
  v.kind === "routine" ? `routine:${v.id}` : v.agentId ? `${v.kind}:${v.agentId}:${v.name}` : `${v.kind}:${v.name}`;

/** Multiple-choice question asked by a bot (```choices``` block in its reply). */
export type Choices = { question: string; hint?: string; options: { label: string; description?: string }[] };

export type McpRequest = {
  id: string;
  name: string;
  title: string;
  description: string;
  transport: "remote" | "stdio";
  url: string | null;
  command: string | null;
  env: import("@agora/core").McpEnvField[];
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
  type: IntegrationType;
  /** OAuth: address to declare when registering a client by hand with the provider. */
  redirectUri: string | null;
};

/** One of the app's own integrations (Settings › Integrations); secret values come redacted. */
export type AppIntegration = {
  id: "resend" | "logodev";
  source: "app" | "env" | null;
  values: Record<string, string>;
};

/** What the chat needs to draw brand logos. */
export type Brands = {
  /** logo.dev is set up: logos are served by the API (/integrations/logo). */
  logos: boolean;
  /** Known MCP servers, with the brand's domain when their URL gives it. */
  servers: Record<string, string | null>;
};

/** Form posted by a bot (```questions``` block in its reply). */
export type Questions = {
  title?: string;
  questions: { label: string; hint?: string; type: "single" | "multi" | "text"; options: { label: string; description?: string }[]; required: boolean }[];
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
    event?: ConversationEvent;
    /** Views of connector data shown by the bot (```view``` block). */
    views?: ViewBlock[];
    /** Employee's answer to a draft the bot showed. */
    viewAction?: ViewAction;
  } | null;
  createdAt: string;
  author: Author;
};

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
  /** Provider of the chosen model ("claude-code", "codex": the subscription engines). */
  selectedProvider?: string | null;
  /** Claude Code engine, offered only to the subscription holder. */
  claudeCode?: SubscriptionModels | null;
  /** Codex engine, offered only to the subscription holder. */
  codex?: SubscriptionModels | null;
};

/** Models of a subscription engine (Claude Code, Codex), under its own heading in the picker. */
export type SubscriptionModels = {
  provider: string;
  label: string;
  models: { id: string; reasoning: boolean; label?: string; description?: string }[];
};

export type Toolset = {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
  /** Gives the server to whoever talks to the agent: off by default, turned on only after a warning. */
  risky?: boolean;
};

export type Skill = { name: string; description: string; category?: string; enabled: boolean; provenance?: string };

export type HubSkill = { name: string; description: string; source: string; identifier: string; trust_level?: string };

export type McpServer = {
  name: string;
  transport?: string;
  url?: string;
  command?: string;
  enabled?: boolean;
  auth?: string;
  /** Integration type; `typeSet` false = guessed, never chosen by an admin. */
  type: IntegrationType;
  typeSet: boolean;
};

/** Server from the official MCP registry, already translated into Hermes config by the API. */
export type RegistryMcp = {
  id: string;
  name: string;
  hermesName: string;
  description: string;
  url?: string;
  verified: boolean;
  transport: "remote" | "stdio";
  bearer: boolean;
  env: { name: string; description?: string; required: boolean; secret: boolean }[];
  command?: string;
};

export type McpCatalogEntry = {
  name: string;
  description: string;
  transport: string;
  auth_type?: string;
  required_env: (string | { name: string; description?: string })[];
  post_install?: string;
  installed: boolean;
  enabled: boolean;
};

export type Plugin = { name: string; status: string; version?: string; description?: string; source?: string };

export type PluginIndexEntry = { name: string; description?: string; identifier?: string; repo?: string; url?: string };

export const attachmentUrl = (id: string, download = false) => `/api/attachments/${encodeURIComponent(id)}${download ? "?download" : ""}`;

export async function uploadAttachment(conversationId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/attachments`, {
    method: "POST",
    credentials: "include",
    headers: localeHeader(),
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as Attachment;
}

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
  username: string | null;
  title: string;
  agents: string[];
};

export type AdminInvitation = {
  id: string;
  email: string;
  role: "admin" | "user";
  expiresAt: string;
  createdAt: string;
};

/** Invitation send response: without email configured, the link must be passed on by hand. */
export type InvitationSent = { sent: boolean; link: string | null; error?: string };

/** Uploads the (already cropped) photo of the signed-in account. */
export async function uploadAvatar(image: Blob, path = "/me/avatar") {
  const res = await fetch(`/api${path}`, { method: "PUT", credentials: "include", headers: { "Content-Type": image.type, ...localeHeader() }, body: image });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? tr(messages).avatarUploadFailed);
  return (await res.json()) as { image: string };
}

export type AdminModels = {
  /** Providers signed in on the agents' Hermes profiles, and Claude Code's, with their models. */
  providers: {
    provider: string;
    models: { id: string; reasoning: boolean; label?: string }[];
    /** Only this employee can use it (Claude Code: personal subscription). */
    onlyFor: string | null;
  }[];
  /** Forbidden models (`provider::model`) per employee. */
  blocked: Record<string, string[]>;
  /** Profiles whose models Hermes could not provide. */
  unreachable: number;
};

export type AdminAgent = {
  id: string;
  name: string;
  hermesProfile: string;
  avatarShape: AvatarShape;
  avatarColor: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Interface language, so the API answers errors and messages in it. */
export const localeHeader = () => ({ "X-Agora-Locale": getLocale() });

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...localeHeader(), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body).error ?? body;
    } catch {}
    // The organization started requiring two-step verification during this session.
    if (res.status === 403 && message === "two_factor_required") window.location.assign("/two-factor");
    throw new ApiError(res.status, message);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const conversationPath = (id: string, rest = "") => `/conversations/${encodeURIComponent(id)}${rest}`;

/** Sends a message; bot replies then arrive through the realtime stream. */
export const sendMessage = (
  conversationId: string,
  input: { text: string; attachmentIds: string[]; invocations: Invocation[]; mentions: string[]; replyTo?: string; viewAction?: ViewAction },
) => api<Message>(conversationPath(conversationId, "/messages"), { method: "POST", body: JSON.stringify(input) });

/** /new and /compact: the bot starts over on a new Hermes session (with a summary for /compact). */
export const sessionCommand = (conversationId: string, action: "new" | "compact") =>
  api<void>(conversationPath(conversationId, "/session"), { method: "POST", body: JSON.stringify({ action }) });

/** /retry: the bot answers the employee's last message again. */
export const retryLast = (conversationId: string) => api<{ turnId: string }>(conversationPath(conversationId, "/retry"), { method: "POST" });

/** A pinned message, or one of its files. */
export type Pin = { id: string; pinnedAt: string; pinnedBy: string | null; message: Message; attachment: Attachment | null };

/** What a pin points to: a message, or one of its files. */
export type PinTarget = { messageId: string; attachmentId?: string };

export const setPinned = (conversationId: string, target: PinTarget, pinned: boolean) =>
  api<void>(conversationPath(conversationId, "/pins"), { method: pinned ? "POST" : "DELETE", body: JSON.stringify(target) });

/** Forwards a message to other conversations; its files are copied. */
export const forwardMessage = (conversationId: string, messageId: string, conversationIds: string[]) =>
  api<{ ids: string[] }>(conversationPath(conversationId, `/messages/${encodeURIComponent(messageId)}/forward`), {
    method: "POST",
    body: JSON.stringify({ conversationIds }),
  });
