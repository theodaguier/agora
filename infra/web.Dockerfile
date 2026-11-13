# Web app (Vite build) served by Caddy, which also handles HTTPS and proxies /api.
# Build context: repo root.
# The Vite output is static files, identical on every platform: it is built once on the runner's
# native platform. Built under QEMU for arm64, rolldown hung at "rendering chunks" until the job was cancelled.
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@agora/web..."
COPY packages/core packages/core
COPY apps/web apps/web
RUN pnpm --filter @agora/web build

FROM caddy:2.10-alpine
ARG APP_VERSION=0.0.0
LABEL org.opencontainers.image.title="Agora web" org.opencontainers.image.version="${APP_VERSION}"
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
