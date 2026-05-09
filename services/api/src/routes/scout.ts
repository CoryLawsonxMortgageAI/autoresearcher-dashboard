import { Hono } from "hono";
import { runScout } from "../agents/scout.js";
import { requireOperator } from "../middleware/auth.js";

export const scoutRouter = new Hono();

// Manual ad-hoc trigger (operator only). Cron uses the cron entrypoint directly.
scoutRouter.post("/run", requireOperator, async (c) => {
  const r = await runScout({ phase: "ad-hoc" });
  return c.json(r);
});
