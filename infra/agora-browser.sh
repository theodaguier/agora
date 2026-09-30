#!/bin/sh
# agora-browser: the lasting Chromium of a Claude Code session, installed as /usr/local/bin/agora-browser
# (api-runtime.Dockerfile). Prints its DevTools endpoint (http://127.0.0.1:<port>), starting it when needed.
#
# Claude Code stops everything it started when its reply ends: a browser launched by the session's
# scripts closes with it, and the conversation's screen goes blank. This one runs in a session of its
# own, out of that process tree, so it stays on the last page between replies; every call returns the
# same browser. Launched through the image's Chromium, it records itself for the screen
# (infra/chromium-screen.sh); the API stops it once the session has been idle a while (code-sessions.ts).

[ -n "$AGORA_SCREEN" ] || { echo "agora-browser: only in a Claude Code session of Agora" >&2; exit 1; }

profile="${TMPDIR:-/tmp}/$(basename "$AGORA_SCREEN")-browser"
ready="$profile/DevToolsActivePort"

endpoint() {
  port="$(head -n 1 "$ready" 2>/dev/null)"
  case "$port" in "" | *[!0-9]*) return 1 ;; esac
  curl -fs -m 2 "http://127.0.0.1:$port/json/version" > /dev/null || return 1
  echo "http://127.0.0.1:$port"
}

endpoint && exit 0

mkdir -p "$profile"
# A previous one killed without cleaning up leaves its lock: Chromium would hand over to it and exit.
rm -f "$profile/SingletonLock" "$profile/SingletonSocket" "$profile/SingletonCookie"
setsid "${CHROMIUM_PATH:-/usr/local/bin/chromium}" --headless=new --no-sandbox --no-first-run --no-default-browser-check \
  --remote-debugging-port=0 --user-data-dir="$profile" --window-size=1280,800 about:blank \
  < /dev/null > /dev/null 2>&1 &

tries=0
while [ "$tries" -lt 75 ]; do
  sleep 0.2
  endpoint && exit 0
  tries=$((tries + 1))
done
echo "agora-browser: Chromium did not start" >&2
exit 1
