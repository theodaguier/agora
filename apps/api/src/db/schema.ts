import { type AnyPgColumn, boolean, customType, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import type { AbsenceKind, IntegrationType, McpEnvField, WeeklyHours } from "@agora/core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/* ---------- Better Auth (+ plugin admin) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  /** "First Last", kept in sync from firstName and lastName. */
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  /** Profile photo URL (`/api/users/<id>/avatar?v=…`). */
  image: text("image"),
  /** Access level (admin plugin): "admin" or "user". */
  role: text("role").default("user"),
  firstName: text("first_name").default("").notNull(),
  lastName: text("last_name").default("").notNull(),
  /** Public handle, lowercase; optional. */
  username: text("username").unique(),
  bio: text("bio").default("").notNull(),
  /** Role displayed depending on context (spouse, developer…), distinct from the `role` access level. */
  title: text("title").default("").notNull(),
  /** Language agents use to reply to this account; null = the organization's language. */
  locale: text("locale").$type<"fr" | "en">(),
  /** Time zone of their working hours; null = the organization's. */
  timezone: text("timezone"),
  /** Working hours per weekday, Monday first (@agora/core availability); null = none set. */
  workHours: jsonb("work_hours").$type<WeeklyHours>(),
  /** Manual "do not disturb" until this instant. */
  dndUntil: timestamp("dnd_until"),
  /** Last time the account had the app open (SSE stream), for "seen 5 min ago". */
  lastSeenAt: timestamp("last_seen_at"),
  /** Task they're working on right now, shown on their profile; cleared when it's done or they leave it. */
  /** Version of the last "What's new" release the account has seen (apps/web/src/lib/whats-new.ts). */
  releaseNotesSeen: text("release_notes_seen"),
  /** Id of the last morning recap the account has seen (digest.ts). */
  digestSeen: text("digest_seen"),
  currentTaskId: text("current_task_id").references((): AnyPgColumn => task.id, { onDelete: "set null" }),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  /** TOTP two-factor sign-in turned on (twoFactor plugin). */
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ...timestamps,
});

/** Leave, sick days…: whole local days in the employee's time zone, `endOn` included. */
export const absence = pgTable(
  "absence",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AbsenceKind>().notNull(),
    startOn: date("start_on", { mode: "string" }).notNull(),
    endOn: date("end_on", { mode: "string" }).notNull(),
    /** Seen by the employee and admins only. */
    note: text("note").default("").notNull(),
    createdBy: text("created_by").references((): AnyPgColumn => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("absence_user_idx").on(t.userId, t.endOn)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ...timestamps,
});

