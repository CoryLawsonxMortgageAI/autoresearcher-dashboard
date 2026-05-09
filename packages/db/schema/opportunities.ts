import {
  mysqlTable, varchar, timestamp, mysqlEnum, json, text, int, index,
} from "drizzle-orm/mysql-core";

export const opportunities = mysqlTable(
  "opportunities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 }).notNull(),
    verticalSlug: varchar("vertical_slug", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    thesis: text("thesis").notNull(),
    evidence: json("evidence")
      .$type<Array<{ url: string; title: string; excerpt: string; retrievedAt: string; weight: number }>>()
      .notNull(),
    scoreFit: int("score_fit").notNull(),
    scoreEvidence: int("score_evidence").notNull(),
    scoreMarket: int("score_market").notNull(),
    scoreCompetitive: int("score_competitive").notNull(),
    scoreFounder: int("score_founder").notNull(),
    scoreTotal: int("score_total").notNull(),
    recommendedAction: mysqlEnum("recommended_action", [
      "deep-dive",
      "interview-3-buyers",
      "build-prototype",
      "skip",
      "watch",
    ]).notNull(),
    status: mysqlEnum("status", ["inbox", "reviewing", "greenlit", "rejected", "stale"])
      .notNull()
      .default("inbox"),
    // Set ONLY by verifyJwt() / requireUserId() in routes. Hook enforces this.
    greenlitByUserId: varchar("greenlit_by_user_id", { length: 36 }),
    greenlitAt: timestamp("greenlit_at"),
    criticVerdict: mysqlEnum("critic_verdict", ["approve", "reject", "needs-revision"]),
    criticNotes: text("critic_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    verticalIdx: index("opp_vertical_idx").on(t.verticalSlug),
    statusIdx: index("opp_status_idx").on(t.status),
    runIdx: index("opp_run_idx").on(t.runId),
    scoreIdx: index("opp_score_idx").on(t.scoreTotal),
    createdIdx: index("opp_created_idx").on(t.createdAt),
  })
);

export type OpportunityRow = typeof opportunities.$inferSelect;
export type OpportunityInsert = typeof opportunities.$inferInsert;
