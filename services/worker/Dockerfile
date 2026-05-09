FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autoresearcher/api build || true

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
# Boot order:
#   1. Pull secrets from Vercel into .env.runtime (strips AUTOMERGE_AUTHORIZED)
#   2. Run cron entrypoints: scout-nightly + digest-weekly + inflight-status
CMD ["sh", "-c", "node scripts/sync-secrets.ts || true; pnpm --filter @autoresearcher/api cron:bootstrap"]
