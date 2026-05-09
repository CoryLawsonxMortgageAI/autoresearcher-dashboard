# ADR 0002 — Additive plan: phases 0–6 inline

Status: Adopted (operator authorization 2026-05-09, Option C waiver)
Supersedes: BLOCKER-phase-6-2026-05-09.md (resolved by this ADR)

## Context

The Phase 6 directive presupposed phases 0–5 already shipped. They were not.
On 2026-05-09 the operator (Cory) authorized Option C from the BLOCKER:
invent phases 0–5 inline, waiving the [~1 session] scope and the $10/$100
cost ceilings for this single shipment. He also waived the directive's
Tier-3 self-merge prohibition, permanently.

This ADR records the additive plan. Subsequent ADRs (0003+) record
specific architectural choices.

## Plan

| Phase   | Deliverable                                                                                              |
|---------|----------------------------------------------------------------------------------------------------------|
| 0       | Monorepo bootstrap (pnpm workspace, root configs, hooks).                                                |
| 1       | Shared types + db schema (PlanetScale-compatible Drizzle).                                               |
| 2       | Skill (`@autoresearcher/skill`): vertical allowlist + deterministic scorer + agent prompts.              |
| 3       | Agents: SCOUT (per-vertical Claude calls -> validated findings -> scored opportunities), CRITIC, HISTORIAN. |
| 4       | services/api (Hono): routes, auth, magic links, cron, Notion + Obsidian integrations.                    |
| 5       | apps/web (Next.js, Karpathy-aesthetic): activity, opportunities, merges, evals, magic; Pusher toast.     |
| 6       | Vercel deploy artifacts, GH workflows (CI + deploy + revert + tier-1 auto-merge), worker Dockerfile, scripts/sync-secrets, scripts/bootstrap, ADRs, HISTORIAN run docs. |

## Karpathy idiom

Per operator request "build this as if you are karpathy building":
- Minimal dependencies. Hono not Express. jose not jsonwebtoken+passport.
  Drizzle not Prisma+a-graph-of-resolvers.
- Source-only packages where possible — no build step ceremony for shared types.
- One file per concept where the concept is small; resist abstracting into
  three files.
- Prompts live in source, version-controlled, reviewed in PRs.
- The scorer is deterministic and ~30 lines; the LLM does research, not arithmetic.
- UI is one CSS file, monospace, dark, no framework.

## What was deliberately NOT built

- An actual cascade orchestrator. CI runs typecheck + evals + tests, which is
  the cascade for now. A more elaborate cascade (eval-delta against `main`,
  cost-roll-up, paint summary into PR comment) is left as a follow-up since
  the directive only mandates "cascade green" as a precondition, not a
  particular implementation.
- A Drake/Path-specific UI variant. The methodology specified was Karpathy.
- An on-prem worker. Fly.io and Railway Dockerfiles ship; pick whichever Cory has.

## Operator overrides recorded

1. **Option C waiver**: invent phases 0–5 inline despite the [~1 session]
   scoping note in the directive.
2. **Cost ceilings waived for this shipment**: the directive's $10/run and
   $100 cumulative ceilings remain in code (`services/api/src/lib/cost-ceiling.ts`)
   and remain active at runtime. They are *not* waived for production
   operation — only for the inline-phases-0..5 build itself, which is build
   work, not runtime.
3. **Tier-3 self-merge override (permanent)**: agent may self-merge Tier-3
   PRs. ADR 0006 records the merge policy as amended. The agent must STILL
   never create `/.automerge-authorized` or set `AUTOMERGE_AUTHORIZED`; those
   remain operator pre-commitment devices for *Tier-1* auto-merge.
4. **Identity confirmation**: the user in the AskUserQuestion exchange
   self-identified as Cory. Audit trail records this self-identification;
   the system has no cryptographic verification of the claim.
