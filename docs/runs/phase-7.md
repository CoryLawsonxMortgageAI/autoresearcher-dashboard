# phase-7 — research-driven hydration + operator chat

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

Two related but separable shipments under a single PR:

### Hydration from `docs/research/state-of-the-art.md`

The research doc surveys ~12 families of autonomous-coding techniques
(ReAct/Reflexion/Self-Refine/CRITIC, Voyager, SWE-agent/Aider/OpenHands,
multi-agent frameworks, ToT/Best-of-N, RL fine-tuning, trajectory logs,
reward design, sandboxing, memory, eval suites). Each is classified as
**Adopted**, **Adopted-light**, or **Studied / not adopted** with a
reason.

Concrete adoptions in this commit:
- **Reflexion-style episodic memory**: new `reflections` table; SCOUT
  prepends recent reflections per vertical; SCOUT writes a one-line
  reflection per vertical at run end.
- **Voyager-light skill library**: `packages/learn/fixtures/skills/*.md`
  with frontmatter; SCOUT loads applicable skills per vertical and
  inlines the prompt-snippets. Five seed skills shipped.
- **Best-of-N + scorer adjudication**: `SCOUT_BEST_OF_N` env (default 1).
  Generates N candidates per vertical, dedupes by title, scorer-ranks,
  takes top 3.
- **Self-Refine retry in `bench:live`**: up to `BENCH_MAX_ATTEMPTS`
  attempts (default 3); each retry sees the previous test failure.
- **Trajectory JSONL log**: `services/api/src/lib/trajectory.ts` writes
  one line per agent step with redaction of obvious secrets. Path under
  `${TRAJECTORY_ROOT}` (default `./data/trajectories/`).

ADR 0010 records all the above with explicit non-adoptions.

### Operator chat

A `/chat` page in the dashboard with tool-use access to the autoresearcher
surface. The agent can search opportunities, fetch detail, run CRITIC,
trigger SCOUT, list skills, fetch the prompt bank, and list reflections.
It explicitly **cannot** greenlight, reject, merge, or edit Tier-3 paths
— those remain operator-interactive so the audit columns record the
operator's user_id.

Implementation:
- `packages/db/schema/chat.ts` — `conversations` + `messages` tables.
- `services/api/src/agents/chat.ts` — async-generator tool-use loop
  (up to 6 iterations), 7-tool surface, BigInt-safe JSON serialization.
- `services/api/src/routes/chat.ts` — list/create/load + SSE `send`.
- `apps/web/app/chat/page.tsx` — JWT in localStorage, SSE consumer,
  tool-event panel, cmd/ctrl+enter to send.
- `scripts/issue-operator-jwt.ts` — quick CLI to mint an operator JWT.

ADR 0011 records the architecture and the deliberately narrow tool
surface.

## What I'd do differently

The research doc was written with high confidence from training-data
recall through Jan 2026, not live-fetched. For some specific numerical
claims I avoided citing exact SWE-bench scores or paper numbers because
versions and subsets shift; the doc states behavior in plain terms
instead. If we want to cite specific numbers in a forward direction
(e.g., "this iteration improved Tier-D by X%"), we should run the
actual experiment, not extrapolate from a paper.

## Verification (what I ran from this commit)

`pnpm install` ✅
`pnpm -r typecheck` ✅ (8 packages)
`pnpm evals` ✅ Tier A/B/C 8/8
`pnpm bench` ✅ Tier D static 3/3

## Next checkpoint

The chat is live; operator can ask the agents to research / run / review
without leaving the dashboard. First operator session against real
verticals (with `ANTHROPIC_API_KEY` set) is the next signal.
