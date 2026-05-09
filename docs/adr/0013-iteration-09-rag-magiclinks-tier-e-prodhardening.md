# ADR 0013 — Iteration 09: RAG-light + magic-link greenlights + Tier-E + production hardening

Status: Adopted (operator request 2026-05-09: "make it production ready" + "make the chat fully interactive that can access RAG or DAG you decide")

## Decisions

### 1. RAG-light over the structured store (no vector index)

The chat agent gets a `search_text` tool that runs case-insensitive substring
search across **opportunities** (title + thesis + JSON-cast evidence text),
**reflections** (body), and **skills** (id + when + body). Multi-word
queries are AND-joined. Results return a snippet around the first matched
term per row.

**Why not embeddings**: corpus is small and structured (queryable by
vertical, status, score, vertical-slug). Adding an embedding service
would buy fuzzy retrieval we don't need, and the ongoing upkeep cost
(model swap, dimension mismatch, recompute) is high relative to the
benefit at our scale. Karpathy idiom: don't add a vector store you can't
explain.

**When to revisit**: when (a) opportunity count > 5,000 OR (b) operators
start asking semantic-recall queries that substring search consistently
misses. We track those as a manual signal.

### 2. summarize_inbox tool (auto-context)

Cheap, DB-only snapshot: inbox count, top 5 highest-score inbox opps,
breakdown by vertical, last 3 critic verdicts. The chat agent calls this
when an operator opens a fresh conversation to ground its answers in
current state.

### 3. mint_greenlight_link tool

The chat agent has NO direct write to `greenlit_by_user_id` or `status`.
To confirm a decision, the agent calls `mint_greenlight_link` with an
opportunity id and an action (`greenlight` | `reject`). The agent gets
back a one-tap URL. The agent shares the URL in chat. The operator
clicks the URL. `/api/magic/consume` consumes the link and writes the
decision with `userId` = the operator's verified `sub` (threaded from the
route's `requireOperator` middleware through `ChatTurnArgs.operatorUserId`
into `issueMagicLink`'s `userId` parameter).

**Audit invariant**: the agent's input to `mint_greenlight_link` does NOT
accept a `userId` field. The link's binding comes from the operator's
JWT only. The vitest chat-tools test asserts this structurally.

### 4. Prompt-cache hit-rate audit

`callClaude` now uses `client.beta.promptCaching.messages.create` and
returns `cacheCreationInputTokens` + `cacheReadInputTokens`. SCOUT and
CRITIC append those to the trajectory log. The `/trajectories/[runId]`
page computes per-run hit rate as `cache_read / (cache_read + cache_create)`
and displays it.

We expect Tier-1 hit rates (>50%) for SCOUT runs because the system
prompt is constant across per-vertical calls within a single run window,
and we deliberately keep all learned content in the user message.

### 5. Tier-E multi-file SWE-mini bench

`packages/learn/fixtures/swe-mini/01-evidence-ranker/` is the first
Tier-E problem: spec.md + types.ts (read-only) + tests.ts + the
target file (`ranker.ts`) the agent must produce. Static mode copies
`reference-ranker.ts` → `ranker.ts` and runs tests; live mode asks
Claude (with up to `SWE_MINI_MAX_ATTEMPTS` retries on failure, feeding
the test output back).

`pnpm swe-mini` (and `pnpm swe-mini:live`) wired into root scripts.

**Sandbox**: agent-written code runs in the same node process via
`tsx`. The problem set is constrained (no fs/network). For broader
problems we MUST move to a Docker sandbox (E2B / Modal / Fly machine
ephemeral); tracked here as Iteration-10 work.

### 6. Production hardening

Three thin pieces:
- `services/api/src/middleware/request-id.ts` — read-or-mint
  `x-request-id` for correlation across logs.
- `services/api/src/lib/errors.ts` — `ApiError` class + `errorEnvelope`
  formatter so all errors return `{ error: { code, message, requestId } }`.
- `services/api/src/middleware/rate-limit.ts` — in-memory token-bucket,
  scoped by user_id+route. `/api/chat/send` is 6 burst / 12 per minute,
  `/api/scout/run` is 1 per 5 minutes burst 2 (because each call costs
  real money).

**Multi-instance**: the rate limiter is in-process. Under multi-instance
deploys it must be Redis-backed; tracked as Iteration-10.

### 7. Chat UI interactivity

- `apps/web/lib/markdown.ts` — tiny safe markdown→HTML (no `marked`
  dep). Supports paragraphs, lists, code, links, bold, italic.
- Chat page: stop button (AbortController-based), expand/collapse for
  tool calls, per-turn token + cost meter, "thinking…" indicator while
  the model is still composing.
- 429 rate-limit responses surface as a quiet message rather than a
  silent fail.

## Explicit non-adoptions / deferrals

| Capability                                  | Reason                                              | When to revisit |
|---------------------------------------------|-----------------------------------------------------|-----------------|
| Vector embedding store                      | Corpus too small; substring search wins on cost      | >5k opps or fuzzy-recall complaints |
| LangGraph / AutoGen multi-agent             | We have a tool-use DAG already; no graph engine needed | If agent count > 6 |
| Object-store trajectory storage             | Single-instance worker today                         | Multi-instance deploy |
| Redis-backed rate limiter                   | Single-instance API today                            | Multi-instance deploy |
| Docker sandbox for swe-mini:live            | Constrained problem set                              | Tier-E problems with fs/network |
| Web search tool in chat                     | Out of scope; SCOUT does this on its own surface     | Operator demand |
| Real fine-tuning loop                       | We don't train; in-context learning is sufficient    | Concrete cost vs. quality data |

## Verification (this commit)

| Check | Result |
|---|---|
| `pnpm -r typecheck` | ✅ 8 packages |
| `pnpm evals` | ✅ Tier A 3/3, B 3/3, C 2/2 |
| `pnpm bench` | ✅ Tier D static 5/5 |
| `pnpm swe-mini` | ✅ Tier E static 1/1 |
| `pnpm -r test` | ✅ 6/6 chat-tools (5 prior + 1 new mint-link binding) |

Total LLM cost during this build: $0.
