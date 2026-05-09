import {
  mysqlTable, varchar, timestamp, mysqlEnum, boolean, bigint, text, int, index,
} from "drizzle-orm/mysql-core";

export const merges = mysqlTable(
  "merges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    prNumber: int("pr_number").notNull(),
    prTitle: varchar("pr_title", { length: 300 }).notNull(),
    prUrl: varchar("pr_url", { length: 500 }).notNull(),
    tier: mysqlEnum("tier", ["tier-1", "tier-2", "tier-3"]).notNull(),
    status: mysqlEnum("status", [
      "pending-cascade",
      "ready-for-tap",
      "merged",
      "reverted",
      "blocked",
    ]).notNull().default("pending-cascade"),
    cascadeGreen: boolean("cascade_green").notNull().default(false),
    criticVerdict: mysqlEnum("critic_verdict", ["approve", "reject", "needs-revision"]),
    evalDeltaJson: text("eval_delta_json"),
    costCents: bigint("cost_cents", { mode: "bigint" }).notNull().default(0n),
    safetySummary: text("safety_summary"),
    mergedByUserId: varchar("merged_by_user_id", { length: 36 }),
    mergedAt: timestamp("merged_at"),
    revertedAt: timestamp("reverted_at"),
    revertableUntil: timestamp("revertable_until"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    prIdx: index("merges_pr_idx").on(t.prNumber),
    tierIdx: index("merges_tier_idx").on(t.tier),
    statusIdx: index("merges_status_idx").on(t.status),
  })
);

export type MergeRow = typeof merges.$inferSelect;
export type MergeInsert = typeof merges.$inferInsert;
