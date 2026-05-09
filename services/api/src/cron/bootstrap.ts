// Bootstraps all crons in a single worker process. Used by the Railway/Fly worker.
import "./scout-nightly.js";
import "./digest-weekly.js";
import "./inflight-status.js";
console.log("[cron] all schedulers booted");
