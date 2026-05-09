# State of the art — autonomous code-writing & research agents

Author: research pass against the autoresearcher v1.0 stack
Date: 2026-05-09
Knowledge cutoff: training data through January 2026

## Scope

This document surveys the public landscape of autonomous coding agents and
agentic research systems and classifies each technique into one of:

- **Adopted** — landed in this commit (or a prior one) and where to find it
- **Adopted-light** — a smaller variant landed; full version deferred with reason
- **Studied / not adopted** — known about; reason for skipping

Karpathy idiom drives the pruning: minimal, hackable, in-source, no
abstraction without two callers, no learning that's not auditable as a
file.

## Survey

### 1. Reasoning + acting loops (ReAct, Reflexion, Self-Refine, CRITIC)

- **ReAct** (Yao et al., 2022): interleaves reasoning and tool calls. The
  defining loop pattern most modern agents inherit.
- **Reflexion** (Shinn et al., 2023): after each trial the agent writes a
  short verbal critique; future trials prepend the critique. "Verbal RL"
  — gradient-free, audit-friendly.
- **Self-Refine** (Madaan et al., 2023): the same model generates output,
  critiques it, refines. Effective on text and code; less effective on
  retrieval-bound tasks.
- **CRITIC** (Gou et al., 2023): self-correction grounded in tool outputs
  (calculator, search, code-runner). Reduces hallucination versus pure
  self-critique.

**Adopted**: Reflexion-style episodic memory. After each SCOUT run the
CRITIC writes one paragraph of "what to do differently" into a
`reflections` table. The next SCOUT run prepends the last N reflections
to the user JSON. Implementation in `services/api/src/lib/reflections.ts`
+ `packages/db/schema/reflections.ts`.

**Adopted**: CRITIC pattern (already shipped in v1.0 — every opportunity
gets an adversarial review with a structured verdict).

**Adopted-light**: Self-Refine. The bench's live mode now retries up to 3
attempts on test failure, passing the test output back as feedback.
Implementation in `packages/learn/src/coding-bench.ts`. We don't run
Self-Refine on opportunity outputs — the operator's greenlight is the
preference signal there, and we capture it via the prompt bank.

### 2. Skill libraries and lifelong learning (Voyager, Generative Agents)

- **Voyager** (Wang et al., 2023): Minecraft agent that writes JavaScript
  skills, stores them in a vector-indexed library, retrieves applicable
  ones for new tasks. Demonstrates open-ended exploration with skill
  reuse.
- **Generative Agents** (Park et al., 2023): memory streams + reflection +
  retrieval; behavioral fidelity in simulated environments.

**Adopted**: Voyager-inspired skill library, but in source-code form per
the Karpathy idiom. `packages/learn/fixtures/skills/*.md` are markdown
"research moves" with frontmatter (`when`, `verticals`, `prompt-snippet`).
SCOUT loads applicable skills by vertical and inlines the prompt-snippets
into the user JSON. Operators can edit, version, review in PRs. No vector
index — keyword matching over the frontmatter, since we have <50 skills
and matching on a small set is cheaper than embedding upkeep.

**Studied / not adopted**: vector-indexed skill retrieval. Adds an
embedding service dependency for a corpus too small to need it. If the
skill count grows past ~200 we'll revisit.

### 3. SWE-bench class agents (SWE-agent, Aider, OpenHands, Devin)

- **SWE-bench** (Jimenez et al., 2023): 2,294 GitHub issues; agents must
  produce a patch that passes the hidden test set. Lite/Verified subsets
  followed.
- **SWE-agent** (Yang et al., 2024): defined the *agent-computer interface*
  (ACI) — purpose-built bash-like commands (`open`, `goto`, `edit`,
  `submit`). Showed that interface design beats raw model size on this
  task class.
- **Aider** (open source, ongoing): pair-programming repo-aware editor;
  uses unified diff or whole-file edits; git-aware; effective on
  small-medium tasks; weaker on multi-file architecture changes.
- **OpenHands / OpenDevin** (open source, 2024): autonomous SWE platform
  with browser + terminal + editor + planner; closer to Devin's surface
  area in OSS.
