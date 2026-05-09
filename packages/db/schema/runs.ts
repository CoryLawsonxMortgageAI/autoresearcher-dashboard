import { mysqlTable, varchar, timestamp, mysqlEnum, bigint, json, text, index } from "drizzle-orm/mysql-core";

// usage_cost stored as bigint (cents). Per directive: money is never `number`.
export const runs = mysqlTable(
  "runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    phase: mysqlEnum("phase", [
      "phase-0",
      "phase-1",
      "phase-2",
      "phase-3",
      "phase-4",
      "phase-5",
      "phase-6",
      "scout-nightly",
      "digest-weekly",
      "eval-tier-a",
      "eval-tier-b",
      "eval-tier-c",
      "ad-hoc",
    ]).notNull(),
    status: mysqlEnum("status", ["queued", "running", "completed", "failed", "cancelled"])
      .notNull()
      .default("queued"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    usageCostCents: bigint("usage_cost_cents", { mode: "bigint" }).notNull().default(0n),
    inputTokens: bigint("input_tokens", { mode: "bigint" }).notNull().default(0n),
    outputTokens: bigint("output_tokens", { mode: "bigint" }).notNull().default(0n),
    errorMessage: text("error_message"),
    parentRunId: varchar("parent_run_id", { length: 36 }),
    meta: json("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    phaseIdx: index("runs_phase_idx").on(t.phase),
    statusIdx: index("runs_status_idx").on(t.status),
    parentIdx: index("runs_parent_idx").on(t.parentRunId),
    startedIdx: index("runs_started_idx").on(t.startedAt),
  })
);

export type RunRow = typeof runs.$inferSelect;
export type RunInsert = typeof runs.$inferInsert;
