# phase-8 — iterate

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

Four small additive wins (ADR 0012):

1. **CRITIC reflections** — close the Reflexion loop. CRITIC now writes a
   one-line reflection per review, scoped to the opportunity's vertical.
   SCOUT reads the last 3 CRITIC + 2 SCOUT reflections per vertical.
2. **Trajectory viewer** — `/trajectories` page + `/api/trajectories`
   route. Operators can inspect the JSONL log of any agent run, with
   foldable user JSON, output text, tool call traces, and verdict tags.
3. **Bench expansion** — 3 → 5 problems. Added `04-retry-with-backoff`
   (async retry with backoff/jitter/short-circuit) and `05-jwt-claim-extractor`
   (parse-only JWT claim reader). Both mirror patterns the autoresearcher
   itself uses in production.
4. **Chat self-eval** — vitest test asserts the chat agent's tool surface
   does NOT include greenlight/reject/merge/revert and the system prompt
   explicitly forbids those. Static-analysis test; runs in <10ms; no API
   key required.

## Verification

- `pnpm -r typecheck` ✅ 8 packages
- `pnpm evals` ✅ Tier A/B/C 8/8
- `pnpm bench` ✅ Tier D static 5/5
- `pnpm -r test --if-present` ✅ chat-tools 5/5

## What I'd do differently

The trajectory page is operator-readable but it's read-only. Next time I'd
add per-step "rerun this prompt" buttons so the operator can test the
agent's response under different prompt variations without writing a CLI
script. Tracked for the next iteration.

## Next checkpoint

The chat agent + SCOUT/CRITIC loop now has end-to-end audit (DB tables for
opportunities/reflections/events + JSONL trajectory + UI surfaces). The
unblocked path forward is operator-driven: set the env vars, run the cron,
have the agents make decisions against real data.
