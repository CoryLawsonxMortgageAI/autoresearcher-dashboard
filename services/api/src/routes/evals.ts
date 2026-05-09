import { Hono } from "hono";
import { desc, eq, and } from "drizzle-orm";
import { getDb, runs as runsTable } from "@autoresearcher/db";

export const evalsRouter = new Hono();

evalsRouter.get("/latest", async (c) => {
  const db = getDb();
  const tiers = ["eval-tier-a", "eval-tier-b", "eval-tier-c"] as const;
  const out: Record<string, unknown> = {};
  for (const t of tiers) {
    const r = await db.select().from(runsTable)
      .where(and(eq(runsTable.phase, t), eq(runsTable.status, "completed")))
      .orderBy(desc(runsTable.startedAt))
      .limit(1);
    out[t] = r[0] ?? null;
  }
  return c.json(out);
});
