// In-memory token-bucket rate limiter, scoped by (key, route). For multi-instance
// deploys this should be Redis-backed; ADR 0013 records the deferral.
import type { Context, MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors.js";

type Bucket = { tokens: number; updatedAt: number };

const BUCKETS = new Map<string, Bucket>();

export type RateLimitOpts = {
  // Tokens regenerated per second
  ratePerSec: number;
  // Bucket capacity
  burst: number;
  // How to derive the key. Default: operator user_id from c.var.user.sub, falling
  // back to the request's IP address.
  key?: (c: Context) => string;
  scope?: string;
};

const defaultKey = (c: Context): string => {
  const u = c.var.user as { sub?: string } | undefined;
  if (u?.sub) return `u:${u.sub}`;
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  return `ip:${ip}`;
};

export const rateLimit = (opts: RateLimitOpts): MiddlewareHandler => {
  const scope = opts.scope ?? "default";
  return async (c, next) => {
    const k = `${scope}:${(opts.key ?? defaultKey)(c)}`;
    const now = Date.now();
    const cur = BUCKETS.get(k) ?? { tokens: opts.burst, updatedAt: now };
    const elapsedSec = (now - cur.updatedAt) / 1000;
    const refill = elapsedSec * opts.ratePerSec;
    const tokens = Math.min(opts.burst, cur.tokens + refill);
    if (tokens < 1) {
      const wait = Math.ceil((1 - tokens) / opts.ratePerSec);
      c.header("retry-after", String(wait));
      throw new ApiError("rate_limited", `slow down — retry in ${wait}s`, 429);
    }
    BUCKETS.set(k, { tokens: tokens - 1, updatedAt: now });
    await next();
  };
};
