#!/usr/bin/env bash
# Runs Agora's Hermes instance in dev: headless dashboard (MCP, skills)
# and gateway (API server), restarted automatically after a restart
# requested from the admin (SIGUSR1 → the gateway exits, we relaunch it).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT/apps/api/.env"; set +a
export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes-agora}"
export HERMES_DASHBOARD_SESSION_TOKEN="$HERMES_DASHBOARD_TOKEN"
PORT="${HERMES_DASHBOARD_URL##*:}"

hermes dashboard --no-open --skip-build --host 127.0.0.1 --port "${PORT%/}" &
DASH=$!
trap 'kill $DASH 2>/dev/null; kill $GW 2>/dev/null; exit 0' INT TERM

while true; do
  hermes gateway run &
  GW=$!
  wait $GW || true
  echo "[hermes-dev] gateway stopped, restarting in 2 s…"
  sleep 2
done
