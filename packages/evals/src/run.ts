import { runTier } from "./runner.js";
import type { Tier } from "./types.js";

const main = async (): Promise<void> => {
  const arg = process.argv.indexOf("--tier");
  const which = (arg >= 0 ? process.argv[arg + 1] : "all") ?? "all";
  const tiers: Tier[] = which === "all" ? ["A", "B", "C"] : [which.toUpperCase() as Tier];

  let allPassed = true;
  for (const t of tiers) {
    const r = await runTier(t);
    const stamp = r.passed ? "PASS" : "FAIL";
    console.log(`tier ${t} ${stamp} score=${r.score.toFixed(2)} (${r.results.filter((x) => x.passed).length}/${r.results.length})`);
    for (const res of r.results) {
      if (!res.passed) console.log(`  - ${res.id}: ${res.detail}`);
    }
    if (!r.passed) allPassed = false;
  }
  process.exit(allPassed ? 0 : 1);
};

main().catch((err) => { console.error(err); process.exit(2); });
