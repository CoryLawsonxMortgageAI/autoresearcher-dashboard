import { Hono } from "hono";
import { runScout } from "../agents/scout.js";
import { requireOperator } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

export const scoutRouter = new Hono();

// Manual ad-hoc trigger (operator only). Heavier rate limit because each call
// spends real money — 1 per 5 minutes sustained, burst 2.
scoutRouter.post(
  "/run",
  requireOperator,
  rateLimit({ ratePerSec: 1 / 300, burst: 2, scope: "scout-run" }),
  async (c) => {
    const r = await runScout({ phase: "ad-hoc" });
    return c.json(r);
  }
);
