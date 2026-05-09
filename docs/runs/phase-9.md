# phase-9 — RAG-light + magic-link greenlights + Tier-E + production hardening

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

Seven thin wins under one PR, no new heavy dependencies.

1. **RAG-light**: chat `search_text` tool — substring search across
   opportunities (title/thesis/JSON-cast evidence), reflections (body),
   and skills (id/when/body). Multi-word queries AND-joined. No vector
   store.
2. **summarize_inbox**: cheap DB-only snapshot for the chat agent to
   ground itself on conversation start.
3. **mint_greenlight_link**: chat agent can mint signed magic links the
   operator clicks. `userId` on the link is the operator's verified sub
   (NOT the agent's). The vitest chat-tools test now structurally asserts
   the binding.
4. **Prompt-cache hit-rate audit**: `callClaude` returns
   `cacheCreationInputTokens` + `cacheReadInputTokens` from the prompt-
   caching beta endpoint; trajectory log records them; `/trajectories/<runId>`
   page computes and displays per-run hit rate.
5. **Tier-E SWE-mini**: multi-file bench with `01-evidence-ranker`.
   `pnpm swe-mini` (static) + `pnpm swe-mini:live` (live, gated on
   ANTHROPIC_API_KEY). Same Self-Refine retry loop as Tier-D.
6. **Production hardening**:
   - request IDs (read inbound `x-request-id` or mint UUID)
   - structured `{ error: { code, message, requestId } }` envelope
   - in-memory token-bucket rate limit on /api/chat/send (6 burst, 12/min)
     and /api/scout/run (1 per 5 min burst 2; this one spends real money)
7. **Chat UI**: tiny safe markdown renderer (no `marked` dep), stop
   button (AbortController), expand/collapse on tool events, per-turn
   token + cost meter, 429 rendered as a quiet inline message.

## Verification

- `pnpm -r typecheck` ✅ 8 packages
- `pnpm evals` ✅ Tier A/B/C 8/8
- `pnpm bench` ✅ Tier D static 5/5
- `pnpm swe-mini` ✅ Tier E static 1/1
- `pnpm -r test` ✅ chat-tools 6/6 (5 prior + 1 new mint-link binding test)

Total LLM cost during this build: $0.

## What I'd do differently

The rate limiter is in-process; if we deploy multi-instance API on Vercel
serverless, every instance has its own bucket and the burst becomes
N×burst. The right fix is Redis (Upstash, ElastiCache). I deferred it
because the current ops mode is single-instance Hono, and adding a Redis
dep speculatively is exactly what ADR 0010 warns against. When the
operator actually deploys multi-instance, that's the trigger to revisit.

## Next checkpoint

Next iteration's clear backlog:
- Docker sandbox for `swe-mini:live` so we can add fs/network problems
- Redis-backed rate limit + object-store trajectory storage when
  multi-instance lands
- Magic-link UX: render minted links in chat as a clickable button rather
  than a raw URL
- Operator-side: actually run the cron once with real keys and confirm
  cache hit rate matches expectations.
