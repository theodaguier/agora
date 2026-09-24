# Update service: Bun + Docker/Compose CLI (drives the host's daemon).
# Build context: repo root.
FROM oven/bun:1.3.9-alpine
ARG APP_VERSION=0.0.0
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY apps/updater/package.json apps/updater/tsconfig.json ./
COPY apps/updater/src src
LABEL org.opencontainers.image.title="Agora updater" org.opencontainers.image.version="${APP_VERSION}"
# Absolute path: compose sets working_dir to the host's infra directory.
CMD ["bun", "/app/src/main.ts"]
