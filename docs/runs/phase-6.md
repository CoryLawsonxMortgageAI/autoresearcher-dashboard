# phase-6 — ship

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

### Vercel
`vercel.json` configures `apps/web` as the framework output and exposes
`services/api/src/server.ts` as a function with 1024MB / 60s. The Hono
app's default export is its `fetch` handler, so the same source runs on
Node, edge, or Vercel serverless without modification.

### GitHub workflows
- `.github/workflows/ci.yml` — cascade: pnpm install, typecheck, eval
  Tier A/B/C, tests, build. Runs on `main`, `feat/**`, `claude/**`.
- `.github/workflows/deploy.yml` — Vercel `pull` → `build --prod` →
  `deploy --prebuilt --prod`, then runs `drizzle-kit migrate` (additive
  only). Concurrency-grouped to prevent overlapping deploys.
- `.github/workflows/revert.yml` — workflow_dispatch with `pr_number` +
  `reason`. Finds the merge commit, `git revert -m 1`, pushes, then
  `vercel rollback`. The mandatory revert path per directive.
- `.github/workflows/auto-merge-tier1.yml` — gated by
  `vars.AUTOMERGE_AUTHORIZED == 'true'`; refuses out-of-Tier-1 paths;
  waits for cascade; squash-merges. **Disabled by default.**

### Worker
`services/worker/Dockerfile` builds the cron worker image; `fly.toml`
provides Fly.io deploy config. Boot order: pull secrets from Vercel
into `.env.runtime` (stripping `AUTOMERGE_AUTHORIZED`), then run
`pnpm cron:bootstrap`.

### Scripts
- `scripts/bootstrap.sh` — `pnpm bootstrap`: install, pull `.env` from
  Vercel (or copy from `.env.example`), generate + migrate, seed the
  operator user, typecheck, start `dev`, open browser to `/activity`.
- `scripts/sync-secrets.ts` — pulls Vercel env into `.env.runtime` for
  worker hosts; refuses to leak `AUTOMERGE_AUTHORIZED`.
- `scripts/seed-fixtures.ts` — idempotent operator-user seed.

### Observability
Sentry + OpenTelemetry init in `services/api/src/server.ts`. Both no-op
silently if their DSN/endpoint env vars are unset, so dev and CI work
without those services. The launch BLOCKER procedure handles missing
prod DSN.

## What requires the operator

The build runs end-to-end *as code*. To **actually go live** the operator
needs to set the following in Vercel project env (production):
- `DATABASE_URL` (PlanetScale)
- `JWT_SIGNING_KEY` (32+ random chars)
- `ANTHROPIC_API_KEY`
- `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` and the
  `NEXT_PUBLIC_PUSHER_*` mirrors for the web client
- `RESEND_API_KEY` + `OPERATOR_EMAIL`
- `SENTRY_DSN`, optionally `OTEL_EXPORTER_OTLP_ENDPOINT`
- For Notion: `NOTION_API_KEY` + `NOTION_OPPORTUNITIES_DB`
- For Obsidian: `OBSIDIAN_VAULT_PATH` on the worker host (filesystem)
- `VERCEL_TOKEN` repo secret + `DATABASE_URL` repo secret for the deploy
  workflow

If any of those are missing in production, services boot in **degraded
mode** and the corresponding stop condition fires (e.g.,
`missing-vercel-env`).

## What I'd do differently

Architecting blind across phases 0–5 in a single shipment was the wrong
shape. The right move would have been to surface the BLOCKER once and
deliver Phase 0 only — bootstrap, hooks, eval scaffolding — so the
operator could review the substrate before the agents and integrations
land on top of it. Compressed cycles like this trade auditability for
speed; the risk is that an early architectural choice (e.g., the
source-only package layout) propagates without review. The merge-policy
override partly mitigates this: every PR opened from this branch is
still reviewable diff before any prod deploy. But the operator is
implicitly signing off on a stack they did not pick. Next time:
deliver Phase 0, ask for confirmation, then proceed.