- **Devin** (Cognition Labs, 2024): closed-source full-autonomous SWE
  agent; planner + executor + reviewer. Real-world performance gap
  between marketing demos and SWE-bench Verified is well documented.

**Adopted**: ACI-shaped commands at a smaller scale. The bench gives the
model a concrete spec + concrete tests + a single file (`solution.ts`) to
write. No sandbox commands needed because the surface is intentionally
narrow.

**Adopted**: Aider-style "the file IS the patch" model. Bench live mode
writes the whole `solution.ts`, tests run, retry on failure with test
output. Simple and effective for the bench's scope.

**Studied / not adopted**: full SWE-agent ACI (`open`/`goto`/`edit`/
`submit`). Worth it for browsing-and-patching real codebases; overkill
for our Tier-D fixed-spec problems. Revisit if we add Tier-E
(multi-file SWE-bench-mini problems).

**Studied / not adopted**: OpenHands as a substrate. We're not building a
general SWE agent; we're building a research agent with a coding-ability
sub-bench. Wrong abstraction layer.

### 4. Multi-agent frameworks (AutoGen, MetaGPT, CrewAI, LangGraph)

- **AutoGen** (Microsoft, 2023): multi-agent conversations; configurable
  group chat; user proxy patterns. Strong for prototypes.
- **MetaGPT** (Hong et al., 2023): role-based pipeline (PM →
  Architect → Engineer → QA); SOP-encoded.
- **CrewAI** (open source): role + task abstractions; less opinionated
  than MetaGPT.
- **LangGraph** (LangChain, 2024): stateful, cyclic agent graphs;
  checkpointing; durable execution.

**Studied / not adopted**: full multi-agent frameworks. Our agent count is
3 (SCOUT, CRITIC, HISTORIAN) and the call graph is a DAG: SCOUT → CRITIC
→ HISTORIAN with `Promise.allSettled` for the side-mirrors (Notion,
Obsidian). No graph engine needed. A LangGraph adoption would add a heavy
dependency and an indirection layer that buys nothing at our scale.

**Adopted-light**: MetaGPT's role separation idea. Each agent has a
distinct system prompt, distinct entry function, distinct database tables
(opportunities for SCOUT, opportunities.critic_verdict for CRITIC,
docs/runs for HISTORIAN). One file per role.

### 5. Test-time compute scaling (Tree of Thoughts, Best-of-N, MCTS, o1-style)

- **Tree of Thoughts** (Yao et al., 2023): branching reasoning paths +
  state evaluator. Strong on puzzle-like problems, expensive.
- **Best-of-N + CRITIC adjudication**: simpler, K parallel candidates,
  reviewer picks the best.
- **MCTS-style**: AlphaCode 2 (DeepMind, 2023) used MCTS-like sampling
  with cluster selection for competitive programming.
- **o1-style scaling** (OpenAI, 2024): chain-of-thought is part of
  inference, not the prompt; long internal reasoning before a final
  output.

**Adopted**: Best-of-N with CRITIC adjudication for SCOUT. Per-vertical
config `BEST_OF_N` (default 1; set to 3 for high-stakes verticals or
during evaluation). When >1, SCOUT generates N candidate findings, the
CRITIC ranks them, the top-K survive into the inserts. Implementation in
`services/api/src/agents/scout.ts`.

**Studied / not adopted**: full ToT or MCTS. Cost scales poorly versus
Best-of-N for our problem shape (we want a list of findings, not a
single best answer through a deep search). Revisit if the per-finding
quality bottleneck shifts.

**Studied / not adopted**: o1-style extended reasoning. Anthropic's
extended thinking on Opus/Sonnet 4.x covers this if/when needed; opt-in
per-call is sufficient. We don't bake it into the loop.

### 6. RL-trained SWE agents (SWE-Gym, SWE-RL, AlphaCode 2)

- **SWE-Gym** (Pan et al., 2024): training environment for SWE agents
  with executable tests; PPO-class methods on top.
