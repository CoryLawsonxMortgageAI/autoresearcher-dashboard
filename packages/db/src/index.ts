import { drizzle } from "drizzle-orm/planetscale-serverless";
import { Client } from "@planetscale/database";
import * as schema from "../schema/index.js";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

export const getDb = (): DB => {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const client = new Client({ url });
  _db = drizzle(client, { schema });
  return _db;
};

export { schema };
export * from "../schema/index.js";
