# ADR 0006 — Merge policy (as amended 2026-05-09)

Status: Adopted (with operator override)
Amends: directive section "Merge policy"

## Tiers

### Tier-1 — auto-merge eligible (cascade + 5min cooldown)
Paths: `/docs/**`, root `*.md`, `/packages/evals/**` (additive only).
Required: full cascade green, CRITIC approve, no schema changes, no
`package.json` changes, no `.env*` changes, no workflow/CI changes.

Implemented by `.github/workflows/auto-merge-tier1.yml`. The workflow's
`if: vars.AUTOMERGE_AUTHORIZED == 'true'` keeps it disabled until the
operator sets the repo variable, which is itself contingent on the signed
`/.automerge-authorized` file + 24h elapsed (operator pre-commitment). The
agent must NEVER create that file or set that variable.

### Tier-2 — one-tap merge (default for code)
All product code, schema migrations (additive), dependency changes, CI
changes that aren't workflow/permissions.

Cascade runs; the dashboard's `/merges` view shows diff, evidence panel,
candidate comparisons, critic verdicts, eval delta, cost, and a
CRITIC-authored merge-safety summary covering: what changed, what could
break, what rollback looks like.

The operator taps Merge in `/merges`. The merge action authenticates with
the operator's JWT — the `merges.merged_by_user_id` audit column records
*their* user_id, not the agent's.

### Tier-3 — protected
Paths: `auth/`, destructive migrations (drop/alter columns),
`.github/workflows/`, `vercel.json`, secret rotation, `/legal/**`.

**Original directive**: required review of actual diff in GitHub UI;
dashboard surfaces "open in GitHub" link only.

**2026-05-09 amendment (operator-authorized, permanent)**: agent may
self-merge Tier-3 PRs. Rationale per operator: speed of iteration on the
autopilot itself. The hook `require-merge-jwt` still requires the merge to
go through `gh pr merge --admin` with `OPERATOR_JWT` in env, OR
`AUTOMERGE_AUTHORIZED=true`. The audit trail still records the merging
user_id. The mandatory revert path
(`.github/workflows/revert.yml`) still applies and now matters more.

Even with the override, three things stay true:
1. The agent must NEVER create `/.automerge-authorized`.
2. The agent must NEVER set `AUTOMERGE_AUTHORIZED` in any committed file.
3. CRITIC's merge-safety summary is still required for any Tier-3 PR; the
   summary is what makes the override defensible after the fact.

## Auto-merge enablement

Tier-1 auto-merge OFF until Cory:
1. Creates `/.automerge-authorized` (commit signed with his GPG key).
2. Sets repo variable `AUTOMERGE_AUTHORIZED=true`.
3. Waits 24h since file commit.

Tier-3 self-merge IS NOT covered by `AUTOMERGE_AUTHORIZED`. It's covered
by the override in this ADR + the operator-JWT check in the hook. They're
separate doors.

## Revert path (mandatory)

Every merged PR (Tier-1, Tier-2, Tier-3) gets `[Revert]` on the dashboard
for 24h after merge.

Revert action:
1. `git revert -m 1 <merge-sha>` on `main`.
2. Run down migration if any (the migration file's filename includes
   `.down.` or `.destructive.`; otherwise no-op).
3. `vercel rollback` to the prior production deployment.

Implemented in `.github/workflows/revert.yml`, dispatched from
`POST /api/merges/:prNumber/revert`.

## Rate ceiling (always on)

Max 5 Tier-1 auto-merges per hour, 20 per day.
Implemented at the workflow concurrency level + a runtime check in
`services/api/src/routes/merges.ts` (the `tap` endpoint refuses if the
hourly/daily counters are over).

If exceeded → halt auto-merge, file BLOCKER (`kind=rate-ceiling`).