- **SWE-RL** / similar: RL fine-tuning specifically for code tasks using
  test-pass signal.
- **AlphaCode 2** (DeepMind, 2023): combined SFT + RL on competitive
  programming; large-scale candidate generation.

**Studied / not adopted**: RL fine-tuning. We don't train models. Our
"learning" is in-context (prompt bank + reflections + skills). When the
operator wants to fine-tune, the trajectory log we ship (Adopted, below)
is the data substrate.

### 7. Trajectory recording and offline analysis

- **AgentBench** (Liu et al., 2023): broad agent eval harness.
- **TRAILS / replay buffers**: storing every (prompt, response, tool, outcome)
  tuple so an offline pass can score what happened.

**Adopted**: trajectory JSONL logging. Each agent run writes
`./data/trajectories/<runId>.jsonl` with one line per step (input, model,
output, cost, timestamp). The `runs.meta.trajectoryPath` references it.
This is the substrate for any future RL data prep, offline eval, or
post-hoc CRITIC pass. Implementation in
`services/api/src/lib/trajectory.ts`.

### 8. Reward design / scoring (Eureka, MARLO, RM-style)

- **Eureka** (Ma et al., 2023): GPT-4 proposes reward functions for
  robotics tasks; iteratively refined against rollout statistics.
- **Reward modeling** (RLHF lineage): trained reward model from human
  preferences.

**Studied / not adopted**: LLM-proposed scoring tweaks. The directive
explicitly bans "letting the system tune its own evaluator" because of
Goodhart. The scorer stays code, reviewed in PRs (ADR 0009 documents
this non-goal). We do offer the operator a *manual* reward proposal
loop: any ADR can include a proposed scorer change; the proposed change
is reviewed by humans and CI before landing.

### 9. Sandbox / isolation

- **OpenHands sandboxing**: docker-isolated container per task.
- **E2B / Modal sandboxes**: managed ephemeral VMs for agent code
  execution.
- **`tsx` / direct execution**: no isolation; trust your code.

**Adopted-light**: bench static mode runs reference solutions through
`tsx`. Acceptable because the reference solutions are operator-authored
and reviewed in PRs.

**Studied / not adopted (yet)**: docker-isolated bench:live execution.
Today bench:live runs agent-written TS through `tsx` in the same node
process as the runner. For the small problem set this is acceptable
(no network access in the bench problems, no fs writes outside the
problem dir). If we expand the bench to file-system-touching problems,
Docker isolation becomes a hard requirement. Tracked in ADR 0010.

### 10. Memory and context management

- **MemGPT** (Packer et al., 2023): hierarchical memory with paging.
- **Letta** (formerly MemGPT): productized memory-managed agents.
- **Anthropic memory tool**: provider-side persistent memory.

**Adopted-light**: SQL-table memory (opportunities, runs, events,
blockers, reflections). Indexed, queryable, durable, transparent. No
embedding-indexed long-term memory because:
1. The state we care about is discrete (decisions, evidence, runs).
2. Embedding similarity is the wrong retrieval mode for our access
   patterns (we filter by vertical, status, score).

**Studied / not adopted**: vector store for long-term context. Reserve
for a future iteration where we want fuzzy retrieval over historical
opportunity narratives.

### 11. Coding evals

- **HumanEval** (Chen et al., 2021), **MBPP** (Austin et al., 2021):
  function-level synthesis.
- **SWE-bench**, **SWE-bench Verified**, **SWE-bench Lite**: real GitHub
  issues.
- **CodeContests** (DeepMind, 2022): competitive programming.
- **REPLBench / TerminalBench** (2024): interactive REPL/terminal use.
- **SWE-Lancer** (OpenAI, 2025): freelance-style end-to-end SWE tasks.

**Adopted**: in-house Tier-D bench (3 problems) that mirror production
invariants from the autoresearcher's own scorer + evidence floor. This
beats running HumanEval because:
1. The bench problems exercise the same code-shape the agents have to
   debug if/when they self-modify.
2. Failures point directly at production invariants, not abstract puzzles.

