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
COPY --from=app /app /app
ENV NODE_ENV=production \
    HOME=/opt/data \
    HERMES_HOME=/opt/data \
    HERMES_BIN=/opt/hermes/.venv/bin/hermes \
    HERMES_VERSION=${HERMES_VERSION} \
    PORT=3001
WORKDIR /app/apps/api
ENTRYPOINT []
CMD ["sh", "-c", "bun x drizzle-kit migrate && exec bun src/index.ts"]
