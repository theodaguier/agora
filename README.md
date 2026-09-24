# Agora

**A self-hosted team messenger for [Hermes Agent](https://github.com/NousResearch/hermes-agent).**
Give everyone in your organization a chat app to work with AI agents: each agent is a Hermes
profile with its own personality, memory, tools, skills and MCP connectors, and your team talks
to them in direct messages or group conversations.

> Agora is an independent project. It is not affiliated with or endorsed by Nous Research.

## Features

- **Messenger UI** for agents and people: direct and group conversations, streaming replies,
  tool activity, attachments (files and images), `/` commands for skills and connectors.
- **Agents as Hermes profiles**: per-agent model, personality (SOUL.md), toolsets, skills and
  MCP servers, managed from the admin panel. Agents can also configure themselves by chatting.
- **Shared organization memory**: a short always-on memory plus a markdown wiki that every
  agent reads and writes.
- **Marketplace** backed by Hermes: MCP catalog, official and community skills, plugins.
- **Team & access control**: email invitations, admin role, per-person access to agents.
- **First-run setup wizard**: organization, admin account, AI provider (key checked live,
  model chosen from Hermes' own list), first agent, language and timezone. No CLI needed.
- **Safe automatic updates**: new Hermes versions are tested on a *canary* copy of your data
  against the contract the app depends on, then rolled out, or rolled back automatically.
  App updates follow semver (patches and minors automatic, majors on click), with backups.

## Quick start (Docker)

Requirements: a Linux server with Docker and Compose, and a domain pointing to it.

```sh
git clone <this repo> agora && cd agora/infra
cp .env.example .env        # set DOMAIN and generate each secret with: openssl rand -hex 32
./agora build               # build the app images
./agora up                  # start everything (HTTPS via Caddy)
```

Then open `https://<your domain>`. The setup wizard walks you through the rest; it asks for
the installation code printed in the server logs (`./agora setup-code`).
See [`infra/DEPLOY.md`](infra/DEPLOY.md) for operations, updates and backups.

## Development

```sh
pnpm install
pnpm dev            # everything: Postgres (Docker), Hermes, API (Bun + Hono), web (Vite + React)
```

Or piece by piece: `pnpm db:up` (Postgres), `pnpm hermes` (gateway + dashboard, HERMES_HOME from
apps/api/.env), `pnpm dev:apps` (API + web).

Stack: TypeScript monorepo (pnpm + Turborepo) · Bun, Hono, Drizzle, Postgres, Better Auth ·
React 19, TanStack Router/Query, Tailwind v4, shadcn/ui · Hermes Agent.

Releases: `pnpm release` bumps the version from conventional commits, writes the changelog
and tags `vX.Y.Z`; CI publishes the images.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish your changes.
