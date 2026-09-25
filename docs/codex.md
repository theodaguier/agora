# Codex engine

Date: 2026-09-25 · Status: implemented

## Goal

Same as the [Claude Code engine](claude-code.md), with a ChatGPT subscription: the owner's bots answer through the official `codex` CLI instead of Hermes, on the machine's Codex login or one of the accounts added in Settings › Models.

## Settled decisions

- **Owner only**, like Claude Code: `CODEX_OWNER_EMAIL` (empty = `CLAUDE_CODE_OWNER_EMAIL`). Offered everywhere to the owner; only the turns they start run on it, the others fall back to the bot's Hermes model.
- **Official binary, the owner's config left out.** `codex exec --json --ignore-user-config`: none of the owner's MCP servers, profiles or hooks.
- **No shell.** Read-only sandbox, `approval_policy="never"`, and the tools that run commands or act outside the chat turned off (`shell_tool`, `unified_exec`, `code_mode_host`, sub-agents, apps, browser, computer use, image generation). Web search stays on. Features are turned off with `-c features.<name>=false` rather than `--disable`, which fails on a name the installed version doesn't know.
- **Models detected.** `model/list` of `codex app-server`, per account, cached 10 minutes; `account/read` gives the account's email and plan.

## How it works

- `apps/api/src/codex.ts`: `codexChat()` runs `codex exec` (or `codex exec resume <thread>`) and turns its JSONL events into the Hermes ones: `agent_message` → reply, tool items → tool status, `turn.completed` → usage (recorded as `engine = "codex"`, provider `openai`, no cost: a subscription). The bot's SOUL and Agora's context go in as `developer_instructions`.
- Codex names its threads itself: the thread of each Agora session is kept in `~/.agora/codex-threads.json`. A thread that can't be resumed any more is replaced by a new one.
- `apps/api/src/codex-accounts.ts`: accounts signed in with `codex login --device-auth` in their own `CODEX_HOME` (`~/.agora/codex-accounts/<id>`, `sessions/` linked to the machine's). The owner enters the one-time code on OpenAI's page; the sign-in ends by itself and the dialog follows it.
- Routes: `/admin/host/codex/{accounts,logins,active}`; the conversations' model routes accept the `codex` provider for the owner.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `CODEX_OWNER_EMAIL` | Agora account of the subscription holder. | `CLAUDE_CODE_OWNER_EMAIL` |
| `CODEX_BIN` | Codex binary. | `codex` |
| `CODEX_CWD` | Sessions workspace. | `~/.agora/codex` |
