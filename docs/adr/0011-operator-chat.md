# ADR 0011 — Operator chat with tool-use

Status: Adopted (operator request 2026-05-09: "Create a chat feature inside the UI…")

## Decision

Chat is a thin operator console over the existing tool surface. The
agent has read access to opportunities, skills, reflections, and the
prompt bank, and write access only to the actions that already cost
money (run SCOUT, run CRITIC). It cannot greenlight, reject, or merge —
those require interactive operator taps on `/opportunities/:id` or
`/merges` so the audit columns record the operator's user_id, not the
agent's.

## Architecture

```
apps/web/app/chat
  └── page.tsx         "use client", JWT held in localStorage,
                       SSE consumer, tool-event panel

services/api/src/routes/chat.ts
  ├── GET  /api/chat/conversations            list
  ├── GET  /api/chat/conversations/:id        history
  ├── POST /api/chat/conversations            create
  └── POST /api/chat/send                     SSE stream

services/api/src/agents/chat.ts
  ├── runChatTurn()    async-generator yielding
  │                    text | tool_use | tool_result | done
  └── dispatchTool()   query_opportunities, get_opportunity,
                       review_opportunity, run_scout_now,
                       list_skills, get_prompt_bank,
                       list_reflections

packages/db/schema/chat.ts
  ├── conversations    (id, user_id, title, created/updated_at)
  └── messages         (id, conversation_id, role, content,
                        tool_calls, tool_result_for, tokens, created_at)
```

## Tool surface (deliberately narrow)

| Tool                    | Read/write | Cost          |
|-------------------------|------------|---------------|
| `query_opportunities`   | read       | DB query      |
| `get_opportunity`       | read       | DB query      |
| `review_opportunity`    | **write*** | LLM call + DB |
| `run_scout_now`         | **write*** | LLM calls + DB|
| `list_skills`           | read       | filesystem    |
| `get_prompt_bank`       | read       | filesystem    |
| `list_reflections`      | read       | DB query      |

\* "Write" but constrained: writes only the result of agent runs, not
operator-only fields (`greenlit_by_user_id`, merge `merged_by_user_id`,
verticals allowlist, etc.).

The chat agent's system prompt explicitly tells it to confirm before
calling cost-incurring tools unless the operator was explicit.

## What chat CANNOT do (by design)

- Greenlight or reject opportunities (operator interactive only).
- Tap-merge or revert PRs (operator interactive only).
- Edit `verticals.json` or any source file (PR-only).
- Modify `/.automerge-authorized` or `AUTOMERGE_AUTHORIZED` (hard-blocked
  by `.claude/hooks.json` + `forbid-automerge-tampering.mjs`).
- Touch Tier-3 paths via tool calls.

If a request lies outside the tool surface (e.g., "build a new feature"),
the agent is instructed to say so and explain the operator-driven path
(open an ADR, file a BLOCKER, write a PR).

## Streaming

Server-Sent Events (`text/event-stream`) over `POST /api/chat/send`.
Hono's `streamSSE` helper is used; the client reads with `fetch` +
`ReadableStream`. We did not use websockets because:
1. SSE is simpler for one-way streaming and survives proxies better.
2. We already have Pusher for live broadcast; chat is per-conversation.

Events: `text`, `tool`, `result`, `done`, `error`.

## Tool-use loop

`runChatTurn` is an async generator that loops up to `MAX_TOOL_ITERATIONS`
(6). Each iteration: model emits text + optional tool_use blocks, the
loop dispatches tools, results feed back. Loop terminates when the model
stops without tool calls (or the cap is hit, in which case we emit
`done` anyway and the operator can re-prompt).

## Auth

Chat requires the operator JWT. The UI loads it from localStorage; the
operator obtains it via `pnpm operator-jwt` (a small script using
`jose`). No login flow yet — magic link login will fold in once we have
multi-operator usage.

## Why not Vercel AI SDK / a chat framework

- One file (`agents/chat.ts`) is enough; pulling a framework adds 20+
  dependencies.
- Tool-use is a thin loop over the Anthropic SDK we already use.
- Karpathy idiom: keep the agent reading + building from this file.
