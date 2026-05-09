# ADR 0012 — Iteration 08: closing the Reflexion loop, trajectory viewer, bench expansion, chat self-eval

Status: Adopted (operator request 2026-05-09: "iterate")

## Decisions

Four small wins in one iteration. None of them required new dependencies.

### 1. CRITIC writes reflections (close the Reflexion loop)

Before: only SCOUT wrote reflections (one per vertical, per run).
After: CRITIC writes one reflection per opportunity review, scoped to the
opportunity's vertical, format `[<verdict>] <title>: <topRisk>`.

SCOUT now reads the **last 3 CRITIC reflections + last 2 SCOUT reflections**
per vertical before each per-vertical Claude call. CRITIC reflections carry
the higher signal because they encode what failed adversarial review last
cycle; SCOUT reflections encode what dropped at the evidence floor.

Implementation: `services/api/src/agents/critic.ts:reviewOpportunity`
appends `kind: "verdict"` and `kind: "llm"` rows to the trajectory log AND
calls `writeReflection()` after each verdict. Best-effort — DB unavailability
does not fail the review.

### 2. Trajectory viewer (`/trajectories`)

Before: trajectory JSONL files were written but only inspectable via shell.
After: the dashboard surfaces them. `GET /api/trajectories` lists the 200
most recent (run_id, size, modified_at). `GET /api/trajectories/:runId`
returns parsed steps. `/trajectories/[runId]` page renders LLM steps with
foldable userJson + output, tool calls with input/output, verdicts with
the verdict tag, and parse-errors clearly flagged.

Why this matters: when SCOUT or CRITIC behaves unexpectedly, the operator
can read the exact prompt + response without grepping JSONL on disk.

The trajectory directory is still local-filesystem (default
`./data/trajectories/`). For multi-instance deploys this needs an object
store; that's deferred until we actually run multi-instance.

### 3. Bench expansion (Tier-D 3 → 5 problems)

Added two adversarial problems that exercise patterns the autoresearcher
itself uses in production:

- `04-retry-with-backoff` — async retry with exponential backoff, jitter,
  and a non-retryable short-circuit. Mirrors the patterns in
  `services/api/src/lib/pusher.ts` and the worker's secret-pull retry.
  Tests cover: success-on-first, success-after-N-failures, maxMs cap,
  non-retryable short-circuit (no extra sleeps), invalid attempts=0.
- `05-jwt-claim-extractor` — parse-only JWT claim reader. NOT a verifier;
  documented as "the path where verifyJwt happened upstream". Tests cover:
  valid token, malformed segments, wrong-typed claims, missing required
  claims, base64url edge cases.

Static bench: 5/5 PASS in 6.4s on this sandbox (was 3/3 in 3.6s).

### 4. Chat self-eval

Programmatic test (`services/api/test/chat-tools.test.ts`) that asserts
the structural guarantees of the chat agent surface:

- The TOOLS array does **not** contain `greenlight`, `reject`, `merge`,
  `revert`, `tap_merge`, `edit_verticals`, or `write_skill`.
- The system prompt explicitly tells the model "may NOT greenlight or
  reject" and references the operator's interactive tap.
- `dispatchTool` throws on unknown tool names (defense in depth).
- Cost-warning copy is present on `review_opportunity` and `run_scout_now`.
- `MAX_TOOL_ITERATIONS` is bounded (≤ 20).

This is a static-analysis test — it greps the source so it does NOT need
an API key, does NOT instantiate the Anthropic SDK, and runs in <10ms.

The test runs in CI as part of `pnpm -r test` (which the cascade already
invokes via `--if-present`).

## Why these and not others

The next-larger improvements considered but **not** taken this iteration:

- **Object-store trajectory storage**. Worth it under multi-instance, not
  now. Tracked.
- **Eval Tier-E (real SWE-bench mini)**. Worth it once we have a Docker
  sandbox for `bench:live`. Tracked in ADR 0010 §9.
- **Two-way Notion sync**. Operator hasn't asked.
- **Chat write-back through magic links** (e.g., chat agent could mint a
  greenlight magic link the operator clicks). Deferred — current friction
  is fine.

## Verification (this commit)

- `pnpm -r typecheck` ✅ all 8 packages
- `pnpm evals` ✅ Tier A/B/C 8/8
- `pnpm bench` ✅ Tier D static 5/5
- `pnpm -r test --if-present` ✅ chat-tools 5/5

Total LLM cost during this build: $0.
