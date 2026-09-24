# Deploying Agora on a server

The stack lives in `infra/docker-compose.yml`:

| Service | Purpose | Exposed |
|---|---|---|
| `web` | Caddy: automatic HTTPS, web app, `/api` proxy | 80, 443 |
| `api` | Agora server (Bun), built on the Hermes image | no (`hermes` network) |
| `hermes` | Hermes instance: multi-profile API server + internal dashboard | no (127.0.0.1 only) |
| `postgres` | Database | no |
| `updater` | Automatic updates (app and Hermes), backups, rollback | no |

Hermes is never reachable from the Internet: only the `api` container can access it.

## Prerequisites

- A Linux VPS (2 vCPU / 4 GB RAM recommended) with Docker and the Compose plugin.
- A domain name whose A record (and AAAA if IPv6) points to the VPS.
- Firewall: open only 22, 80 and 443 (`sudo ./harden-host.sh`, see Security).

## First install

```sh
git clone <repo> agora && cd agora/infra
cp .env.example .env
# Fill in DOMAIN and each secret with: openssl rand -hex 32
./agora build     # app / web / updater images at the repo version
./agora up
```

Open `https://<DOMAIN>`: the first-run wizard asks for the language and
time zone, creates the organization and the admin account, configures the
AI provider (key checked live, model picked from Hermes's list)
and the first agent.

Creating the admin account requires the **installation code**, printed in the
API logs at startup while no account exists:

```sh
./agora setup-code
```

Someone who reaches the address before you can't take the instance without
access to the server. The code is drawn again on each API restart (until the
admin exists), or fixed with `AGORA_SETUP_TOKEN` in `.env`.

OAuth-based providers (Nous Portal, Codex…): configure them from the command
line, `docker compose -p agora exec -it --user hermes hermes hermes model`.


## Versions and updates

- **One version = one `vX.Y.Z` tag** (semver), created by `pnpm release` from
  conventional commits (`feat:` → minor, `fix:` → patch,
  `feat!:` / `BREAKING CHANGE` → major), along with the CHANGELOG. Once the repo
  is on GitHub, each tag publishes the images to ghcr.io
  (`.github/workflows/release.yml`): then set in `.env`
  `AGORA_IMAGE_PREFIX=ghcr.io/<user>/agora` and a `REGISTRY_TOKEN`
  (GitHub token with package read access).
- **The `updater` service** checks every hour and, between 3 and 5 a.m.
  (configurable in Settings › Updates):
  - **Hermes**: pulls the new image, backs up the database and data, starts
    a *canary* Hermes on a copy of the data (routines and messaging tokens
    removed), checks the whole contract the app depends on (routes,
    formats, SSE, CLI, wiki plugin, a real agent reply), then switches
    production over and checks again. On any failure: rollback to the previous
    version with data restore.
  - **App**: patches and minors applied automatically, majors on click;
    backup, switchover (migrations on API startup), health and contract
    checks, otherwise rollback with database restore.
  - A rejected version is no longer retried automatically ("Allow a new
    attempt" button in the admin).
- **The server's checkout follows**: on each app update (and rollback), the
  updater moves the git checkout to the version's tag (`vX.Y.Z`), since
  `docker-compose.yml`, the api image's Dockerfile, the Hermes plugins and the
  `agora` script are read from it. Keep it a clean clone (no local edits to
  tracked files, or the update stops before switching). Installs from before
  this: `git fetch --tags && git checkout v<running version>` once, then `./agora up`.
- **Without a registry** (before GitHub): `git pull && ./agora build` on the server,
  then apply the version from Settings › Updates.
- **Status and versions**: `./agora status`; Hermes contract: `./agora contract`.

## Common operations
- **Authorize an OAuth MCP connector** (Notion, Airtable…):
  `docker compose exec -it --user hermes hermes hermes mcp login <name>`.
- **Logs**: `./agora logs api hermes updater`.

## Hermes compatibility

Validated with Hermes v2026.8.31 and v2026.9.21 (automatic upgrade from one
to the other tested by the canary). Known caveats:

- the gateway is started natively (`gateway run`) and supervised by s6 in
  the image: a restart requested from the admin brings it back in ~10 s;
- multi-profile mode is declared explicitly in `config.yaml`
  (`gateway.multiplex_profiles: true`, set on API startup): 9.x versions no
  longer enable it on their own under s6;
- the API server's `/v1/skills` has been broken since v2026.9.14: the app reads
  skills through the dashboard (`/api/skills?profile=`).

## Backups

The updater backs up automatically before each update (volume
`agora_backups`, last 7 kept). Two volumes hold all the state:

- `agora_pgdata`: accounts, agents, conversations;
- `agora_hermes-data`: Hermes profiles, memories, wiki, skills (`shared-skills/`: written by the bots, read by all of them), attachments, provider keys.

```sh
docker compose exec postgres pg_dump -U agora agora | gzip > agora-$(date +%F).sql.gz
docker run --rm -v agora_hermes-data:/data -v "$PWD":/out alpine \
  tar czf /out/hermes-$(date +%F).tgz -C /data .
```

These archives contain secrets: store them encrypted.

### Off-site backups

The copies above stay on the server: a lost disk or a compromised machine takes
them along. `./agora backup-offsite` sends an encrypted copy (restic, run from
its Docker image, nothing to install) to another place: S3-compatible storage,
Backblaze B2 or an SFTP server.

1. In `infra/.env`: `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` (`openssl rand -hex 32`,
   **stored outside the server too**: without it the backups can't be read) and the
   storage credentials (see `.env.example`). Use credentials that can write to
   the bucket but not delete from it when the provider allows it (B2 application
   key without `deleteFiles`, S3 Object Lock).
2. `./agora backup-offsite`: the database (fresh dump), the `hermes-data` volume,
   the updater's pre-update backups and `.env`. The repository is created on the
   first run; 7 daily, 4 weekly and 6 monthly snapshots are kept.
3. `./agora restore-check`: lists the snapshots, checks part of the data, and
   restores the latest dump into a throwaway Postgres (prints the account count).
   Run it once after setting things up, then from time to time: an untested
   backup is not a backup.

Every night at 2:30, with cron (`crontab -e` as the user that runs Docker):

```cron
30 2 * * * /path/to/agora/infra/agora backup-offsite >> /var/log/agora-backup.log 2>&1
```

Or a systemd timer, `/etc/systemd/system/agora-backup.{service,timer}`:

```ini
# agora-backup.service
[Service]
Type=oneshot
ExecStart=/path/to/agora/infra/agora backup-offsite

# agora-backup.timer
[Timer]
OnCalendar=*-*-* 02:30
Persistent=true
[Install]
WantedBy=timers.target
```

then `systemctl enable --now agora-backup.timer`.

**Full restore** on a new server: install Agora (`git clone`), then

```sh
docker run --rm -it -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  -v "$PWD/restore:/restore" restic/restic:0.18.0 restore latest --host agora --tag files --target /restore
cp restore/data/env/.env infra/.env      # same secrets as before
cd infra && docker compose -p agora up -d postgres
docker run --rm -v agora_hermes-data:/data -v "$PWD/../restore/data/hermes-data:/src:ro" alpine cp -a /src/. /data/
docker run --rm -i -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  restic/restic:0.18.0 dump --host agora --tag db latest /agora-db.sql \
  | docker compose -p agora exec -T postgres psql -U agora -d agora -v ON_ERROR_STOP=1 -q
./agora up
```

## Security

What the stack does on its own: HTTPS with HSTS, a strict Content-Security-Policy
on the web app (`Caddyfile`), Hermes and Postgres unreachable from the Internet
(Postgres sits on an internal network that only Hermes and the API join), the
`web` container stripped of every capability but binding 80/443, no open sign-up
(invitations only), rate-limited sign-in, installation code for the first admin.
Images from other sites in agents' replies load only on a click: a reply steered
by a trapped web page could otherwise send the conversation out in an image
address. What's left to you:

**Admin accounts: turn on two-factor authentication** (Settings › Account › Two-step verification). An
admin can re-enable an agent's terminal and drive the update service, which
controls Docker: an admin password is as good as root on the server.

**The server.** `sudo ./harden-host.sh` sets up the firewall (ufw: SSH, 80, 443
only), fail2ban on SSH and automatic security updates. Once your SSH key works,
`sudo ./harden-host.sh --ssh-keys-only` refuses password logins (the script
refuses to do it if your account has no authorized key). Caveat: **Docker
bypasses ufw** for the ports it publishes; only the `web` container publishes
any (80/443). Never add `ports:` to another service (Postgres, Hermes, updater):
it would be open to the Internet whatever ufw says.

**Without Cloudflare: CrowdSec.** It bans IPs that scan or brute-force, and
applies a community blocklist. Caddy writes its access logs as JSON to stdout
(`Caddyfile`); CrowdSec reads them through the Docker API:

```sh
curl -fsSL https://install.crowdsec.net | sudo sh
sudo apt-get install -y crowdsec crowdsec-firewall-bouncer-iptables
sudo cscli collections install crowdsecurity/caddy crowdsecurity/base-http-scenarios crowdsecurity/http-cve
printf 'source: docker\ncontainer_name:\n  - agora-web-1\nlabels:\n  type: caddy\n' \
  | sudo tee /etc/crowdsec/acquis.d/agora-caddy.yaml
```

In `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml`, add `DOCKER-USER`
to `iptables_chains` (next to `INPUT`): Docker's published ports skip `INPUT`,
bans wouldn't reach them otherwise. Then
`sudo systemctl restart crowdsec crowdsec-firewall-bouncer`.

**SSH through Tailscale only.** Once `tailscale up` works and you can
connect through the tailnet IP: `sudo ufw allow in on tailscale0 to any port 22 proto tcp`,
then `sudo ufw delete allow 22/tcp`. Every device of the tailnet can then reach
port 22: restrict it to your own machines with an ACL in the Tailscale console,
and remove the devices you no longer use. Disable key expiry for the server in the
Tailscale admin console, or SSH closes on you after 180 days; the host's web
console (VPS panel) remains the way back in.

**Secrets.** Generate each one with `openssl rand -hex 32`; `infra/.env` is
kept in mode 600 by `./agora`. Never commit it. If one leaks, change it and
restart (`./agora up`); `BETTER_AUTH_SECRET` also signs sessions: changing it
signs everyone out.

**In front of the server, two options:**

- *Public instance*: put the domain behind **Cloudflare** (proxied DNS record,
  SSL mode "Full (strict)"). It absorbs DDoS attacks, hides the server's IP and
  adds a WAF. Then uncomment the `trusted_proxies` block at the top of
  `Caddyfile` so that the API, and its rate limiting, sees each visitor's IP
  rather than Cloudflare's (otherwise every visitor shares the same quota).
  Visitors can still bypass Cloudflare if they find the server's IP; ufw can't
  prevent it (Docker ports), a Cloudflare Tunnel can (no port open at all).
- *Team-only instance*: don't expose it at all. **Tailscale** (the server and
  the team's devices on the same private network, then `DOMAIN` on the tailnet
  name) or **Cloudflare Access** (sign-in with the company's Google/Microsoft
  account before reaching Agora). This is the safest option.

**AI spending.** Set a monthly **spending limit** with each AI provider
(OpenAI, Anthropic, OpenRouter…) and a usage alert: a stolen account or an
agent in a loop can otherwise burn the budget in a night. Settings › Usage
shows consumption per person and per agent.

**Monitoring.** An external uptime probe (UptimeRobot, Better Stack, Healthchecks…)
on `https://<DOMAIN>/api/health`, which answers `{"ok":true}`. Check the logs
from time to time (`./agora logs api`): repeated sign-in failures, 401/403.

**Claude Code engine.** It runs on a personal Claude subscription logged in on
the machine: leave `CLAUDE_CODE_OWNER_EMAIL` unset on a public instance (the
production `docker-compose.yml` doesn't pass it).

**Agents' tools.** Whoever writes to an agent steers its tools, and so does text
planted in a web page it reads or a file it's given. Some Hermes tools give the
server to them: the terminal, code execution, file operations (they can write
anywhere, e.g. another profile's config), the local browser (it reaches the
Hermes dashboard on 127.0.0.1) and computer use. Every agent therefore starts
without them, in the app's conversations and in the scheduled jobs it creates.
Attachments stay readable through a read-only tool limited to the current
conversation (`hermes-plugins/agora_files`). An admin can turn one of these
tools back on for a given agent (Admin › Agent › Tools, after a warning): do
it only for an agent reserved for people you trust. The API also hides its own
secrets from the other processes of the container (non-dumpable process,
children started without them).