/** TOTP secret and backup codes (twoFactor plugin), both encrypted by Better Auth. */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** False until the first code is checked: the sign-in doesn't ask for it before. */
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (t) => [index("two_factor_user_id_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

/* ---------- Agora ---------- */

/** Profile photo, cropped client-side (small WebP): stored in the database to survive redeploys. */
export const userAvatar = pgTable("user_avatar", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Organization logo (single row, id "org"), cropped client-side like profile photos. */
export const orgAvatar = pgTable("org_avatar", {
  id: text("id").primaryKey(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Brand logos fetched from logo.dev (Settings › Integrations), served by the
 * API: each brand costs one logo.dev request per refresh, whatever the number
 * of viewers. `data` null = logo.dev doesn't know the brand (remembered too).
 */
export const brandLogo = pgTable("brand_logo", {
  /** "d:pennylane.com" (by domain) or "n:google calendar" (by name). */
  key: text("key").primaryKey(),
  mime: text("mime"),
  data: bytea("data"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

/**
 * Invitation sent by email: the admin only provides the address and access level;
 * the invitee fills in their own profile and password when opening the link.
 * Only the token hash is kept.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").$type<"admin" | "user">().default("user").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("invitation_email_idx").on(t.email)],
);

/**
 * Mobile app pairing: the web app shows a QR code holding a short-lived, single-use code;
 * the app exchanges it for its own session (bearer token), separate from the browser's.
 * Only the code hash is kept. Once used, the row names the device and follows its session:
 * revoking the session (sign-out, "disconnect" from the web) removes the row.
 */
export const mobileLink = pgTable(
  "mobile_link",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    sessionId: text("session_id").references(() => session.id, { onDelete: "cascade" }),
    /** Device name sent by the app ("iPhone de Théo"). */
    deviceName: text("device_name").default("").notNull(),
    /** Expo push token of the app on this device (null: notifications off or not granted). */
    pushToken: text("push_token"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("mobile_link_user_idx").on(t.userId)],
);

export type AvatarShape ="bean" | "pill" | "triangle" | "shield" | "circle" | "cloud" | "drop";

/** An agent = a Hermes profile. */
export const agent = pgTable("agent", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  hermesProfile: text("hermes_profile").notNull().unique(),
  avatarShape: text("avatar_shape").$type<AvatarShape>().notNull(),
  avatarColor: text("avatar_color").notNull(),
  /** Created from the app: the agent sets itself up through conversation until it writes its profile. */
  onboarding: boolean("onboarding").default(false).notNull(),
  /** Incremented when the personality changes: threads restart on a new Hermes session. */
  revision: integer("revision").default(0).notNull(),
  ...timestamps,
});

/** Which agents each employee may use. */
export const agentAccess = pgTable(
  "agent_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.agentId] })],
);

/** Models forbidden to an employee, in Hermes's `provider::model` format; everything else is allowed. */
export const modelBlock = pgTable(
  "model_block",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.model] })],
);

export type ConversationKind = "direct" | "group";

/**
 * Direct conversation (employee ↔ bot, employee ↔ employee) or group.
 * Former (employee, agent) threads became direct conversations, keeping
 * their id and therefore their Hermes session.
 */
export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<ConversationKind>().notNull(),
  /** Group name; null = title derived from participants. */
  title: text("title"),
  /** Sorted pair of a direct conversation's participants (`a:<agent>|u:<user>`, `u:<a>|u:<b>`). */
  directKey: text("direct_key").unique(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  /** Group a bot opened from a direct conversation by mentioning other bots there. */
  originId: text("origin_id").references((): AnyPgColumn => conversation.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Humans in a conversation. */
export const conversationMember = pgTable(
  "conversation_member",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_member_user_idx").on(t.userId)],
);

/** Bots in a conversation, each with its own Hermes session. */
export const conversationAgent = pgTable(
  "conversation_agent",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agent.id, { onDelete: "cascade" }),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    /** Model chosen for this bot here; null = the Hermes profile's default model. */
    model: text("model"),
    /** Date of the last group message already passed to this bot. */
    seenUntil: timestamp("seen_until"),
    /** Incremented by /new and /compact: the bot starts over on a new Hermes session. */
    sessionGeneration: integer("session_generation").default(0).notNull(),
    /** Summary left by /compact, passed with the next message of the new session. */
    carryOver: text("carry_over"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.agentId] }), index("conversation_agent_agent_idx").on(t.agentId)],
);

/**
 * Bot turn queued or under way (bot-runner.ts), deleted when it ends: after a
 * restart of the API, queued turns are resumed and interrupted ones reported.
 */
export const pendingTurn = pgTable("pending_turn", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agent.id, { onDelete: "cascade" }),
  triggerId: text("trigger_id").notNull(),
  requestedBy: text("requested_by"),
  /** How the turn was called, and the exchange between bots it belongs to. */
  options: jsonb("options").$type<{ implicit?: "reply" | "named" | "followUp"; answer?: boolean; retry?: boolean; chainId: string; relays: number }>().notNull(),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MessageKind = "user" | "bot" | "event";

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MessageKind>().notNull(),
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    authorAgentId: text("author_agent_id").references(() => agent.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("message_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

/** File uploaded to a conversation, readable by the agents' file tools. */
export const attachment = pgTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    /** Absolute path, readable by the agent's file tools. */
    path: text("path").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attachment_conversation_idx").on(t.conversationId)],
);

/**
 * Message pinned in a conversation, or one of its files when `attachmentId` is set.
 * Shared by every member of the conversation.
 */
export const pin = pgTable(
  "pin",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    attachmentId: text("attachment_id").references(() => attachment.id, { onDelete: "cascade" }),
    pinnedBy: text("pinned_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("pin_conversation_idx").on(t.conversationId), unique("pin_target_uq").on(t.messageId, t.attachmentId).nullsNotDistinct()],
);

/** Company settings (e.g. memory shared by all agents). */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** pending → approved → (authorizing →) installed; or rejected. `error` keeps the last failure. */
export type McpRequestStatus = "pending" | "approved" | "authorizing" | "installed" | "rejected";
export type McpEnvVar = McpEnvField;

/**
 * MCP servers added from the app (requested by a bot, approved by an admin).
 * The declaration lives here; Hermes only receives a copy at install time.
 * Secrets are never stored here: they go straight into Hermes's .env.
 */
export const mcpServer = pgTable(
  "mcp_server",
  {
    id: text("id").primaryKey(),
    /** Server name in Hermes (tools `mcp__<name>__*`). */
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    url: text("url"),
    command: text("command"),
    args: jsonb("args").$type<string[]>().default([]).notNull(),
    env: jsonb("env").$type<McpEnvVar[]>().default([]).notNull(),
    auth: text("auth").$type<"none" | "header" | "oauth">().default("none").notNull(),
    /** Documentation or repository the bot got the configuration from. */
    docsUrl: text("docs_url"),
    status: text("status").$type<McpRequestStatus>().default("pending").notNull(),
    error: text("error"),
    tools: jsonb("tools").$type<string[]>(),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    ...timestamps,
  },
  (t) => [index("mcp_server_status_idx").on(t.status)],
);

/**
 * Integration type of an MCP server (mail, calendar…), whatever its source:
 * catalog, registry, custom or requested by a bot. Keyed by the Hermes server
 * name, since catalog and registry servers have no `mcp_server` row.
 */
export const mcpIntegration = pgTable("mcp_integration", {
  server: text("server").primaryKey(),
  type: text("type").$type<IntegrationType>().notNull(),
  ...timestamps,
});

export type SkillRequestStatus ="pending" | "installing" | "installed" | "rejected";
/** `install`: a hub skill; `create`: a skill written by the bot itself. */
export type SkillRequestKind = "install" | "create";

/**
 * Skill a bot requests: from the hub for itself, or written by the bot and
 * shared with every bot. Installed once approved.
 */
export const skillRequest = pgTable(
  "skill_request",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<SkillRequestKind>().default("install").notNull(),
    /** Hermes hub identifier (official/…, skills-sh/owner/repo/skill, github…); the skill's name for `create`. */
    identifier: text("identifier").notNull(),
    name: text("name").notNull(),
    reason: text("reason").default("").notNull(),
    /** `create`: the SKILL.md written by the bot, its description and category. */
    description: text("description").default("").notNull(),
    category: text("category"),
    content: text("content"),
    status: text("status").$type<SkillRequestStatus>().default("pending").notNull(),
    error: text("error"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    ...timestamps,
  },
  (t) => [index("skill_request_status_idx").on(t.status)],
);

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

/**
 * Task shared by the people working on it (`taskAssignee`), created by a
 * colleague or by a bot (```tasks``` block). It shows in the tasks of its
 * creator and of each assignee, visible to everyone, and in the agents' context.
 */
export const task = pgTable(
  "task",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    status: text("status").$type<TaskStatus>().default("todo").notNull(),
    priority: text("priority").$type<TaskPriority>().default("normal").notNull(),
    /** Day the task is due (no time); null = no deadline. */
    dueOn: date("due_on", { mode: "string" }),
    /** Employee who created it; for a bot's task, the employee whose turn it was. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Bot that assigned it, if any. */
    agentId: text("agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at"),
    ...timestamps,
  },
  (t) => [index("task_status_idx").on(t.status), index("task_created_by_idx").on(t.createdBy)],
);

/** People working on a task. */
export const taskAssignee = pgTable(
  "task_assignee",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignee_user_idx").on(t.userId)],
);

/* ---------- Inbox ---------- */

/**
 * - `mention`: someone (colleague or bot) wrote your @handle in a group;
 * - `reply`: someone replied to one of your messages in a group;
 * - `task.assigned`: you were put on a task by someone else;
 * - `task.done`: someone else completed a task you created.
 */
export type NotificationKind = "mention" | "reply" | "task.assigned" | "task.done";

/** What lands in someone's inbox; the author is a colleague or a bot. */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorAgentId: text("actor_agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => message.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => task.id, { onDelete: "cascade" }),
    /** Excerpt of the message, or the task's title when it was sent. */
    text: text("text").default("").notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notification_user_created_idx").on(t.userId, t.createdAt)],
);

/* ---------- Token usage ---------- */

/** "chat": a turn in a conversation; "cron": a Hermes scheduled job; "system": internal work (memory curator…). */
export type UsageSource = "chat" | "cron" | "system";

/**
 * Tokens consumed by one slice of activity, attributed to who and what caused it.
 * Hermes rows are deltas of its per-session counters (state.db); Claude Code and Codex rows come from each reply's result.
 * Cost is estimated when read, from the current prices; `reportedCostUsd` is the engine's own estimate, if any.
 */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    occurredAt: timestamp("occurred_at").notNull(),
    engine: text("engine").$type<"hermes" | "claude-code" | "codex">().notNull(),
    profile: text("profile"),
    sessionId: text("session_id"),
    source: text("source").$type<UsageSource>().notNull(),
    /** Cron job id, or the internal task's name (e.g. "curator"). */
    taskId: text("task_id"),
    taskName: text("task_name"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    provider: text("provider").default("").notNull(),
    model: text("model").notNull(),
    apiCalls: integer("api_calls").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0).notNull(),
    reportedCostUsd: doublePrecision("reported_cost_usd").default(0).notNull(),
  },
  (t) => [
    index("usage_event_occurred_idx").on(t.occurredAt),
    index("usage_event_user_idx").on(t.userId, t.occurredAt),
    index("usage_event_agent_idx").on(t.agentId, t.occurredAt),
  ],
);

/** Last Hermes counters already turned into usage events, per (profile, session, model, task). */
export const usageCursor = pgTable(
  "usage_cursor",
  {
    profile: text("profile").notNull(),
    sessionId: text("session_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    task: text("task").notNull(),
    apiCalls: integer("api_calls").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0).notNull(),
    costUsd: doublePrecision("cost_usd").default(0).notNull(),
    /** Hermes `last_seen` (epoch seconds) of the row when read. */
    lastSeen: doublePrecision("last_seen").notNull(),
  },
  (t) => [primaryKey({ columns: [t.profile, t.sessionId, t.provider, t.model, t.task] })],
);

/**
 * Who a Hermes session's tokens belong to, set at the start of each turn:
 * in a group the same session serves several employees in turn.
 */
export const usageAttribution = pgTable(
  "usage_attribution",
  {
    profile: text("profile").notNull(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agent.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversation.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.profile, t.sessionId] })],
);

