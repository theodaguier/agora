# Agora

**A self-hosted workspace where people and AI agents work in the same conversations.**

Agora gives a team a messenger for talking to colleagues and specialized AI agents. An agent is backed by a [Hermes Agent](https://github.com/NousResearch/hermes-agent) profile with its own model, personality, memory, tools, skills, and connectors. Teams can use agents in direct messages or bring several into a group conversation, then turn the work into tasks, routines, and shared knowledge.

The repository contains a web app, an Expo mobile app, a Bun API, shared TypeScript code, and the Docker stack for a self-hosted installation. Agora is an independent project and is not affiliated with or endorsed by Nous Research.

## At a glance

| Area | What it does |
| --- | --- |
| Conversations | Human and agent direct messages, groups, mentions, replies, forwarding, attachments, streaming responses, tool activity, and approval prompts. |
| Agent workspace | Admin-managed Hermes profiles with per-agent models, `SOUL.md` personality, tools, skills, MCP connectors, and access rules. New agents can complete their setup through chat. |
| Team work | Assigned tasks, “working on” status, an inbox for mentions and task events, availability, scheduled agent routines, and morning recaps. |
| Shared memory | An organization wiki backed by Markdown, with conversation capture, agent-facing context, and a background curator. |
| Administration | Invitation-only accounts, optional required two-factor authentication, provider and model settings, usage, integration management, and update controls. |
| Clients | Responsive React web app and a separate iOS/Android app that connects to the organization's server through QR pairing or sign-in. |

## Screenshots

These are development screenshots of the web interface. The first shows a conversation beside an agent's profile; the second shows the agent's tool and MCP settings.

| Conversation and agent profile | Agent tools and connectors |
| --- | --- |
| ![Agora conversation with an agent profile panel](apps/web/sheet-1.png) | ![Agora agent tool and MCP connector settings](apps/web/sheet-3.png) |

## How it works

```mermaid
flowchart LR
    Browser[React web app] -->|HTTPS /api| Caddy[Caddy]
    Phone[Expo mobile app] -->|HTTPS /api| Caddy
    Caddy -->|Static files| Browser
    Caddy -->|API and SSE| API[Bun + Hono API]
    API -->|SQL| DB[(PostgreSQL)]
    API -->|Profile API / runs| Hermes[Hermes gateway]
    API -->|Admin and CLI operations| Hermes
    Hermes --> Profiles[(Hermes profiles and skills)]
    Profiles --> Wiki[(Shared Markdown wiki)]
    API -->|Update requests| Updater[Updater]
    Updater -->|Backups and rollout| Stack[Docker stack]
```

The API is the application boundary: it authenticates users, enforces conversation and agent access, stores application data in PostgreSQL, and translates Hermes events into the format the web and mobile clients consume. Hermes runs the agents and keeps their profile files and sessions. Both services share the Hermes data volume; the API reaches the Hermes gateway on the container's loopback interface. Only Caddy exposes public ports in the production Compose stack.

### A message to an agent

```mermaid
sequenceDiagram
    participant User as Web or mobile client
    participant API as Agora API
    participant DB as PostgreSQL
    participant Agent as Hermes profile
    User->>API: Post message
    API->>DB: Store message and pending turn
    API-->>User: Message and turn events over SSE
    API->>Agent: Start or resume conversation session
    Agent-->>API: Text deltas, tools, approval requests
    API-->>User: Stream turn events
    API->>DB: Store final reply and clear pending turn
    API-->>User: Completed message event
```

In a group, explicit agent mentions select who responds. A reply or follow-up can also call the relevant agent. Agents can hand work to another agent by mentioning it; the API limits the length of a relay chain. Turns are queued per agent and conversation so one session is not driven concurrently. After an API restart, queued turns resume; a turn that had already started is marked interrupted to avoid repeating possible tool actions.

Client updates use **server-sent events** (SSE) on `/api/events`. The same stream carries new messages, partial agent replies, tool and approval events, presence, tasks, and inbox changes. The event bus is currently in process, so the architecture assumes one API instance; scaling it horizontally requires a shared event transport.

### Memory and integrations

Agora installs its wiki plugin into Hermes profiles. It captures conversation material, injects relevant wiki context, and lets agents maintain a shared Markdown knowledge base. A background curator consolidates raw material into durable pages. The wiki lives with Hermes data, can be read from the admin interface, and is compatible with Obsidian.

The marketplace exposes Hermes skills and plugins alongside MCP connectors. Admins control which tools and credentials an agent receives. Credentials are held in Hermes profile configuration rather than in the Agora database. Agents with powerful tools can act on the host, so their access should be granted deliberately.

## Repository layout

| Path | Responsibility |
| --- | --- |
| [`apps/web`](apps/web) | React 19, Vite, TanStack Router/Query, Tailwind CSS; the browser client. |
| [`apps/mobile`](apps/mobile) | Expo Router and React Native; the iOS/Android client. |
| [`apps/api`](apps/api) | Bun, Hono, Better Auth, Drizzle; HTTP API, agent orchestration, and background jobs. |
| [`apps/updater`](apps/updater) | Version checks, canary validation, backups, rollout, and rollback. |
| [`packages/core`](packages/core) | Types, shared business rules, and localization used by the clients and API. |
| [`infra`](infra) | Docker Compose, Caddy, deployment scripts, and Hermes plugins. |

The monorepo uses **pnpm workspaces** and **Turborepo**. PostgreSQL holds users, sessions, agents, conversations, messages, tasks, and other application records. The Hermes data volume holds profiles, skills, attachments, sessions, and the wiki.

## Deploy with Docker

You need a Linux host with Docker and the Compose plugin, plus a domain whose DNS record points to the host. See the [deployment guide](infra/DEPLOY.md) for server hardening, backups, update behavior, and recovery.

```sh
git clone https://github.com/theodaguier/agora.git agora
cd agora/infra
cp .env.example .env
# Set DOMAIN and generate each required secret with: openssl rand -hex 32
./agora build
./agora up
./agora setup-code
```

Open `https://<your-domain>` and enter the installation code shown by the last command. The first-run wizard creates the organization and admin account, configures an AI provider and the first agent, and sets language and time zone. Public sign-up is disabled; subsequent users join by invitation. If email delivery is not configured, the admin can copy invitation links instead.

The production stack runs `web`, `api`, `hermes`, `postgres`, and `updater`. Caddy serves the web client and proxies `/api`; it obtains HTTPS certificates automatically. The API runs database migrations on startup. Use `./agora status` for service versions and `./agora logs api hermes updater` for logs.

## Develop locally

Install **Node.js**, **pnpm 11**, **Bun**, **Docker**, and the **Hermes CLI**. Start from the example API configuration:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
# Fill BETTER_AUTH_SECRET and the Hermes settings needed for your setup.
pnpm db:up
DATABASE_URL=postgres://agora:agora@localhost:5440/agora pnpm --filter @agora/api exec drizzle-kit migrate
pnpm dev
```

The migration command initializes a fresh local database. `pnpm dev` starts PostgreSQL in Docker, the local Hermes gateway and dashboard, the Bun API, and the Vite web app. The updater is production-only. PostgreSQL stays running after you stop the dev command; shut it down with `pnpm db:down`.

For individual processes, use `pnpm db:up`, `pnpm hermes`, and `pnpm dev:apps`. If `HERMES_API_URL` is empty, the API uses simulated agent replies for interface development. Set up a real Hermes instance to exercise agent tools and memory. The default local ports are **5173** for web, **3001** for API, and **5440** for PostgreSQL.

The mobile project uses the same API and is started separately:

```sh
pnpm --filter @agora/mobile start
```

Connect the mobile app to a running Agora server by scanning the QR code from the web app or by signing in with the server address. Native modules may require an Expo development build; see [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) for the project's Expo workflow.

### Useful checks

```sh
pnpm typecheck
pnpm --filter @agora/api test
pnpm --filter @agora/web build
```

## Configuration and operations

| Setting | Purpose |
| --- | --- |
| `DOMAIN` | Public hostname used by Caddy and authentication in production. |
| `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` | Database and session secrets. |
| `HERMES_API_KEY`, `HERMES_DASHBOARD_TOKEN`, `HERMES_KEY_SECRET` | Authenticate and provision Hermes profiles. |
| `UPDATER_TOKEN` | Authorizes API requests to the update service. |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional invitation and password-reset email. |
| `HERMES_HOME`, `WIKI_DIR` | Local development paths for Hermes state and the shared wiki. |

Use [`infra/.env.example`](infra/.env.example) for the production template and [`apps/api/.env.example`](apps/api/.env.example) for local development. Keep filled `.env` files and backups out of version control. Optional personal Claude Code and Codex engines are documented in [`docs/claude-code.md`](docs/claude-code.md) and [`docs/codex.md`](docs/codex.md); they require local CLI sign-in and are separate from the default Docker setup.

The updater checks Agora and Hermes releases, makes backups before changes, and validates a Hermes update against a canary copy before switching production. App patches and minors can update automatically; major versions require an admin action. A failed rollout restores the previous version. The [deployment guide](infra/DEPLOY.md) covers off-site encrypted backups and restore checks.

## Security model

Agora is designed for a trusted organization operating its own server. Production Compose keeps PostgreSQL and Hermes off the public network and exposes only Caddy on ports 80 and 443. Better Auth handles sessions; the app adds invitations, agent access controls, an installation code for the first admin, and optional organization-wide two-factor enforcement. Mobile pairing codes are short-lived and single-use.

Agent permissions deserve separate attention: an agent can be prompted by a user or by untrusted content it reads. Limit access to terminal, file, and other powerful tools to the agents that need them. See [deployment security guidance](infra/DEPLOY.md#security) and the [mobile privacy policy](PRIVACY.md).

## License

Agora is licensed under [AGPL-3.0-only](LICENSE).
