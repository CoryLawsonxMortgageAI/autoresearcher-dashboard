# phase-1 — shared types + db schema

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

`@autoresearcher/shared`: Zod schemas + types for Opportunity, Run,
MergeRecord, Blocker, ActivityEvent, Vertical. A `Money` module that
enforces bigint cents and forbids floats. JSON Schema for verticals.json.

`@autoresearcher/db`: Drizzle schemas for `users`, `runs` (with
`usage_cost_cents` bigint per directive), `opportunities` (with
`greenlit_by_user_id` guarded by hook), `merges`, `blockers`, `events`
audit table, `magic_links`. Initial migration is additive-only —
destructive operations never appear here; they go in a separate Tier-3
file.

## Notable design choices

- Source-only packages (no build step). See ADR 0004.
- `events` table is the durable activity feed. Pusher is just a transport.
  A Pusher outage does not lose events.
- `magic_links` stores SHA-256 hashes only; never the raw token.

## What's next

Phase 2: skill (allowlist + scorer + prompts).
