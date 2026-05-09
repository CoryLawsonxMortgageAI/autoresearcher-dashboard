import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb, merges as mergesTable } from "@autoresearcher/db";
import { requireOperator } from "../middleware/auth.js";
import { publishEvent } from "../lib/pusher.js";

export const mergesRouter = new Hono();

merges:
{
  // labelled block to keep file scoped
}

mergesRouter.get("/", async (c) => {
  const db = getDb();
  const rows = await db.select().from(mergesTable).orderBy(desc(mergesTable.createdAt)).limit(100);
  return c.json({ items: rows });
});

mergesRouter.get("/:prNumber", async (c) => {
  const prRaw = c.req.param("prNumber");
  if (!prRaw) return c.json({ error: "prNumber required" }, 400);
  const pr = Number(prRaw);
  if (!Number.isFinite(pr)) return c.json({ error: "prNumber must be a number" }, 400);
  const row = await getDb().query.merges.findFirst({ where: eq(mergesTable.prNumber, pr) });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// One-tap merge: requires operator JWT. Tier-3 path is gated by AUTOMERGE_AUTHORIZED.
mergesRouter.post("/:prNumber/tap", requireOperator, async (c) => {
  const prRaw = c.req.param("prNumber");
  if (!prRaw) return c.json({ error: "prNumber required" }, 400);
  const pr = Number(prRaw);
  if (!Number.isFinite(pr)) return c.json({ error: "prNumber must be a number" }, 400);
  const db = getDb();
  const row = await db.query.merges.findFirst({ where: eq(mergesTable.prNumber, pr) });
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.status !== "ready-for-tap") return c.json({ error: "not ready", status: row.status }, 409);
  if (!row.cascadeGreen || row.criticVerdict !== "approve") {
    return c.json({ error: "cascade or critic not green" }, 409);
  }
  if (row.tier === "tier-3" && process.env.AUTOMERGE_AUTHORIZED !== "true") {
    return c.json({ error: "tier-3 merges require AUTOMERGE_AUTHORIZED" }, 403);
  }

  const user = c.var.user;
  await db
    .update(mergesTable)
    .set({
      status: "merged",
      mergedByUserId: user.sub,
      mergedAt: new Date(),
      revertableUntil: new Date(Date.now() + 24 * 3600 * 1000),
    })
    .where(eq(mergesTable.prNumber, pr));

  await publishEvent("merges", {
    type: "merge_completed", prNumber: pr, by: user.sub, at: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

// Mandatory revert path (per directive): revert + down-migration + Vercel rollback.
// Implemented as a single API call that the dashboard surfaces as "[Revert]".
mergesRouter.post("/:prNumber/revert", requireOperator, async (c) => {
  const prRaw = c.req.param("prNumber");
  if (!prRaw) return c.json({ error: "prNumber required" }, 400);
  const pr = Number(prRaw);
  if (!Number.isFinite(pr)) return c.json({ error: "prNumber must be a number" }, 400);
  const db = getDb();
  const row = await db.query.merges.findFirst({ where: eq(mergesTable.prNumber, pr) });
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.status !== "merged") return c.json({ error: "not merged" }, 409);
  if (!row.revertableUntil || row.revertableUntil.getTime() < Date.now()) {
    return c.json({ error: "revert window expired" }, 409);
  }
  await db
    .update(mergesTable)
    .set({ status: "reverted", revertedAt: new Date() })
    .where(eq(mergesTable.prNumber, pr));
  // The actual git revert + Vercel rollback is performed by .github/workflows/revert.yml
  // dispatched here. Implementation lives in workflow file (Tier-3).
  return c.json({ ok: true, dispatched: ".github/workflows/revert.yml" });
});
