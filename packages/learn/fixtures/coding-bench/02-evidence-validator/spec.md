# evidence-validator

Implement a function that validates an autoresearcher Evidence array against
the system's "evidence floor" rule (>= 2 distinct domains).

```ts
type Evidence = { url: string; title: string; excerpt: string; weight: number };
export const solve: (evidence: Evidence[]) => { ok: boolean; reason: string };
```

Rules:
- `ok: true` only if `evidence.length >= 2` AND the evidence has at least
  2 *distinct domains* (different hostnames in the URL).
- `weight` must be in [0, 1] for every entry.
- `excerpt.trim().length >= 20` for every entry.
- If any rule fails, return `ok: false` with a `reason` that names the
  first failing rule.
