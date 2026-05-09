import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, desc, and, gte } from "drizzle-orm";
import { getDb, opportunities as oppTable } from "@autoresearcher/db";
import { requireOperator } from "../middleware/auth.js";
import { publishEvent } from "../lib/pusher.js";
import { upsertOpportunityToNotion } from "../integrations/notion.js";
import { writeOpportunityToVault } from "../integrations/obsidian.js";
import { reviewOpportunity } from "../agents/critic.js";

export const opportunitiesRouter = new Hono();

opportunitiesRouter.get("/", async (c) => {
  const status = c.req.query("status");
  const minScore = c.req.query("minScore");
  const db = getDb();
  const conds = [];
  if (status) conds.push(eq(oppTable.status, status as Parameters<typeof eq>[1] extends infer _ ? string : never as never));
  if (minScore) conds.push(gte(oppTable.scoreTotal, Number(minScore)));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const rows = await db.select().from(oppTable).where(where).orderBy(desc(oppTable.scoreTotal)).limit(200);
  return c.json({
    items: rows.map((r) => ({ ...r, scoreTotal: r.scoreTotal / 10 })),
  });
});

opportunitiesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = await db.query.opportunities.findFirst({ where: eq(oppTable.id, id) });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

const GreenlightBody = z.object({});

opportunitiesRouter.post(
  "/:id/greenlight",
  requireOperator,
  zValidator("json", GreenlightBody),
  async (c) => {
    const id = c.req.param("id");
    const user = c.var.user;
    const db = getDb();

    // greenlit_by_user_id MUST come from verifyJwt; the hook scans for this.
    await db
      .update(oppTable)
      .set({
        status: "greenlit",
        greenlitByUserId: user.sub,
        greenlitAt: new Date(),
      })
      .where(eq(oppTable.id, id));

    const fresh = await db.query.opportunities.findFirst({ where: eq(oppTable.id, id) });
    if (fresh) {
      await Promise.allSettled([
        upsertOpportunityToNotion(fresh),
        Promise.resolve(writeOpportunityToVault(fresh)),
      ]);
    }

    await publishEvent("opportunities", {
      type: "opportunity_greenlit", opportunityId: id, by: user.sub, at: new Date().toISOString(),
    });
    return c.json({ ok: true });
  }
);

opportunitiesRouter.post("/:id/reject", requireOperator, async (c) => {
  const id = c.req.param("id");
  await getDb().update(oppTable).set({ status: "rejected" }).where(eq(oppTable.id, id));
  return c.json({ ok: true });
});

opportunitiesRouter.post("/:id/critic", requireOperator, async (c) => {
  const id = c.req.param("id");
  const verdict = await reviewOpportunity(id);
  return c.json(verdict);
});
