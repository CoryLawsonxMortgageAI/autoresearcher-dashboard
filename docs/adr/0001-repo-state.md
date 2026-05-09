# ADR 0001 — Actual repository state as of 2026-05-09

Status: Snapshot (read-only, do not edit history)
Date: 2026-05-09
Branch: claude/autopilot-phase-6-MepF2 (working from main: `a0d933c`)

## tl;dr

The repository this directive is being executed against is **not the
repository the directive describes**. The directive assumes a
multi-package TypeScript monorepo with prior phases 0–5 complete; the
actual repo is a 3-commit Python/FastAPI GPU-monitoring dashboard
deployed to Railway, with no frontend, no monorepo layout, no
agents, no eval system, and no prior ADRs.

## Git state

- Branch: `claude/autopilot-phase-6-MepF2` (clean working tree)
- Commits on `main`:
  - `a0d933c` — Remove Vercel config - use Railway instead
  - `4aea62d` — Add Vercel configuration for Docker deployment
  - `d42b789` — Initial commit - AutoResearcher Dashboard for Railway
- No tags. No prior PRs visible from local state. No prior ADRs.

## Filesystem inventory

```
./.gitignore
./README.md                      Palantir-styled GPU dashboard pitch
./railway.json                   Railway NIXPACKS deploy config
./railway.toml                   Railway build/deploy resources
./railway_entrypoint.py          25 lines — Railway entrypoint
./render.yaml                    Render.com fallback config
./backend/main.py                576 lines — FastAPI app
./backend/cloud_gpu.py           385 lines
./backend/requirements.txt       FastAPI / uvicorn / pynvml / psutil
./backend/agents/__init__.py
./backend/agents/swarm.py        588 lines — "swarm" agents module
./backend/app/services/runpod.py            254 lines
./backend/app/services/runpod_service.py    334 lines
```

Total: ~2,162 lines of Python across ~6 files. No frontend
sources are checked in (the README references `frontend/` but it
does not exist in git). No `/apps/web`, no `/services/api`, no
`/packages/**`, no `/docs/**`, no `/.claude/**`, no `/scripts/**`.

## What the directive assumes exists, but does not

| Directive reference                                  | Actual repo |
|------------------------------------------------------|-------------|
| `/apps/web`                                          | absent      |
| `/services/api`                                      | absent      |
| `/packages/evals/**`                                 | absent      |
| `/packages/skills/autoresearcher/verticals.json`     | absent      |
| `/scripts/sync-secrets.ts`                           | absent      |
| `/.claude/hooks.json`                                | absent      |
| `/.automerge-authorized`                             | absent (correct: the agent must never create it) |
| `/docs/adr/**` (any prior ADR)                       | absent      |
| `/docs/runs/_inflight.md`, `/docs/runs/phase-*.md`   | absent      |
| `pnpm bootstrap` script                              | absent      |
| `drizzle-kit migrate` configuration                  | absent      |
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` | absent    |
| SCOUT, CRITIC, HISTORIAN agent implementations       | only `backend/agents/swarm.py` exists; not the same shape |
| `opportunities` table / schema                       | absent      |
| `runs.usage_cost` column                             | absent      |
| Pusher channel / live event publisher                | absent      |
| Vercel project / `vercel.json`                       | **explicitly removed** in commit `a0d933c` |
| PlanetScale (or any) MySQL                           | absent; `render.yaml` references a Render Postgres named `autoresearcher-db`, but no schema |
| Sentry / OpenTelemetry / Honeycomb / Grafana Cloud   | absent      |
| Resend / SendGrid integration                        | absent      |
| `feat/*` branch convention                           | not in use; only `main` and the Claude phase branch exist |
| Eval gates (Tier-A/B/C)                              | no eval system exists |

## What does exist

- A FastAPI app intended to run on Railway, exposing `/api/health`,
  GPU metrics endpoints (per README), websocket broadcasting, and
  experiment endpoints. I have not yet read these files in detail.
- A `backend/agents/swarm.py` module of unknown design — possibly
  early scaffolding that the directive's SCOUT/CRITIC/HISTORIAN
  pattern is meant to replace or extend.
- RunPod service stubs in `backend/app/services/`.
- Railway and Render deploy configs.

## Implication

Phase 6 cannot be completed against this repository without first
doing all of Phases 0–5 (which themselves are not described in any
file I have access to — only Phase 6 was supplied). Even Phase 0,
which the directive instructs me to "begin" after writing this
file, is undefined here.

I am **not** going to attempt to invent the prior phases or
reverse-engineer them from Phase 6 references. That would be
exactly the kind of unbounded scope creep the directive's stop
conditions exist to prevent.

I am stopping here and filing a BLOCKER. See
`/BLOCKER-phase-6-2026-05-09.md`.
