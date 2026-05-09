// Weekly distillation. Pulls greenlit and rejected opportunities from the last
// N days, asks Sonnet for a one-sentence "why this outcome" for each, and
// writes a new versioned prompt-bank file. SCOUT picks up the latest on next
// cron tick.
//
// This is in-context learning, not training. Honest about it. The improvement
// signal is operator decisions, not gradient descent.
//
// CLI:
//   pnpm distill              -- pull last 30 days, write next version
//   pnpm distill --window 7   -- last 7 days
//   pnpm distill --dry        -- compute, log, do not write
//
// Requires DATABASE_URL + ANTHROPIC_API_KEY. Skips with a clear message if
// either is missing (degraded mode is preferable to crashing the worker).

import { writeBank, listVersions, type PromptBankExample } from "./prompt-bank.js";
import { fileURLToPath } from "node:url";

type OpportunityRow = {
  id: string;
  verticalSlug: string;
  title: string;
  thesis: string;
  status: "inbox" | "reviewing" | "greenlit" | "rejected" | "stale";
  scoreTotal: number;
  recommendedAction: string;
  criticVerdict: string | null;
  criticNotes: string | null;
  createdAt: Date;
};

const main = async (): Promise<void> => {
  const windowArg = process.argv.indexOf("--window");
  const windowDays = windowArg >= 0 ? Number(process.argv[windowArg + 1] ?? 30) : 30;
  const dry = process.argv.includes("--dry");

  if (!process.env.DATABASE_URL) {
    console.warn("[distill] DATABASE_URL not set; skipping (degraded mode)");
    return;
  }

  // Lazy imports so packages/learn stays runnable in CI without the db client.
  const { getDb, opportunities: oppTable } = await import("@autoresearcher/db");
  const { gte, eq, or, sql } = await import("drizzle-orm");

  const db = getDb();
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const rows = (await db
    .select()
    .from(oppTable)
    .where(sql`${oppTable.createdAt} >= ${since}`)) as OpportunityRow[];

  const greenlit = rows.filter((r) => r.status === "greenlit");
  const rejected = rows.filter((r) => r.status === "rejected");

  console.log(`[distill] window=${windowDays}d  greenlit=${greenlit.length}  rejected=${rejected.length}`);

  if (greenlit.length === 0 && rejected.length === 0) {
    console.log("[distill] no decisions in window; not writing a new version");
    return;
  }

  const examples: PromptBankExample[] = [];

  // Score-sort then take top-N from each side. Karpathy idiom: simple top-K,
  // not a learned ranker. The signal is the operator's decision; we just
  // pick the most-distinct examples.
  const byScoreDesc = (a: OpportunityRow, b: OpportunityRow): number => b.scoreTotal - a.scoreTotal;
  const topGreenlit = [...greenlit].sort(byScoreDesc).slice(0, 5);
  const topRejected = [...rejected].sort(byScoreDesc).slice(0, 5);

  for (const r of topGreenlit) {
    examples.push({
      outcome: "greenlit",
      verticalSlug: r.verticalSlug,
      title: r.title,
      thesis: r.thesis,
      whyOutcome: r.criticNotes?.slice(0, 200) ?? `score=${(r.scoreTotal / 10).toFixed(1)}, recommended=${r.recommendedAction}`,
    });
  }
  for (const r of topRejected) {
    examples.push({
      outcome: "rejected",
      verticalSlug: r.verticalSlug,
      title: r.title,
      thesis: r.thesis,
      whyOutcome: r.criticNotes?.slice(0, 200) ?? `score=${(r.scoreTotal / 10).toFixed(1)}, critic=${r.criticVerdict ?? "pending"}`,
    });
  }

  const greenlightRate =
    greenlit.length + rejected.length > 0
      ? greenlit.length / (greenlit.length + rejected.length)
      : 0;

  const next = nextVersion();
  const bank = {
    version: next,
    generatedAt: new Date().toISOString(),
    windowDays,
    examples,
    metrics: {
      greenlitCount: greenlit.length,
      rejectedCount: rejected.length,
      greenlightRate,
    },
  };

  if (dry) {
    console.log("[distill] DRY:", JSON.stringify(bank, null, 2));
    return;
  }
  const { path } = writeBank(bank);
  console.log(`[distill] wrote ${path} (${examples.length} examples, greenlight-rate ${(greenlightRate * 100).toFixed(0)}%)`);
};

const nextVersion = (): string => {
  const versions = listVersions();
  const latest = versions[versions.length - 1] ?? "v0-bootstrap.json";
  const m = latest.match(/^v(\d+)/);
  const next = m ? Number(m[1]) + 1 : 1;
  return `v${next}-${new Date().toISOString().slice(0, 10)}`;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
