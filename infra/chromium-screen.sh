#!/bin/sh
# Chromium seen live in Agora: stands in for the browsers of the API image (api-runtime.Dockerfile),
# the real binary being next to it as <name>.real.
#
# A Claude Code session's Playwright (or Puppeteer) drives its Chromium over a pipe: nothing tells
# where to watch it. When AGORA_SCREEN is set (code-sessions.ts: <screen dir>/agora-<conversation>-code-<session>),
# this opens a DevTools port as well and records it in $AGORA_SCREEN-<pid>.json, which the API
# streams to the conversation's screen (apps/api/src/screen.ts) while someone watches; the file
# goes when the browser does. Without it, or without a profile of its own, Chromium runs untouched.

real="$(readlink -f "$0").real"
[ -n "$AGORA_SCREEN" ] || exec "$real" "$@"

profile=""
port=""
for arg in "$@"; do
  case "$arg" in
    --user-data-dir=*) profile="${arg#--user-data-dir=}" ;;
    --remote-debugging-port=*) port=1 ;;
  esac
done
# No profile: the machine's default one, where Chromium refuses a DevTools port (one-off --screenshot, --dump-dom…).
[ -n "$profile" ] || exec "$real" "$@"
[ -n "$port" ] || set -- --remote-debugging-port=0 "$@"

pid=$$
out="$AGORA_SCREEN-$pid.json"
ready="$profile/DevToolsActivePort"
rm -f "$ready"

# Waits for the port Chromium picked, records it, and removes it when Chromium exits (same pid: exec).
# Off every descriptor of the caller: Playwright's pipe (3, 4) must close with Chromium alone.
(
  tries=0
  while [ "$tries" -lt 150 ] && kill -0 "$pid" 2>/dev/null; do
    p="$(head -n 1 "$ready" 2>/dev/null)"
    case "$p" in
      "" | *[!0-9]*) ;;
      *)
        printf '{"cdp":"http://127.0.0.1:%s"}\n' "$p" > "$out.tmp" && mv "$out.tmp" "$out" || exit 0
        # Touched now and then: the API forgets a record untouched for 30 minutes.
        beats=0
        while kill -0 "$pid" 2>/dev/null; do
          sleep 2
          beats=$((beats + 1))
          [ $((beats % 300)) -eq 0 ] && touch "$out"
        done
        rm -f "$out"
        exit 0
        ;;
    esac
    tries=$((tries + 1))
    sleep 0.2
  done
) < /dev/null > /dev/null 2>&1 3>&- 4>&- 5>&- 6>&- 7>&- 8>&- 9>&- &

exec "$real" "$@"
