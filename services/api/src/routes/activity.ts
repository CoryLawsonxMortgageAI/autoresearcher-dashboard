import { Hono } from "hono";
import { desc, and, eq } from "drizzle-orm";
import { getDb, events as eventsTable } from "@autoresearcher/db";

export const activityRouter = new Hono();

activityRouter.get("/", async (c) => {
  const channel = c.req.query("channel");
  const limit = Math.min(Number(c.req.query("limit") ?? "100"), 500);
  const db = getDb();
  const where = channel ? eq(eventsTable.channel, channel) : undefined;
  const rows = await db.select().from(eventsTable).where(where).orderBy(desc(eventsTable.publishedAt)).limit(limit);
  return c.json({ items: rows });
});
