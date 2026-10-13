# Claude Code engine

Date: 2026-09-22 · Status: implemented

## Goal

Let the holder of a Claude (Max) subscription have their bots answered by Claude Code instead of Hermes, in their private conversations, by reusing the Claude Code login already present on the machine running the API.

## Settled decisions

- **Owner only.** A consumer Claude subscription is personal: opening it to other employees or to groups would be account sharing. The engine is only offered and accepted for `CLAUDE_CODE_OWNER_EMAIL`, in a direct conversation. The rule is enforced server-side (model routes and bot-runner), not merely hidden in the UI. For multi-employee use, you need an API key (`ANTHROPIC_API_KEY`), not a subscription.
- **Official binary, no extracted token.** The API runs `claude -p`; Claude Code authenticates with its own login. The app never reads or copies any credential.
- **Personal context cut off.** `--setting-sources project --strict-mcp-config`: neither the owner's hooks, `CLAUDE.md`, nor personal MCP servers fire on every message. `--bare` cannot be used: it requires an API key.
- **The bot's connectors, not the owner's.** The only MCP servers it gets are the ones enabled for the bot in Hermes (see below). A server connected inside a Claude Code session (`/mcp`, `claude mcp add`) is ignored: connectors are made in Agora, once, for every bot and every engine.
- **Models detected, not hardcoded.** The list comes from Claude Code itself (the `initialize` control request of stream-json mode, the one used by the Agent SDK) and follows the subscription of the logged-in account. The `default` alias is excluded.

## How it works

- `apps/api/src/claude-code.ts`:
  - `claudeCodeModels()` queries Claude Code, result cached for 10 minutes. On failure (missing binary, not logged in), the section is not offered.
  - `claudeCodeChat()` runs `claude -p` in stream-json and converts the stream into `delta` / `tool` events, identical to Hermes's: streaming, tools and cancellation work with no change on the front end.
  - One Claude Code session per conversation, with a UUID derived from the Agora session identifier: created on the first message (`--session-id`), resumed afterwards (`--resume`). A new bot revision starts a new session, as with Hermes.
- `bot-runner.ts`: picks Claude Code if the conversation's model is `claude-code::<model>`, the bot is not in setup, the conversation is direct and the author is the owner. Otherwise Hermes (the Claude Code model is then ignored). The Hermes profile's `SOUL.md` is added to the system prompt, since Hermes no longer injects it.
- `GET/PUT /conversations/:id/models` routes: return and accept the `claude-code` provider for the owner only.
- `ModelPicker`: "Claude Code (personal subscription)" section below the Hermes models.

## MCP connectors

Connectors stay Hermes's: installed once on the instance, enabled per agent (Admin › Agents), secrets in its `.env`, OAuth tokens in its `mcp-tokens/`. The engines that aren't Hermes (Claude Code, Codex, Cursor) reach them through Agora's MCP gateway; a connection is made once, in Agora, and every bot that has it enabled gets it, whatever its engine.

- `apps/api/src/engine-mcp.ts` reads, at every turn and at the start of a code session a bot opened, the servers enabled for the bot as its gateway runs them (the profile's own copy, `${VAR}` resolved against the instance's `.env` then the profile's), and declares each one to the engine as a local streamable-HTTP address with a token valid for that run only.
- `apps/api/src/mcp-gateway.ts` (`/api/internal/mcp/:server`, 127.0.0.1 only: a request that came through the proxy is refused) relays the engine's JSON-RPC to the real server: a local command (in the profile's home, with its declared variables over a minimal environment), a remote streamable-HTTP or SSE server with its headers, or an OAuth one. Hermes's tool selection (`tools.include` / `tools.exclude`, fnmatch) is applied there: left out of `tools/list` and refused on `tools/call`. One upstream connection per MCP session of the engine, closed with it or when the run ends (a warm code session keeps its connectors as long as its process). Answers are event streams pinged every 20 s, so a long tool call outlives the server's idle timeout.
- `apps/api/src/mcp-oauth-token.ts`: an OAuth server's token is Hermes's, and so is its refresh. A refresh token is often single-use, and Hermes holds a file lock across the token request so two processes never spend the same one. A short run of Hermes's own Python (`HERMES_PYTHON`, else the interpreter `HERMES_BIN` runs) builds Hermes's OAuth provider and hands over a valid token, refreshing it under that lock when it is due; the MCP server itself is not called. The token is kept in memory until a minute before it expires; a 401 from the server has Hermes refresh it at once, and the request is retried.

How each engine gets them:

- **Claude Code**: `--mcp-config` file (mode 0600, removed when the process exits, leftovers swept at the next start; in the arguments the token would show in the process list), merged with the `agora` SDK server of a session a bot opened. Each connector is allowed as `mcp__<server>` (`-p` refuses tools that aren't).
- **Codex**: `-c mcp_servers.<name>.url=…`, the token in its environment (`bearer_token_env_var`), `default_tools_approval_mode="approve"`: nobody is there to approve a call, the admin's choice of connector is the approval.
- **Cursor**: the connectors are added to the workspace's `.cursor/mcp.json` for the run, its header reading the token from Cursor's environment (`${env:AGORA_MCP_TOKEN}`), with `--approve-mcps`; the file is put back as it was afterwards, and excluded from git. A `.cursor/mcp.json` the repository tracks is left alone, and Cursor then runs without connectors.

The bot is told which connectors it has on its engine (`connectorsPrompt`).

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
