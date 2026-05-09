# debounce

Implement a `debounce` higher-order function in TypeScript.

```ts
export const solve: <A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
) => (...args: A) => void;
```

Calling the returned function repeatedly should result in `fn` being called
only once, with the most recent arguments, after `ms` milliseconds of
inactivity.

Constraints:
- No `any`. Strict mode.
- No globals. Use `setTimeout` / `clearTimeout`.
- The returned function must accept the same arguments as `fn`.
