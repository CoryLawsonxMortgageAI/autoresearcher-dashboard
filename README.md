# autoresearcher

Autopilot research agent + operator dashboard.

> The dashboard is the operator's primary observability surface. If
> something is happening server-side that doesn't appear here, that's a bug.

Karpathy-minimal in spirit. nanoGPT-aesthetic. One concept per file when
the concept is small. No `any`. No floats for money. Prompts in source.

## Layout

```
apps/web/              Next.js 14 dashboard (dark, monospace, terminal-aesthetic)
services/api/          Hono API + SCOUT/CRITIC/HISTORIAN agents + cron
services/worker/       Dockerfile + fly.toml for the cron worker
packages/shared/       Zod-validated types, bigint-cents Money
packages/db/           Drizzle MySQL schema (PlanetScale-compatible)
packages/skills/       Vertical allowlist + deterministic scorer + prompts
packages/evals/        Tier A/B/C runner + checked-in fixtures
packages/tsconfig/     Shared TS base config
scripts/               bootstrap.sh, sync-secrets.ts, seed-fixtures.ts, hooks/
docs/adr/              Architecture decisions
docs/runs/             HISTORIAN write-ups + _inflight.md
.claude/hooks.json     PreToolUse / PostToolUse policy gates
.github/workflows/     ci, deploy, revert, auto-merge-tier1 (gated off by default)
backend/               LEGACY: GPU monitoring FastAPI (see ADR 0008)
```

## Quick start

```bash
pnpm install
cp .env.example .env  # fill in secrets, or `pnpm sync-secrets` from Vercel
pnpm bootstrap        # install + migrate + seed + dev + open browser
```

The dashboard is at `http://localhost:3000/activity`. The API is at
`http://localhost:3001`.

## Production

- **apps/web** + **services/api**: Vercel (`vercel.json`).
- **worker**: Fly.io or Railway via `services/worker/Dockerfile`.
- **db**: PlanetScale (MySQL/Vitess) via `DATABASE_URL`.
- **events**: Pusher Channels (with DB-durable fallback in `events` table).
- **email**: Resend (weekly digest, signed magic-link greenlight buttons).
- **observability**: Sentry + OpenTelemetry.
- **secrets**: Vercel env, pulled to worker via `scripts/sync-secrets.ts`.

See `docs/runs/phase-6.md` for the env vars the operator must set.

## How the autopilot runs

1. **Nightly SCOUT** (cron `0 3 * * *`) walks the vertical allowlist in
   `packages/skills/autoresearcher/verticals.json`, calls Claude Opus per
   vertical, validates the JSON output, scores deterministically, and
   inserts into `opportunities`. Each insert publishes
   `opportunity_added` on the `opportunities` Pusher channel.
2. **Live dashboard toast**: any browser open to `apps/web` sees a toast
   pop in real time via `<PusherToast />`.
3. **Weekly digest** (cron `0 9 * * MON`) takes the top 10 new opps,
   issues per-opportunity signed-magic-link greenlight + skip URLs,
   renders an email in the same monospace dark idiom, sends via Resend.
4. **One-tap merge** (Tier-2): operator reviews on `/merges`, taps; the
   `merged_by_user_id` audit column records *their* sub from the
   verified JWT.
5. **Mandatory revert** (24h after merge): one button, one workflow:
   `git revert -m 1` + down migration + Vercel rollback.

## Notion + Obsidian

On greenlight, the opportunity is mirrored to:
- A Notion database (`NOTION_OPPORTUNITIES_DB`) — one page per opportunity
  with title, vertical, score, recommendation, evidence, critic notes.
- An Obsidian vault (`OBSIDIAN_VAULT_PATH`) — one markdown file per
  opportunity with YAML frontmatter Obsidian recognises.

Both are downstream mirrors. The MySQL `opportunities` table is the
source of truth. See `docs/adr/0007-integrations-notion-obsidian.md`.

## Directive compliance

The directive at the top of `claude/autopilot-phase-6-MepF2` was
specified as Phase 6 of an autoresearcher v1.0 system whose phases 0–5
did not exist in this repo. On 2026-05-09 the operator authorized
Option C: invent phases 0–5 inline. The build that resulted is recorded
in:

- `docs/adr/0002-additive-plan.md` — the plan
- `docs/adr/0003-tech-stack.md` — tech choices
- `docs/adr/0004-monorepo-layout.md` — layout
- `docs/adr/0005-hooks-and-stop-conditions.md` — policy gates
- `docs/adr/0006-merge-policy.md` — merge policy as amended
- `docs/adr/0007-integrations-notion-obsidian.md` — Notion + Obsidian sync
- `docs/adr/0008-legacy-backend.md` — disposition of `backend/`
- `docs/runs/phase-{0..6}.md` — per-phase HISTORIAN docs
- `docs/runs/v1.0-launch.md` — final ship doc
- `BLOCKER-phase-6-2026-05-09.md` — original BLOCKER, marked resolved

## Stop conditions in force

Per `docs/adr/0005-hooks-and-stop-conditions.md`, runtime stop conditions
are wired:
- Per-run cost > $10 OR cumulative > $100 → halt + BLOCKER
- Out-of-allowlist vertical → SCOUT rejects at tool layer + BLOCKER on
  first occurrence
- Pusher down >60s → degraded health, watchdog files BLOCKER
- Tier-3 auto-merge attempt without `AUTOMERGE_AUTHORIZED` → hook blocks
- Eval Tier-A regression → CI cascade fails, deploy blocked

## Legacy GPU dashboard

The `backend/` directory predates this build. It is a FastAPI GPU
monitoring dashboard that runs on Railway via `railway*.{json,toml,py}`.
ADR 0008 documents why we leave it in-tree for v1.0.

## Credits

- Original autoresearch: Andrej Karpathy.
- Windows fork: @jsegov.
- v1.0 build (this README): operator-authorized inline buildout, 2026-05-09.
