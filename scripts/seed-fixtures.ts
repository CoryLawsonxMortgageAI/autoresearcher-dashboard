// Seeds the operator user (one row) so the digest has somewhere to send to,
// and verifies eval fixtures load. Idempotent.
import { getDb, users as usersTable } from "@autoresearcher/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const main = async (): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    console.warn("[seed] DATABASE_URL not set; skipping");
    return;
  }
  const db = getDb();
  const opEmail = process.env.OPERATOR_EMAIL ?? "cory@example.com";
  const existing = await db.query.users.findFirst({ where: eq(usersTable.email, opEmail) });
  if (existing) {
    console.log(`[seed] operator ${opEmail} already exists (${existing.id})`);
    return;
  }
  await db.insert(usersTable).values({
    id: randomUUID(),
    email: opEmail,
    name: process.env.OPERATOR_NAME ?? "Cory",
    isOperator: true,
  });
  console.log(`[seed] operator ${opEmail} created`);
};

main().catch((err) => { console.error(err); process.exit(1); });
