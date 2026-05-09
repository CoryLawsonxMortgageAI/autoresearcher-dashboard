# ADR 0005 — Hooks and stop conditions

Status: Adopted

## PreToolUse / PostToolUse hooks

Configured in `.claude/hooks.json`, implementations in `scripts/hooks/*.mjs`.

| Hook                              | Tool match                          | Effect                                                  |
|-----------------------------------|-------------------------------------|---------------------------------------------------------|
| forbid-bad-writes                 | Write/Edit                          | Reject `any`, money-as-number, TODO outside /scratch/, .env* (except .env.example) |
| forbid-destructive-bash           | Bash                                | Hard-block `rm -rf`, `DROP`, force-push, `gh repo delete`, `vercel env rm`, etc. |
| forbid-automerge-tampering        | Write/Edit/Bash                     | Hard-block writes to `/.automerge-authorized` or env lines containing `AUTOMERGE`. Stays in force despite the 2026-05-09 Tier-3 self-merge override. |
| require-merge-jwt                 | Bash matching `gh pr merge`         | Require `--admin` AND `OPERATOR_JWT`, OR `AUTOMERGE_AUTHORIZED=true`. |
| forbid-tier3-commits              | Write/Edit/Bash                     | Hard-block writes to Tier-3 paths unless `AUTOMERGE_AUTHORIZED=true`; files BLOCKER. |
| forbid-greenlit-impersonation     | Write/Edit                          | Block writes that set `greenlit_by_user_id` without going through `verifyJwt()` / `requireUserId()`. |
| queue-typecheck                   | Write to packages/**/src/**         | Append package path to `.tmp/typecheck-queue.txt`.       |
| trigger-historian                 | Bash matching `gh pr create`        | Drop `.tmp/historian-trigger.json` so HISTORIAN writes a phase doc. |

## Stop conditions

Implemented in code (`services/api/src/lib/cost-ceiling.ts`,
`services/api/src/lib/blockers.ts`, etc.) AND documented here:

| Trigger                                                              | Action                                                |
|----------------------------------------------------------------------|-------------------------------------------------------|
| Per-run cost > $10 OR cumulative > $100                              | `CostCeilingExceeded` thrown; run marked failed; BLOCKER filed (`kind=cost-ceiling`). |
| Missing required Vercel env var                                      | Service refuses to boot; BLOCKER filed (`kind=missing-vercel-env`). |
| Tier-C eval regression after model swap                              | Deploy halted; BLOCKER (`kind=tier-c-regression`).    |
| Destructive irreversible op attempted                                | Hook blocks; BLOCKER (`kind=destructive-op`).         |
| 3 consecutive Phase eval gate failures with same root cause          | Halt; BLOCKER (`kind=eval-gate-failure`).             |
| Opportunity vertical outside allowlist                               | SCOUT rejects at tool layer; counter incremented; BLOCKER (`kind=out-of-allowlist`) on first occurrence. |
| Auto-publish/list/bill/contact/trade request                         | Refused; BLOCKER (`kind=auto-action-refused`).        |
| External 4xx suggesting credential/permission issues                 | Job fails; BLOCKER (`kind=external-4xx`).             |
| Material ambiguity in directive                                      | Halt; BLOCKER (`kind=material-ambiguity`).            |
| Tier-3 auto-merge attempt (without override)                         | Hook blocks; BLOCKER (`kind=tier3-automerge-attempt`). |
| Rate ceiling exceeded (5/h or 20/d Tier-1)                           | Halt; BLOCKER (`kind=rate-ceiling`).                  |
| Revert action failing                                                | "Stop the world"; BLOCKER (`kind=revert-failed`).     |
| 2 consecutive auto-merged PRs producing Sentry errors within 1h      | Auto-disable Tier-1; BLOCKER (`kind=post-merge-sentry-spike`). |
| Pusher channel down >60s                                             | Halt work; BLOCKER (`kind=pusher-down`).              |

## Where stop conditions live

- **Cost ceilings** are enforced at the database boundary in `assertWithinCeiling()`.
- **Allowlist** is enforced at the tool layer in `requireAllowedVertical()`.
- **Pusher health** is exposed via `pusherHealth()` and surfaced in `/api/health`.
- **Eval gate failures** are surfaced by the CI `cascade` job; thresholds in
  `packages/evals/src/runner.ts` (Tier A: 1.0, B: 0.95, C: 0.8).
- **BLOCKER filing** via `services/api/src/lib/blockers.ts`: writes the
  markdown file at repo root with `<!-- BLOCKER-OPEN -->`, inserts a row in
  the `blockers` table, and emits `blocker_filed` over Pusher.
