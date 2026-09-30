# API container = Agora app image layered on the Hermes image (which provides the
# `hermes` CLI used by the API). Rebuilt in place in a few seconds when the app
# or Hermes changes version.
ARG APP_IMAGE
ARG HERMES_IMAGE

FROM ${APP_IMAGE} AS app
FROM oven/bun:1.3.9-slim AS bun

FROM ${HERMES_IMAGE}
ARG HERMES_VERSION=""
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
# Claude Code CLI: the Claude Code engine and the sessions bots start (code-sessions.ts), on
# accounts signed in from Settings › Models. `claude update` (Admin › Host) installs newer
# versions under $HOME/.local on the data volume, which comes first in PATH.
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force && claude --version
# GitHub CLI for the sessions: Claude Code uses it (pull requests, issues) with the vault's GitHub
# token, which code-git.ts hands it in GH_TOKEN.
ARG GH_VERSION=2.101.0
RUN arch="$(dpkg --print-architecture)" \
 && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz" \
    | tar -xz -C /tmp \
 && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_${arch}/bin/gh" /usr/local/bin/gh \
 && rm -rf "/tmp/gh_${GH_VERSION}_linux_${arch}" \
 && gh --version
# Browsers for the sessions' Playwright, with their system libraries: a session downloading one
# hangs, and cannot write to PLAYWRIGHT_BROWSERS_PATH (inherited from Hermes, owned by root).
# Full Chromium and the headless shell; /usr/local/bin/chromium is the path given to Claude Code
# for a project whose Playwright wants another revision (code-sessions.ts).
ARG PLAYWRIGHT_VERSION=1.63.0
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium chromium-headless-shell \
 && npm cache clean --force \
 && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH" \
 && ln -s "$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux*/chrome | tail -1)" /usr/local/bin/chromium \
 && chromium --headless=new --no-sandbox --dump-dom about:blank > /dev/null
COPY --from=app /app /app
# Each of these browsers shows itself on its conversation's screen when a session launches it
# (infra/chromium-screen.sh stands in for it, the binary becomes <name>.real), and agora-browser
# gives a session a browser that outlives its replies.
RUN browsers="$(find "$PLAYWRIGHT_BROWSERS_PATH" -mindepth 3 -maxdepth 3 -type f \( -name chrome -o -name chrome-headless-shell -o -name headless_shell \))" \
 && [ -n "$browsers" ] \
 && for b in $browsers; do mv "$b" "$b.real" && install -m 0755 /app/infra/chromium-screen.sh "$b"; done \
 && chromium --headless=new --no-sandbox --dump-dom about:blank > /dev/null \
 && install -m 0755 /app/infra/agora-browser.sh /usr/local/bin/agora-browser
ENV NODE_ENV=production \
    HOME=/opt/data \
    HERMES_HOME=/opt/data \
    HERMES_BIN=/opt/hermes/.venv/bin/hermes \
    HERMES_VERSION=${HERMES_VERSION} \
    PORT=3001 \
    CHROMIUM_PATH=/usr/local/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium
WORKDIR /app/apps/api
ENTRYPOINT []
CMD ["sh", "-c", "bun x drizzle-kit migrate && exec bun src/index.ts"]
