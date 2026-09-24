# Changelog

## v0.3.1 — 2026-09-24

### Fixes
- **api**: offer OpenRouter as an API-key provider

## v0.3.0 — 2026-09-24

### Features
- **admin**: manage AI providers and the default model in Admin › Models
- **infra**: Caddy access logs for CrowdSec, SSH through Tailscale

### Fixes
- **api**: wait for the Hermes gateway before restarting it

## v0.2.0 — 2026-09-24

- Shared skills: ask any bot to "make it a skill" and it writes a SKILL.md (```skill-create``` block) that every bot, present and future, can use. Stored in `shared-skills/` at the Hermes root, listed in every profile's `skills.external_dirs` (set at startup and on bot creation). Asked by an admin, it is shared right away; otherwise an admin reads it and approves it from the card in the conversation or from Marketplace › Installed. A shared skill is never overwritten by a different one with the same name.
- Rich messages: every message (bots and people) is rendered as markdown — tables, code, quotes, lists; for people, a line break stays a line break and HTML shows as typed. Recognized in the text: links, bare domains, emails, phone numbers (tel:), file and folder paths (`/…`, `~/…`, `./…`, `C:\…`, quoted paths with spaces; a click copies them), hex colors (swatch), repositories (GitHub, GitLab, Bitbucket, Codeberg, `git@…` included) shown as `owner/repo` with the logo, plus `#12` for an issue or pull request, ports (`port 3001`, `ports 3000 et 5173`, `:3001`) and local addresses (`localhost:5173`, `127.0.0.1:3000/api`), opened as `http://localhost:<port>` in a new tab. Files are recognized by name (`rapport.pdf`, `'Rapport final.xlsx'`), path or web address, with an icon per kind (image, video, audio, document, spreadsheet, slides, archive, code, design); a name matching a file sent in the conversation opens it, images and videos previewing on hover. A conversation pasted in a quote (`> Marie: …`) or with timestamps (`[10:47] Marie: …`) shows as a mini thread; a quote ending in `— Author` shows its signature.
- What's new dialog: after an update, each member sees the release once (version, date, summary, tags), remembered on their account; reopened from the user menu › What's new. Content lives in `apps/web/src/lib/whats-new.ts`.
- User profiles: first name, last name and role (spouse, developer… depending on context) required; username, bio and profile photo optional. Everyone edits their own in Settings › General.
- Email invitations: the admin invites (email, first name, last name, role, access) instead of creating the account with a temporary password; the invitee completes their profile and chooses their password from the link (valid 7 days, single use). Sent via Resend (`RESEND_API_KEY`, `MAIL_FROM`); without a key, the link is shown in the admin to be passed on by hand. Pending invitations: resend or cancel.
- Token usage: Settings › Usage. Tokens (input, output, cache) and estimated cost over time (24 h to 12 months), broken down by member, bot, task (Hermes cron jobs, memory curation…) and model. An admin sees everything and can filter; a member only sees their own usage. Hermes usage is read from each profile's `state.db` (cron included), Claude Code usage from each reply. Costs are estimated from models.dev prices, which an admin can override per model.
- Claude Code engine: in their private conversations, the holder of the Claude subscription logged in on the machine can have a bot answered by Claude Code instead of Hermes. Models detected from Claude Code, chosen in the model picker. See `docs/claude-code.md`.
- Agent screen: the right panel shows, live, the browser a Hermes bot is driving (click to enlarge). Streamed from the agent's headless Chromium (CDP screencast, at most 5 images/s) only while a member has the panel open and the tab visible; nothing runs otherwise, and the stream ends when Hermes closes the browser. Relies on the Hermes plugin `agora_screen`, installed in every profile at startup (one clean gateway restart the first time), checked by the updater's contract.

## v0.1.0

First release: Grok Bot-style messenger wired to Hermes (agents, attachments, model choice, "/" commands, MCP/skills/plugins marketplace, organization memory and wiki, personalities, bot creation through conversation), administration, Docker deployment and automatic updates with canary.
