import { mysqlTable, varchar, timestamp, text, index } from "drizzle-orm/mysql-core";

// Reflexion-style episodic memory. After each agent run the CRITIC writes
// one paragraph: "what went well, what to do differently next time".
// SCOUT prepends the most recent N reflections to its user JSON on the
// next cycle. Reference: Shinn et al., 2023.
export const reflections = mysqlTable(
  "reflections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 }).notNull(),
    agent: varchar("agent", { length: 32 }).notNull(),
    verticalSlug: varchar("vertical_slug", { length: 64 }),
    body: text("body").notNull(),
    metricsJson: text("metrics_json"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("refl_run_idx").on(t.runId),
    agentIdx: index("refl_agent_idx").on(t.agent),
    verticalIdx: index("refl_vertical_idx").on(t.verticalSlug),
    createdIdx: index("refl_created_idx").on(t.createdAt),
  })
);

export type ReflectionRow = typeof reflections.$inferSelect;
export type ReflectionInsert = typeof reflections.$inferInsert;
