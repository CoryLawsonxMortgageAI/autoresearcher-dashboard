# ADR 0010 — Research-driven hydration of the agent loop

Status: Adopted (operator request 2026-05-09: "complete deep research…hydrate this then iterate")
Companion: `docs/research/state-of-the-art.md`

## Decisions

This ADR records concrete adoptions from the research survey. Each row
links to the file where the technique landed.

| Adoption                      | Technique               | Reference                     | Where it landed                                         |
|-------------------------------|-------------------------|-------------------------------|---------------------------------------------------------|
| Episodic memory               | Reflexion               | Shinn et al., 2023            | `services/api/src/lib/reflections.ts` + `packages/db/schema/reflections.ts` |
| Few-shot prompt bank          | (already shipped v1.0)  | implicit in RLHF lineage      | `packages/learn/src/prompt-bank.ts` (no change)         |
| Skill library                 | Voyager (file-form)     | Wang et al., 2023             | `packages/learn/src/skills.ts` + `packages/learn/fixtures/skills/*.md` |
| Test-time compute scaling     | Best-of-N + adjudicator | (broadly accepted)            | `services/api/src/agents/scout.ts` (`SCOUT_BEST_OF_N`)  |
| Self-Refine on test failure   | Self-Refine / SWE-agent | Madaan 2023, Yang 2024        | `packages/learn/src/coding-bench.ts` (live mode loop)   |
| Trajectory log                | SWE-Gym / replay buffers| Pan et al., 2024              | `services/api/src/lib/trajectory.ts`                    |

## Explicit non-adoptions and why

- **Vector index for skills/reflections.** Corpus is small (<50 skills,
  <a few hundred reflections). Embedding upkeep cost > retrieval benefit.
  Revisit at >200 skills or if access patterns shift to fuzzy.
- **Multi-agent framework (LangGraph / CrewAI / MetaGPT).** Three agents
  in a DAG. A graph engine adds indirection without buying anything.
- **LLM fine-tuning / RL.** We don't train. Trajectory log is the
  substrate if/when the operator wants to send data offline for SFT.
- **Tree of Thoughts / MCTS.** Best-of-N with deterministic adjudicator
  is sufficient for our N=3-finding output shape.
- **LLM-proposed scorer changes (Eureka-style).** The directive bans
  letting the system tune its own evaluator. ADR 0009 already records
  this as a hard non-goal.
- **Hidden context mutation.** System prompts stay stable so prompt
  caching keeps working. All learning rides on user-message content.

## Reflexion implementation notes

- `reflections` table indexed by `(agent, vertical_slug, created_at)`.
- After each SCOUT run, one reflection per vertical: "kept K, dropped D,
  likely cause" — cheap to write, useful as a steering signal.
- SCOUT loads the **most recent 3 reflections per vertical** before each
  per-vertical Claude call. Inlined into the user JSON.
- Operators can read all reflections via `GET /api/learn/reflections`
  (filtered by `agent`, `vertical`, `limit`).

## Best-of-N implementation notes

- Default `SCOUT_BEST_OF_N = 1` (no extra cost).
- When >1, SCOUT runs N independent calls per vertical with the same
  user JSON plus a `_attempt` field (so the model can de-correlate).
- Adjudication is deterministic: dedupe by lowercased title prefix,
  rank by total scorer output, take top 3 per vertical.
- We deliberately do NOT use the LLM as the ranker here. The scorer is
  reviewed code; using it as the ranker keeps the test-time-compute
  path within the system's existing audit chain.

## Skill library implementation notes

- Markdown with YAML frontmatter (`id`, `when`, `verticals[]`, `priority`).
- Loaded once, cached.
- `skillsForVertical(slug, max)` filters by `verticals` (empty array =
  applies to all). Operators can edit / version-control / review in PRs.
- Five seed skills landed:
  1. `named-buyer-floor` — refuse findings without a named buyer
  2. `two-domain-evidence` — same-domain confirmation isn't independent
  3. `mortgage-cycle-time` — frame mortgage findings in cycle-time impact
  4. `compliance-named-rule` — compliance findings must cite a specific rule
  5. `dev-tools-distribution` — devtools score weights distribution edge

## Self-Refine in bench:live

- `BENCH_MAX_ATTEMPTS` (default 3, capped at 5).
- On test failure, the failing output is appended to the user content
  with explicit "previous attempt failed; produce a corrected solution.ts"
  framing. The model is told NOT to repeat the failing approach.
- Attempts are reported in `BenchResult.attempts` so the bench output
  shows whether a problem was first-try or after-debug.
- Live threshold remains 0.6; the retry loop pushes pass-rate up
  toward that.

## Trajectory log

- One JSONL file per run at `${TRAJECTORY_ROOT}/${runId}.jsonl`.
- Append-only. Survives crashes (one writeFile per line).
- Step kinds: `llm`, `tool`, `note`, `verdict`.
- Redaction pass strips obvious secrets (`bearer`, `sk-`, `api[-_]?key`,
  `secret`) before persisting the user JSON. Not bulletproof; operators
  should treat the directory as sensitive and rotate periodically.
- Path is referenced from `runs.meta.trajectoryPath` (set when the run
  starts).