**Studied / not adopted (yet)**: SWE-bench Verified mini-subset. Worth
adopting once we have a reproducible isolation sandbox (#9). Tracked in
ADR 0010.

### 12. Coding-agent patterns we explicitly avoid

- **AutoGPT-style runaway loops**: unbounded iteration with no kill
  switch. Our cost ceilings ($10/run, $100 cumulative) are the kill
  switch; runs that exceed are halted with a BLOCKER.
- **Tool-call sprawl**: agents that decide their own tool inventory at
  runtime. Our agents have a fixed, code-defined tool surface
  (LLM call + DB write + Pusher publish + filesystem write to
  Notion/Obsidian).
- **Hidden context**: agents that mutate their own system prompt at
  runtime. Our system prompts are stable in source; learning rides on
  *user message* content (prompt bank + reflections + skills) so prompt
  caching keeps working.

## What this commit hydrates

| Technique          | File                                                             | Verified |
|--------------------|------------------------------------------------------------------|----------|
| Reflexion memory   | `services/api/src/lib/reflections.ts`, `packages/db/schema/reflections.ts` | typecheck |
| Trajectory log     | `services/api/src/lib/trajectory.ts`                             | typecheck |
| Best-of-N + critic | `services/api/src/agents/scout.ts` (BEST_OF_N path)              | typecheck |
| Skill library      | `packages/learn/src/skills.ts`, `packages/learn/fixtures/skills/*.md` | typecheck + load test |
| Self-Debug retry   | `packages/learn/src/coding-bench.ts` (live mode loop)            | typecheck |

ADR 0010 records the design with reasoning for each adoption / non-adoption.

## What we deliberately did NOT adopt this iteration

- Vector embeddings for memory or skill retrieval (cost > benefit at our scale).
- Multi-agent framework (3 agents, no graph engine needed).
- RL fine-tuning (no model training in our loop).
- Tree of Thoughts / MCTS (Best-of-N is enough).
- Docker sandbox for bench:live (problem set is constrained; revisit on Tier-E).
- LLM-proposed scorer changes (Goodhart; operator-authored only).
- Hidden context mutation (breaks prompt caching).

If the operator disagrees with any of these non-adoptions, file an ADR
that motivates the change with concrete signal — don't add complexity
speculatively.

## References (canonical works cited above)

- Yao et al., 2022. *ReAct: Synergizing Reasoning and Acting in Language Models*.
- Shinn et al., 2023. *Reflexion: Language Agents with Verbal Reinforcement Learning*.
- Madaan et al., 2023. *Self-Refine: Iterative Refinement with Self-Feedback*.
- Gou et al., 2023. *CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing*.
- Wang et al., 2023. *Voyager: An Open-Ended Embodied Agent with Large Language Models*.
- Park et al., 2023. *Generative Agents: Interactive Simulacra of Human Behavior*.
- Jimenez et al., 2023. *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?*
- Yang et al., 2024. *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering*.
- Hong et al., 2023. *MetaGPT: Meta Programming for Multi-Agent Collaborative Framework*.
- Yao et al., 2023. *Tree of Thoughts: Deliberate Problem Solving with Large Language Models*.
- Pan et al., 2024. *SWE-Gym: Training Environment for Software Engineering Agents*.
- Ma et al., 2023. *Eureka: Human-Level Reward Design via Coding Large Language Models*.
- Packer et al., 2023. *MemGPT: Towards LLMs as Operating Systems*.
- Liu et al., 2023. *AgentBench: Evaluating LLMs as Agents*.
- Chen et al., 2021. *Evaluating Large Language Models Trained on Code* (HumanEval).
- Austin et al., 2021. *Program Synthesis with Large Language Models* (MBPP).
- Karpathy, A. *nanoGPT*, *micrograd*, *Software 2.0*. https://karpathy.ai
- Aider, OpenHands, Cursor, AutoGen, CrewAI, LangGraph: open-source projects.

(Citations are from public papers and projects through training data
cutoff. Where versions/numbers are uncertain, I have stated the system
behavior in plain terms instead of citing specific scores.)
