import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { getDb, opportunities as oppTable } from "@autoresearcher/db";
import { consumeMagicLink, issueOperatorJwt } from "../lib/auth.js";
import { publishEvent } from "../lib/pusher.js";

export const magicRouter = new Hono();

const ConsumeBody = z.object({ token: z.string().min(20) });

magicRouter.post("/consume", zValidator("json", ConsumeBody), async (c) => {
  const { token } = c.req.valid("json");
  try {
    const m = await consumeMagicLink(token);
    if (m.purpose === "greenlight") {
      await getDb()
        .update(oppTable)
        .set({ status: "greenlit", greenlitByUserId: m.userId, greenlitAt: new Date() })
        .where(eq(oppTable.id, m.subjectId));
      await publishEvent("opportunities", {
        type: "opportunity_greenlit", opportunityId: m.subjectId, by: m.userId, at: new Date().toISOString(),
      });
    } else if (m.purpose === "reject") {
      await getDb().update(oppTable).set({ status: "rejected" }).where(eq(oppTable.id, m.subjectId));
    } else if (m.purpose === "operator-login") {
      const jwt = await issueOperatorJwt({ sub: m.userId, email: "", isOperator: true }, 3600);
      return c.json({ purpose: m.purpose, jwt });
    }
    return c.json({ purpose: m.purpose, subjectId: m.subjectId });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
