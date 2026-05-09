# ADR 0009 — Self-learning loop and coding bench

Status: Adopted (operator request 2026-05-09: "make this self learning if karpathy would")

## Decision

Self-learning is **in-context learning over a versioned prompt bank**, not
fine-tuning, not embeddings. Operator decisions become few-shot examples
that steer the next SCOUT cycle. Coding ability is bench-marked against
synthetic problems with checked-in tests.

This is the Karpathy-honest interpretation: the bulk of "self-improving
agent" papers are this in disguise — own it, version it, surface it.

## What learns

| Signal                                          | Becomes                          | How                                  |
|-------------------------------------------------|----------------------------------|--------------------------------------|
| `opportunities.status = greenlit`               | "DO" few-shot example            | Top-K by score, distilled weekly     |
| `opportunities.status = rejected`               | "AVOID" few-shot example         | Top-K by score, distilled weekly     |
| `opportunities.critic_verdict` + `critic_notes` | "why" annotation on each example | Verbatim, truncated to 200 chars     |
| Greenlight / rejection rate per vertical        | Allowlist health metric          | Surfaced on `/learn`                 |

## What does NOT learn (explicit non-goals)

- The `verticals.json` allowlist. Allowlist mutation is operator-authored,
  CRITIC-reviewed, ADR-recorded (per directive). Self-learning never edits it.
- The deterministic scorer. Score weights are code, reviewed in PRs. We do
  not let the system tune its own evaluator (Goodhart).
- The system prompts (`SCOUT_SYSTEM`, `CRITIC_SYSTEM`, `HISTORIAN_SYSTEM`).
  These stay stable for prompt-cache hit rate. Few-shot examples go in the
  *user* JSON instead.
- The CRITIC's verdict logic. CRITIC is meant to be adversarial; making it
  learn from operator approvals would collapse it into a CRITIC-of-the-past.

## Versioning

Each distillation writes `packages/learn/fixtures/prompt-bank/v{N}-{date}.json`.
SCOUT loads the highest version on every run. Operators can `git checkout` a
previous version if a new one regresses Tier-A/B/C/D evals — the prompt
bank lives in source control, not a database.

`v0-bootstrap.json` ships empty so the system has something to load on the
first run before any operator decisions exist.

## Coding bench (Tier D)

`packages/learn/fixtures/coding-bench/` holds problems. Each problem has:
- `spec.md` — natural-language problem
- `tests.ts` — assertions; imports `./solution.ts`
- `reference-solution.ts` — known-good (for `--static` mode + diff)

Modes:
- `pnpm bench` — static. Copies reference into `solution.ts`, runs tests.
  PASS means harness works. CI runs this on every PR.
- `pnpm bench:live` — calls Claude with the spec, writes the response,
  runs tests. Score = pass-rate. Tier-D threshold ≥ 0.6. Triggered manually
  via workflow_dispatch.

Static mode is intentionally checked: if the harness regresses, we want CI
to scream loudly. Live mode is gated behind `workflow_dispatch` because it
costs money and benefits from operator oversight.

Initial problems:
1. `01-debounce` — typed higher-order debouncer
2. `02-evidence-validator` — evidence floor + distinct-domain check
3. `03-score-clamper` — deterministic 5-axis scorer mirror

The bench problems are deliberately drawn from invariants the production
system actually enforces. If the agent can't write a domain-distinct
evidence validator, it can't be trusted to debug an evidence-floor
regression.

## Cron

`services/api/src/cron/distill-weekly.ts` runs `0 10 * * MON` (after the
digest at 09:00). It shells out to `pnpm distill`, which reads recent
operator decisions and writes the next versioned bank file. The bank
file is then committed by the operator on next push (or by a follow-up
workflow if Tier-1 auto-merge is enabled).

## Surface

`/learn` page shows the latest bank version, the greenlight rate, and
the rendered examples. Audit-friendly: any operator can see exactly what
the SCOUT will see on its next run.
