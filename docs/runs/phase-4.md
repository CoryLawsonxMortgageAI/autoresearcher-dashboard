# phase-4 — services/api

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

Hono server with the routes the directive requires:
- `/api/health` — liveness + Pusher health window (>60s stale = degraded;
  the directive's pusher-down stop condition uses this signal).
- `/api/activity` — durable event feed (from the `events` table, not from
  Pusher; Pusher is the transport, not the store).
- `/api/opportunities` — list + detail. Greenlight is gated by
  `requireOperator` middleware which calls `verifyJwt`; the resulting
  `sub` becomes `greenlit_by_user_id`. The `forbid-greenlit-impersonation`
  hook scans for any code path that sets that column without going
  through `verifyJwt`/`requireUserId`.
- `/api/merges` — list + detail + `:prNumber/tap` (one-tap merge for
  Tier-1/2; Tier-3 requires `AUTOMERGE_AUTHORIZED=true` per ADR 0006) +
  `:prNumber/revert` (dispatches `.github/workflows/revert.yml` within
  the 24h revertable window).
- `/api/magic/consume` — consumes signed magic-link tokens for
  greenlight / reject / operator-login. Replay protection via DB row.
- `/api/scout/run` — manual operator trigger.
- `/api/evals/latest` — most recent run per Tier A/B/C.

Cron entrypoints (`services/api/src/cron/`):
- `scout-nightly.ts` — `0 3 * * *` daily (overrideable via SCOUT_CRON).
- `digest-weekly.ts` — `0 9 * * MON` weekly. Issues per-opportunity
  signed magic-link greenlight + skip URLs, renders an HTML/text email
  in the same Karpathy idiom as the dashboard, sends via Resend.
- `inflight-status.ts` — `0 * * * *` hourly (HISTORIAN status overwrite).
- `bootstrap.ts` — imports all three for the worker process.

Integrations:
- Notion: REST POST to pages API on greenlight (per ADR 0007).
- Obsidian: filesystem write to `OBSIDIAN_VAULT_PATH` on greenlight.

Observability:
- Sentry init (no-op without DSN).
- OpenTelemetry NodeSDK with auto-instrumentations (no-op without
  `OTEL_EXPORTER_OTLP_ENDPOINT`).

## What's next

Phase 5: web dashboard.
