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
