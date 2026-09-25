# Claude Code engine

Date: 2026-09-22 · Status: implemented

## Goal

Let the holder of a Claude (Max) subscription have their bots answered by Claude Code instead of Hermes, in their private conversations, by reusing the Claude Code login already present on the machine running the API.

## Settled decisions

- **Owner only.** A consumer Claude subscription is personal: opening it to other employees or to groups would be account sharing. The engine is only offered and accepted for `CLAUDE_CODE_OWNER_EMAIL`, in a direct conversation. The rule is enforced server-side (model routes and bot-runner), not merely hidden in the UI. For multi-employee use, you need an API key (`ANTHROPIC_API_KEY`), not a subscription.
- **Official binary, no extracted token.** The API runs `claude -p`; Claude Code authenticates with its own login. The app never reads or copies any credential.
- **Personal context cut off.** `--setting-sources project --strict-mcp-config`: neither the owner's hooks, `CLAUDE.md`, nor personal MCP servers fire on every message. `--bare` cannot be used: it requires an API key.
- **Models detected, not hardcoded.** The list comes from Claude Code itself (the `initialize` control request of stream-json mode, the one used by the Agent SDK) and follows the subscription of the logged-in account. The `default` alias is excluded.

## How it works

- `apps/api/src/claude-code.ts`:
  - `claudeCodeModels()` queries Claude Code, result cached for 10 minutes. On failure (missing binary, not logged in), the section is not offered.
  - `claudeCodeChat()` runs `claude -p` in stream-json and converts the stream into `delta` / `tool` events, identical to Hermes's: streaming, tools and cancellation work with no change on the front end.
  - One Claude Code session per conversation, with a UUID derived from the Agora session identifier: created on the first message (`--session-id`), resumed afterwards (`--resume`). A new bot revision starts a new session, as with Hermes.
- `bot-runner.ts`: picks Claude Code if the conversation's model is `claude-code::<model>`, the bot is not in setup, the conversation is direct and the author is the owner. Otherwise Hermes (the Claude Code model is then ignored). The Hermes profile's `SOUL.md` is added to the system prompt, since Hermes no longer injects it.
- `GET/PUT /conversations/:id/models` routes: return and accept the `claude-code` provider for the owner only.
- `ModelPicker`: "Claude Code (personal subscription)" section below the Hermes models.

## Several accounts

Settings › Models, under the Claude Code row of the CLIs: the machine's own login, plus accounts the owner signs in from Agora, and which one the engine runs on (`apps/api/src/claude-accounts.ts`, storage shared with Codex in `subscription-accounts.ts`).

- **A real login per account, not a token.** Each account gets its own `CLAUDE_CONFIG_DIR` (`~/.agora/claude-accounts/<id>`) where the API runs `claude auth login`; the owner signs in on Claude's page and pastes the code back. `claude auth status` then gives its email and plan. A `claude setup-token` token was ruled out: a token-authenticated CLI can't tell which account it is.
- **Sessions follow.** Every account directory links `projects/` to the machine's: a conversation resumes its session whichever account is active.
- **No token in the database.** The CLI keeps and refreshes the credentials (Keychain on macOS); the `setting` row `claude_code_accounts` only holds the active account and each one's email and plan. Removing an account runs `claude auth logout`, then deletes its directory.
- **No automatic rotation** when an account hits its usage limit: switching is the owner's choice.

## Configuration

Variables in `apps/api/.env` (see `.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `CLAUDE_CODE_OWNER_EMAIL` | Agora account of the subscription holder. Empty = engine disabled. | empty |
| `CLAUDE_CODE_BIN` | Claude Code binary. | `claude` |
| `CLAUDE_CODE_CWD` | Sessions workspace. | `~/.agora/claude-code` |
| `CLAUDE_CODE_ALLOWED_TOOLS` | Tools allowed without confirmation; `-p` mode refuses the others. Attachments are readable via `--add-dir`. | `WebSearch WebFetch` |

`bun --watch` does not reload `.env`: after a change, restart `pnpm dev`. The front end caches the model list for 5 minutes.

## Deployment

The API Docker image does not include `claude`. To enable the engine in production: install Claude Code in the image and mount the host's `~/.claude`, logged in with its own login (`claude /login` or `claude setup-token`). Never copy credentials from another machine: refresh tokens rotate and copying logs out both machines.
