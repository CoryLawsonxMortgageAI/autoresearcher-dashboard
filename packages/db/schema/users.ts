import { mysqlTable, varchar, timestamp, boolean, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }),
    isOperator: boolean("is_operator").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at"),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  })
);

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
