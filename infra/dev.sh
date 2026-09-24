#!/usr/bin/env bash
# Runs the whole dev stack in one command: Postgres (Docker), Hermes
# (gateway + dashboard), API and web. Ctrl-C stops everything except the
# Postgres container (`pnpm db:down` for that).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "[dev] starting Docker Desktop…"
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi
docker compose -f infra/docker-compose.dev.yml up -d

infra/hermes-dev.sh &
HERMES=$!
trap 'kill $HERMES 2>/dev/null || true' EXIT

# The updater drives the production compose stack; it has no dev role.
turbo run dev --filter='!@agora/updater'
