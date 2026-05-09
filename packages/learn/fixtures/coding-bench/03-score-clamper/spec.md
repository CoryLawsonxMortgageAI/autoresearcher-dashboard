# score-clamper

Implement a deterministic 5-axis score clamper that mirrors the production
scorer's invariants. Given five inputs each on [-Infinity, +Infinity], clamp
each to [0, 10] (rounded to 1 decimal place) and return the per-axis values
plus the total (0-50).

```ts
export const solve: (axes: {
  fit: number; evidence: number; market: number; competitive: number; founder: number;
}) => { fit: number; evidence: number; market: number; competitive: number; founder: number; total: number };
```

Constraints:
- Each axis ∈ [0, 10] in the output, rounded to 1 decimal place.
- `total` is the sum of the clamped axes (so total ∈ [0, 50]).
- NaN inputs become 0.
- No `any`, no `Math.round` direct on negative-infinity.
