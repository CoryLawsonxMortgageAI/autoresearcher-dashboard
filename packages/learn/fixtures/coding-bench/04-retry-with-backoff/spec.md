# retry-with-backoff

Implement an async retry helper with exponential backoff and jitter.

```ts
export const solve: <T>(
  fn: () => Promise<T>,
  opts: {
    attempts: number;
    baseMs: number;
    maxMs: number;
    isRetryable?: (err: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
  }
) => Promise<T>;
```

Behavior:
- Call `fn()`. If it resolves, return the value.
- If it rejects:
  - If `attempts <= 1` OR (`isRetryable` is provided AND returns false for the
    error), throw the original error.
  - Otherwise sleep `min(maxMs, baseMs * 2 ** (a-1))` ms (where `a` is the
    1-indexed attempt number that just failed), then retry. Total attempts
    counted INCLUDES the first call.
- The `sleep` parameter is for tests (default: real `setTimeout`). When
  provided, the helper must call it once per backoff.
- Strict mode, no `any`.

Edge cases:
- `attempts = 1` → no retries; first failure throws.
- `attempts = 0` → throw an error before calling fn (`attempts must be >= 1`).
- `isRetryable` returning false → throw immediately, do not consume more
  attempts and do not call sleep.
