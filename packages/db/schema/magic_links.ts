import { mysqlTable, varchar, timestamp, boolean, index } from "drizzle-orm/mysql-core";

// Signed magic-link tokens for one-tap greenlight from the digest email.
// The token itself is a JWT signed with JWT_SIGNING_KEY; we store a hash
// here for revocation / replay protection, never the raw token.
export const magicLinks = mysqlTable(
  "magic_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    subjectId: varchar("subject_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    purposeSubjectIdx: index("magic_purpose_subject_idx").on(t.purpose, t.subjectId),
    expiresIdx: index("magic_expires_idx").on(t.expiresAt),
  })
);

export type MagicLinkRow = typeof magicLinks.$inferSelect;
export type MagicLinkInsert = typeof magicLinks.$inferInsert;
