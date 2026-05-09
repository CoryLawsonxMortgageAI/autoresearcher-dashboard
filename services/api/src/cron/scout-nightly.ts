// Nightly SCOUT cron. Runs on the worker box. Per directive:
//   "Cron on the worker box runs SCOUT nightly across the configured vertical
//    allowlist. New opportunities land in the inbox; a Pusher event fires;
//    if the dashboard is open, a toast appears."
import cron from "node-cron";
import { runScout } from "../agents/scout.js";
import { initSentry, captureException } from "../lib/sentry.js";

const SCHEDULE = process.env.SCOUT_CRON ?? "0 3 * * *"; // 03:00 daily

const main = async (): Promise<void> => {
  initSentry();
  const once = process.argv.includes("--once");
  if (once) {
    console.log("[scout-cron] running once");
    const r = await runScout({ phase: "ad-hoc" });
    console.log(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    return;
  }
  console.log(`[scout-cron] scheduled ${SCHEDULE}`);
  cron.schedule(SCHEDULE, async () => {
    try {
      const r = await runScout({ phase: "scout-nightly" });
      console.log(`[scout-cron] run ${r.runId}: ${r.opportunityIds.length} opps, ${r.rejectedOutOfAllowlist} rejected`);
    } catch (err) {
      captureException(err);
      console.error("[scout-cron] failed", err);
    }
  });
};

main().catch((err) => {
  captureException(err);
  console.error(err);
  process.exit(1);
});
