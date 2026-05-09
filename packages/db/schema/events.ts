import { mysqlTable, varchar, timestamp, json, index } from "drizzle-orm/mysql-core";

// Audit trail of every event we ever publish. Source of truth for the
// activity feed; Pusher is a transport, not a store.
export const events = mysqlTable(
  "events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 64 }).notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
    runId: varchar("run_id", { length: 36 }),
  },
  (t) => ({
    typeIdx: index("events_type_idx").on(t.type),
    channelIdx: index("events_channel_idx").on(t.channel),
    publishedIdx: index("events_published_idx").on(t.publishedAt),
    runIdx: index("events_run_idx").on(t.runId),
  })
);

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
