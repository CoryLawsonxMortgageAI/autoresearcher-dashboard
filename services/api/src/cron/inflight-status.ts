// Per directive: every 60 minutes, overwrite /docs/runs/_inflight.md.
import cron from "node-cron";
import { writeInflight } from "../agents/historian.js";
import { getDb, runs as runsTable } from "@autoresearcher/db";
import { eq, desc } from "drizzle-orm";

const SCHEDULE = process.env.INFLIGHT_CRON ?? "0 * * * *";

const tick = async (): Promise<void> => {
  const db = getDb();
  const inFlight = await db.select().from(runsTable).where(eq(runsTable.status, "running")).limit(20);
  const finishedRecent = await db
    .select()
    .from(runsTable)
    .where(eq(runsTable.status, "completed"))
    .orderBy(desc(runsTable.startedAt))
    .limit(10);
  await writeInflight({
    finished: finishedRecent.map((r) => `${r.phase} (${r.id.slice(0, 8)})`),
    inFlight: inFlight.map((r) => `${r.phase} (${r.id.slice(0, 8)})`),
    evalScores: [],
    nextCheckpoint: "auto",
    liveDashboardUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000",
  });
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--once")) { await tick(); return; }
  cron.schedule(SCHEDULE, () => void tick());
};

main().catch((err) => { console.error(err); process.exit(1); });
