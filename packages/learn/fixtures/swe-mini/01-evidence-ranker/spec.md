# Tier-E :: 01-evidence-ranker (multi-file)

You are given a small TypeScript module across two files:

- `types.ts` — shared types (read-only; do NOT modify)
- `ranker.ts` — the implementation you must write

Your task: implement `ranker.ts`. Export `solve(input)` matching the signature
in `types.ts`.

## Behavior

Given a list of `Evidence` objects, return the same list filtered + ranked
under these rules:

1. Filter: drop any evidence with `weight < 0.2` OR `excerpt.trim().length < 20`.
2. Filter: keep at most one piece of evidence per hostname (keep the highest
   `weight`). Same-domain confirmations are not independent evidence.
3. Rank: sort the remaining evidence by `weight` descending, then by URL
   ascending (deterministic tie-breaker).
4. Cap: return at most `maxResults` items (input parameter).

## Constraints

- Strict mode, no `any`.
- Do not import from anywhere except `./types.js`.
- Pure function: no fs, no fetch, no random.

## Files you must produce

- `ranker.ts` — exports `solve`

The grader copies your `ranker.ts` into the workdir and runs `tests.ts`
against it (`tests.ts` imports from `./ranker.js` and `./types.js`).
