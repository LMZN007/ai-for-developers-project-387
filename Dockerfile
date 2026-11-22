# Calls booking: one container runs one Node process that serves the API under /api and the built
# web pages, on the port from PORT. Data lives in memory and is lost when the container restarts.
#
#   docker build -t calls-booking .
#   docker run --rm -p 8080:8080 -e PORT=8080 calls-booking   → http://localhost:8080

# Same Node and pnpm versions as mise.toml.
ARG NODE_IMAGE=node:26.13.1-slim
ARG PNPM_VERSION=12.21.0

# 1. Production dependencies of the server only (no TypeSpec, Vite, Vitest or Playwright).
FROM ${NODE_IMAGE} AS prod-deps
ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contract/package.json packages/contract/
RUN pnpm install --frozen-lockfile --prod --filter "@calls-booking/api..."

# 2. Build: generate OpenAPI and the SDK from the TypeSpec contract, then build the web app.
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app
# Manifests first, so the dependency layer stays cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
RUN pnpm install --frozen-lockfile --filter "@calls-booking/web..." --filter "@calls-booking/api..."
COPY . .
RUN pnpm run gen && pnpm --filter @calls-booking/web exec vite build

# 3. Runtime: Node runs the TypeScript sources directly (type stripping), nothing to compile.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_ROOT=/app/apps/web/dist
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/contract/node_modules ./packages/contract/node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/src ./apps/api/src
COPY --from=build /app/packages/contract/package.json ./packages/contract/
COPY --from=build /app/packages/contract/src ./packages/contract/src
COPY --from=build /app/packages/contract/generated ./packages/contract/generated
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# The app starts by itself when the container starts.
CMD ["node", "apps/api/src/server.ts"]
