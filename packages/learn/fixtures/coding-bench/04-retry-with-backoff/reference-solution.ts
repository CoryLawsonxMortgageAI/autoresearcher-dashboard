type Opts = {
  attempts: number;
  baseMs: number;
  maxMs: number;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

export const solve = async <T>(fn: () => Promise<T>, opts: Opts): Promise<T> => {
  if (opts.attempts < 1) throw new Error("attempts must be >= 1");
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let a = 1; a <= opts.attempts; a++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const more = a < opts.attempts;
      const retryable = opts.isRetryable ? opts.isRetryable(err) : true;
      if (!more || !retryable) throw err;
      const delay = Math.min(opts.maxMs, opts.baseMs * 2 ** (a - 1));
      await sleep(delay);
    }
  }
  throw lastErr;
};
