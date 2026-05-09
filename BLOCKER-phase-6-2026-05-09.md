<!-- BLOCKER-RESOLVED 2026-05-09 -->

> **Resolved 2026-05-09.** Operator (Cory) selected Option C via
> AskUserQuestion: invent phases 0–5 inline. He also granted permanent
> Tier-3 self-merge override and confirmed identity. The plan is recorded
> in `docs/adr/0002-additive-plan.md`; the merge-policy amendment is in
> `docs/adr/0006-merge-policy.md`; the build itself is in commits on
> `claude/autopilot-phase-6-MepF2` and the run doc is at
> `docs/runs/v1.0-launch.md`. Leaving this file in-tree as the audit trail.

---

# BLOCKER — phase-6 — 2026-05-09

Filed under directive stop condition: **"Material ambiguity in this directive."**
Branch: `claude/autopilot-phase-6-MepF2`
Filed by: autoresearcher autopilot agent (Claude), pre-Phase-0

## What I tried to do

Execute the directive's first two actions:
1. Write `/docs/adr/0000-meta.md` summarizing the directive in my own words.
2. Read existing repo state, write `/docs/adr/0000-repo-state.md` and
   `/docs/adr/0001-additive-plan.md`, run `vercel env ls`, then begin Phase 0.

## What happened

Action 1 completed (`docs/adr/0000-meta.md` written).
Action 2 stopped after the repo-state read (`docs/adr/0001-repo-state.md`
written) because the repo state and the directive are incompatible at the
foundation. The directive presupposes a TypeScript monorepo with phases 0–5
already shipped and a multi-agent autoresearcher system in place; the actual
repo is a 3-commit Python/FastAPI GPU-monitoring dashboard for Railway with
~2,162 lines of code, no frontend, no monorepo, no eval system, no prior
ADRs, and Vercel config that was explicitly removed in the previous commit.

I did not run `vercel env ls`. I have no Vercel credentials in this
sandbox, and even if I did, the repo no longer has a Vercel project linked.
Running it would produce a misleading error rather than diagnostic signal.

I did not write `0001-additive-plan.md`. I cannot draft an additive plan
when the base is undefined: there is no SCOUT, no CRITIC, no HISTORIAN, no
opportunities table, no Pusher channel, no eval system, no `/apps/web`, no
`/services/api`. An "additive plan" against this repo is not Phase 6
work — it would be Phases 0–5 in their entirety, which were not provided.

## Diagnosis

Three plausible root causes, in the order I'd investigate them:

1. **Wrong repository**. The directive was authored for a different
   repository (the autoresearcher monorepo) and was routed to this
   dashboard repo by mistake. The repo name `autoresearcher-dashboard`
   suggests it is *one component of* the system the directive describes,
   not the whole thing.
2. **Greenfield expectation**. The directive expects me to bootstrap the
   entire autoresearcher system inside this repo, treating phases 0–5 as
   implicit prerequisites I must invent. If so, this is a multi-week
   project, not a one-session Phase 6 — directly violating the directive's
   own scoping ("[~1 session]") and per-run cost ceilings ($10/run,
   $100 cumulative).
3. **Phases 0–5 exist elsewhere**. They may be on a different branch, a
   different repo, or in a context I have not been shown. I cannot
   ship Phase 6 on top of phases I cannot see — the directive's
   eval-gate, hook, and merge-policy requirements all reference
   artifacts that I would have no way to validate against.

In all three cases the answer is the same: **stop and surface this to
the operator before consuming budget.**

## Three ranked options

### Option A (recommended) — operator clarifies which repo and which phase
Cory confirms whether (a) this is the wrong repo and points me at the real
autoresearcher monorepo, (b) phases 0–5 exist on another branch / under
another path I should pull in, or (c) the intent really is greenfield and
he wants a re-scoped multi-session plan with new cost ceilings. I write a
new directive-aligned plan against whichever answer he gives.

### Option B — re-scope Phase 6 to apply to *this* repo only
Treat the existing FastAPI dashboard as "the dashboard" and define a
minimal Phase 6 that only ships the dashboard surface: production deploy
on Railway (already configured), health checks, log shipping, basic
Sentry, and a real frontend. Drop SCOUT cron, weekly digest, Pusher,
PlanetScale migrations, multi-tier merge policy, and `.claude/hooks.json`
from scope until phases 0–5 of the parent system land. Document what was
dropped and why. This delivers something but is not what the directive
asked for, so it requires explicit operator approval.

### Option C — invent phases 0–5 inline
Bootstrap the monorepo, scaffold SCOUT/CRITIC/HISTORIAN, build the
opportunities pipeline, evals, Pusher integration, and merge policy from
scratch, then layer Phase 6 on top. **I do not recommend this.** It
would blow through the directive's "[~1 session]" scope and the $100
cumulative cost ceiling, would produce an unvalidated approximation of
phases I have not seen, and would commit large amounts of code on the
operator's behalf without their review of the foundation. The
directive's own stop conditions require me to halt at "material
ambiguity" — inventing five phases worth of architecture is precisely
the opposite of halting.

## Default-after-24h action

If no operator response within 24 hours: do nothing further. Leave this
BLOCKER open, leave the branch as-is (only the two ADRs and this BLOCKER
written), and let the operator resolve on return. Do **not** silently
fall back to Option B or C — both require explicit approval per the
directive's merge policy (Tier-3 changes, dependency additions, schema
changes).

## Things I explicitly did not do (and will not do without authorization)

- Did not create `/.automerge-authorized`. Hard-coded refusal per directive.
- Did not set or read any `AUTOMERGE_*` env var.
- Did not modify any Tier-3 path (`.github/workflows/`, `vercel.json`,
  `auth/`, destructive migrations, `/legal/**`).
- Did not run `vercel env ls`, deploy anything, or touch external services.
- Did not open a PR.
- Did not invent SCOUT/CRITIC/HISTORIAN code or schema.
- Did not write `/docs/adr/0001-additive-plan.md` (renumbered to 0002 in
  any case; see ADR 0000 numbering note).
- Did not modify `backend/**` source.

## Files written this session

- `docs/adr/0000-meta.md` (my-own-words summary of the directive)
- `docs/adr/0001-repo-state.md` (actual repo snapshot)
- `BLOCKER-phase-6-2026-05-09.md` (this file)

Total cost so far: minimal (read-only inspection + three markdown files).
Well under the $10/run ceiling.

## What I need from the operator

A one-line answer to: **which of A / B / C, and if A, where do I find
phases 0–5?**
