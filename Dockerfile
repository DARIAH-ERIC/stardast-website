# syntax=docker/dockerfile:1

# base
# ---------------------------------------------------------------------------------------------------------------------

FROM oven/bun:1.4.3-alpine AS base
WORKDIR /app

# install
# ---------------------------------------------------------------------------------------------------------------------

FROM base AS install
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --frozen-lockfile

# `sharp` has native binaries, which cannot be bundled, see the `bundle-server-dependencies` plugin in `astro.config.ts`.
# Installed on its own, at the version from the lockfile. Bun installs the binaries for both glibc and musl - alpine only
# needs musl.
FROM install AS install-sharp
WORKDIR /sharp
RUN bun add "sharp@$(bun --print 'require("/app/node_modules/sharp/package.json").version')" \
    && rm -rf node_modules/@img/sharp-linux-* node_modules/@img/sharp-libvips-linux-*

# build
# ---------------------------------------------------------------------------------------------------------------------

FROM install AS build
# Inlined into the client and server bundles, see `configs/env.schema.ts`.
ARG PUBLIC_APP_BASE_URL
ARG PUBLIC_APP_BOTS
ARG PUBLIC_APP_GOOGLE_SITE_VERIFICATION
ARG PUBLIC_APP_MATOMO_BASE_URL
ARG PUBLIC_APP_MATOMO_ID
# Server-only variables are provided at runtime, as kubernetes secrets.
ENV ENV_VALIDATION=build
COPY . .
RUN bun run build

# serve
# ---------------------------------------------------------------------------------------------------------------------

FROM base AS serve
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# The server build bundles all dependencies but `sharp`, see the `bundle-server-dependencies` plugin in `astro.config.ts`.
COPY --chown=bun:bun --from=install-sharp /sharp/node_modules/ ./node_modules/
COPY --chown=bun:bun --from=build /app/dist/ ./dist/
USER bun
EXPOSE 3000
CMD ["bun", "./dist/server/entry.mjs"]
