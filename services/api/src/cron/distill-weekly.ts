// Weekly distillation cron. Runs `pnpm distill` (the @autoresearcher/learn
// CLI) inside the worker so the prompt bank advances automatically. Idle-safe:
// if there were no operator decisions in the window, nothing is written.
import cron from "node-cron";
import { spawnSync } from "node:child_process";
import { initSentry, captureException } from "../lib/sentry.js";

const SCHEDULE = process.env.DISTILL_CRON ?? "0 10 * * MON"; // Mon 10:00, after digest

const tick = (): void => {
  const r = spawnSync("pnpm", ["--filter", "@autoresearcher/learn", "run", "distill"], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    const err = new Error(`distill exited with status ${r.status}`);
    captureException(err);
  }
};

const main = async (): Promise<void> => {
  initSentry();
  if (process.argv.includes("--once")) { tick(); return; }
  console.log(`[distill-cron] scheduled ${SCHEDULE}`);
  cron.schedule(SCHEDULE, () => tick());
};

main().catch((err) => { captureException(err); console.error(err); process.exit(1); });
