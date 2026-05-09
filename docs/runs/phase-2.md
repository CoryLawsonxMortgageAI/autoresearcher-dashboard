# phase-2 — skill: allowlist + scorer + prompts

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

`@autoresearcher/skill`:
- `verticals.json` with the directive's nine seed verticals and an
  exclusions field per vertical (e.g., investigative-osint excludes
  doxxing, stalkerware, unlicensed surveillance).
- `requireAllowedVertical(slug)` enforces the allowlist at the **tool
  layer**, throwing `OutOfAllowlistError` if a vertical is unknown.
  SCOUT calls this on every finding before insert; out-of-allowlist
  findings are counted (`rejectedOutOfAllowlist` in the run summary)
  but never inserted.
- `scoreOpportunity(inputs)`: deterministic 5-axis scorer, each axis
  capped at 10, total capped at 50. Karpathy-minimal: ~30 lines, no
  LLM in the loop. The LLM does research; the scorer does arithmetic.
- `recommendAction(score)`: maps total → one of `build-prototype`,
  `interview-3-buyers`, `deep-dive`, `watch`, `skip`. Bands are recorded
  in source so the eval suite can assert on them.
- `SCOUT_SYSTEM`, `CRITIC_SYSTEM`, `HISTORIAN_SYSTEM` prompts in source.
  Reviewed in PRs like any other code.

## What's next

Phase 3: agents (SCOUT, CRITIC, HISTORIAN).
