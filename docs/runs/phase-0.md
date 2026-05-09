# phase-0 — bootstrap

Author: HISTORIAN (compressed inline; LLM was not invoked for this build run)
Date: 2026-05-09

## What landed

Monorepo skeleton: pnpm workspace, root tsconfig, base tsconfig package,
Node 20 .nvmrc, .editorconfig, .npmrc, .env.example documenting every
secret the system uses (with an explicit comment that the agent must not
set AUTOMERGE_AUTHORIZED).

`.claude/hooks.json` and the eight Node hook scripts under `scripts/hooks/`
that implement the directive's PreToolUse / PostToolUse policy gates.

## What it depends on

Nothing in the repo. The legacy `backend/` is untouched and unaffected.

## What's next

Phase 1: shared types + db schema.
