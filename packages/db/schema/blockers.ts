import { mysqlTable, varchar, timestamp, mysqlEnum, json, text, index } from "drizzle-orm/mysql-core";

export const blockers = mysqlTable(
  "blockers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    kind: mysqlEnum("kind", [
      "material-ambiguity",
      "missing-vercel-env",
      "tier-c-regression",
      "destructive-op",
      "cost-ceiling",
      "eval-gate-failure",
      "out-of-allowlist",
      "auto-action-refused",
      "external-4xx",
      "tier3-automerge-attempt",
      "rate-ceiling",
      "revert-failed",
      "post-merge-sentry-spike",
      "pusher-down",
    ]).notNull(),
    phase: varchar("phase", { length: 32 }).notNull(),
    filename: varchar("filename", { length: 200 }).notNull(),
    filedAt: timestamp("filed_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    failingCommandOrOutput: text("failing_command_or_output").notNull(),
    diagnosis: text("diagnosis").notNull(),
    options: json("options").$type<Array<{ rank: number; label: string; description: string }>>().notNull(),
    defaultAfter24h: text("default_after_24h").notNull(),
  },
  (t) => ({
    kindIdx: index("blockers_kind_idx").on(t.kind),
    phaseIdx: index("blockers_phase_idx").on(t.phase),
    resolvedIdx: index("blockers_resolved_idx").on(t.resolvedAt),
  })
);

export type BlockerRow = typeof blockers.$inferSelect;
export type BlockerInsert = typeof blockers.$inferInsert;
