# phase-3 — agents

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

### SCOUT (`services/api/src/agents/scout.ts`)

Loop over verticals; one Claude Opus 4.7 call per vertical with the
SCOUT system prompt (cached) and a per-vertical user JSON. Output is
strict JSON validated by Zod (`ScoutFinding`). Each finding is
- vertical-checked at the tool layer (rejected and counted if out),
- scored deterministically,
- inserted into `opportunities`,
- announced via `opportunity_added` on the `opportunities` Pusher channel
  (and persisted to `events`).

Run accounting: `usage_cost_cents` is summed across all calls in the
run; `assertWithinCeiling` enforces the $10/$100 limits at finishRun.

### CRITIC (`services/api/src/agents/critic.ts`)

Two entry points:
- `reviewOpportunity(id)` — produces a structured verdict
  (approve | reject | needs-revision) + notes + a one-line top risk.
  Persists to `opportunities.critic_verdict` / `critic_notes`.
- `mergeSafetySummary({prNumber, ...})` — for the merge dashboard.
  Output ends with a `verdict:` line that `routes/merges.ts` parses
  before allowing the tap.

### HISTORIAN (`services/api/src/agents/historian.ts`)

Two entry points:
- `writePhaseDoc(phase)` — pulls runs, top opps, open blockers from DB;
  asks Sonnet 4.6 for a "what happened, what would I do differently"
  paragraph; writes `docs/runs/${phase}.md`. (For this initial build
  the docs were written inline by hand to avoid spending real budget;
  the function is in place for actual phase runs going forward.)
- `writeInflight(...)` — overwrites `docs/runs/_inflight.md` per the
  60-minute cadence requirement. Wired into `cron/inflight-status.ts`.

## What's next

Phase 4: services/api routes + cron + integrations.
