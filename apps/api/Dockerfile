# Agora "app" image: API code and dependencies, without Hermes.
# It is layered on the Hermes image at deploy time (infra/api-runtime.Dockerfile),
# which lets the app and Hermes be updated independently.
# Build context: repo root.
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@agora/api..."

FROM oven/bun:1.4.2-slim
ARG APP_VERSION=0.0.0
ARG GIT_COMMIT=""
ARG BUILT_AT=""
WORKDIR /app
COPY --from=deps /app ./
COPY packages/core packages/core
COPY apps/api apps/api
COPY infra/hermes-plugins infra/hermes-plugins
# Read back by src/version.ts (ENV values don't survive the copy into the runtime image).
RUN printf '{"app":"%s","commit":"%s","builtAt":"%s"}\n' "$APP_VERSION" "$GIT_COMMIT" "$BUILT_AT" > /app/build.json
LABEL org.opencontainers.image.title="Agora app" org.opencontainers.image.version="${APP_VERSION}" org.opencontainers.image.revision="${GIT_COMMIT}"
WORKDIR /app/apps/api
