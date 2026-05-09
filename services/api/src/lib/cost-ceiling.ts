import { getDb, runs } from "@autoresearcher/db";
import { sql } from "drizzle-orm";

// Per directive:
//   STOP on per-run cost > $10 OR cumulative-since-start > $100.
// $10 = 1000 cents. $100 = 10000 cents.
export const PER_RUN_CEILING_CENTS = 1000n;
export const CUMULATIVE_CEILING_CENTS = 10_000n;

export class CostCeilingExceeded extends Error {
  constructor(readonly which: "per-run" | "cumulative", readonly cents: bigint) {
    super(`${which} cost ceiling exceeded: ${cents} cents`);
    this.name = "CostCeilingExceeded";
  }
}

export const assertWithinCeiling = async (args: {
  runId: string;
  newCostCents: bigint;
}): Promise<void> => {
  if (args.newCostCents > PER_RUN_CEILING_CENTS) {
    throw new CostCeilingExceeded("per-run", args.newCostCents);
  }
  const db = getDb();
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(usage_cost_cents), 0)` })
    .from(runs);
  const total = BigInt(rows[0]?.total ?? "0") + args.newCostCents;
  if (total > CUMULATIVE_CEILING_CENTS) {
    throw new CostCeilingExceeded("cumulative", total);
  }
};
