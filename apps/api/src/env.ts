import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    WEB_ORIGIN: z.string().url(),
    HERMES_API_URL: z.string().url().or(z.literal("")).default(""),
    HERMES_API_KEY: z.string().default(""),
    /** Root of the Hermes instance: profiles, attachments, gateway pid. */
    HERMES_HOME: z.string().default(""),
    HERMES_BIN: z.string().default("hermes"),
    /** Secret used to derive profile API keys (HMAC per profile name). */
    HERMES_KEY_SECRET: z.string().default(""),
    /** Update service (production); empty in dev. */
    /** Fixed installation code for the setup wizard; empty = drawn at random and printed in the logs. */
    AGORA_SETUP_TOKEN: z.string().default(""),
    UPDATER_URL: z.string().url().or(z.literal("")).default(""),
    UPDATER_TOKEN: z.string().default(""),
    HERMES_DASHBOARD_URL: z.string().url().or(z.literal("")).default(""),
    HERMES_DASHBOARD_TOKEN: z.string().default(""),
    /** Company memory vault; default: $HERMES_HOME/wiki. */
    WIKI_DIR: z.string().default(""),
    /**
     * Owner of the Claude subscription logged in on this machine (`claude /login`):
     * the only one who can pick the Claude Code engine, in their private conversations. Empty = disabled.
     */
    CLAUDE_CODE_OWNER_EMAIL: z.string().default(""),
    CLAUDE_CODE_BIN: z.string().default("claude"),
    /** Working directory for Claude Code sessions; default: ~/.agora/claude-code. */
    CLAUDE_CODE_CWD: z.string().default(""),
    /** Tools allowed without confirmation (-p mode refuses the others). */
    /** Invitation emails via Resend; empty = the link is only shown to the admin and logged. */
    RESEND_API_KEY: z.string().default(""),
    MAIL_FROM: z.string().default("Agora <no-reply@localhost>"),
    CLAUDE_CODE_ALLOWED_TOOLS: z.string().default("WebSearch WebFetch"),
    /** Codex engine (ChatGPT subscription): its owner, empty = CLAUDE_CODE_OWNER_EMAIL's. */
    CODEX_OWNER_EMAIL: z.string().default(""),
    CODEX_BIN: z.string().default("codex"),
    /** Working directory for Codex sessions; default: ~/.agora/codex. */
    CODEX_CWD: z.string().default(""),
    /** Local model runtimes on the host (Settings › Models). */
    OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
    LMSTUDIO_URL: z.string().url().default("http://127.0.0.1:1234"),
  })
  .parse(process.env);