/** Price set by an admin for a model, in USD per million tokens; overrides the models.dev price. */
export const modelPrice = pgTable(
  "model_price",
  {
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    input: doublePrecision("input").notNull(),
    output: doublePrecision("output").notNull(),
    cacheRead: doublePrecision("cache_read").notNull(),
    cacheWrite: doublePrecision("cache_write").notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.model] })],
);

/* ---------- Morning recap ---------- */

export type DigestKind = "daily" | "weekly";
export type DigestStatus = "ready" | "empty" | "failed";

/** Team part of a recap, written by the AI from shared material only (tasks, group conversations). */
export type DigestTeam = { headline: string; done: string[]; inProgress: string[]; next: string[] };
/** Part addressed to one person, from their own tasks and conversations. */
export type DigestPersonal = { headline: string; done: string[]; next: string[]; attention: string[] };
/** Figures of one part of a recap, computed from its own scope (the whole team, or one person). */
export type DigestStats = {
  tasks: { done: number; created: number; open: number; overdue: number };
  /** Team: every message; personal: the messages the person wrote. */
  messages: number;
  conversations: number;
  /** Bots that were active (team) or that the person worked with. */
  agents: number;
  /** Null when hidden from the reader (usage shown to admins only). */
  usage: {
    tokens: number;
    /** Estimated, in USD. */
    cost: number;
    byAgent: { id: string; name: string; avatar: { shape: AvatarShape; color: string }; tokens: number; cost: number }[];
    byModel: { provider: string; model: string; tokens: number; cost: number }[];
  } | null;
  /** Local hours ("00"–"23") when the period is one day, days (YYYY-MM-DD) otherwise. */
  series: { t: string; messages: number; tokens: number; tasksDone: number }[];
  /** Most active members; team part only. */
  people?: { id: string; name: string; image: string | null; tasksDone: number; messages: number }[];
};

/**
 * Recap written every morning (08:30, organization time zone) of the previous
 * day, or of the previous week on Mondays. One per local day.
 */
export const digest = pgTable("digest", {
  id: text("id").primaryKey(),
  /** Local day it was written for (YYYY-MM-DD). */
  day: date("day", { mode: "string" }).notNull().unique(),
  kind: text("kind").$type<DigestKind>().notNull(),
  /** Days covered, inclusive. */
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  status: text("status").$type<DigestStatus>().notNull(),
  locale: text("locale").$type<"fr" | "en">().notNull(),
  team: jsonb("team").$type<DigestTeam>(),
  stats: jsonb("stats").$type<DigestStats>(),
  error: text("error"),
  attempts: integer("attempts").default(1).notNull(),
  ...timestamps,
});

/** Part of a recap addressed to one account. */
export const digestPersonal = pgTable(
  "digest_personal",
  {
    digestId: text("digest_id")
      .notNull()
      .references(() => digest.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<DigestPersonal>().notNull(),
    stats: jsonb("stats").$type<DigestStats>(),
  },
  (t) => [primaryKey({ columns: [t.digestId, t.userId] })],
);
