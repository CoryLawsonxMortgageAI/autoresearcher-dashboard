// Reflexion-style episodic memory for the SCOUT/CRITIC loop.
// Reference: Shinn et al., 2023 — "verbal reinforcement learning".
// Karpathy idiom: reflections are durable rows in MySQL, not embeddings.
// Auditable, queryable by vertical, replayable for offline eval.
import { randomUUID } from "node:crypto";
import { desc, eq, sql, and } from "drizzle-orm";
import { getDb, reflections as reflTable } from "@autoresearcher/db";

export type WriteReflectionArgs = {
  runId: string;
  agent: "scout" | "critic" | "historian";
  verticalSlug?: string;
  body: string;
  metrics?: Record<string, number>;
};

export const writeReflection = async (args: WriteReflectionArgs): Promise<string> => {
  const id = randomUUID();
  await getDb()
    .insert(reflTable)
    .values({
      id,
      runId: args.runId,
      agent: args.agent,
      verticalSlug: args.verticalSlug ?? null,
      body: args.body.slice(0, 4000),
      metricsJson: args.metrics ? JSON.stringify(args.metrics) : null,
    });
  return id;
};

export const recentReflections = async (args: {
  agent: "scout" | "critic" | "historian";
  verticalSlug?: string | undefined;
  limit?: number | undefined;
}): Promise<Array<{ verticalSlug: string | null; body: string; createdAt: Date }>> => {
  const limit = Math.max(1, Math.min(args.limit ?? 5, 20));
  const where = args.verticalSlug
    ? and(eq(reflTable.agent, args.agent), eq(reflTable.verticalSlug, args.verticalSlug))
    : eq(reflTable.agent, args.agent);
  const rows = await getDb()
    .select({ verticalSlug: reflTable.verticalSlug, body: reflTable.body, createdAt: reflTable.createdAt })
    .from(reflTable)
    .where(where)
    .orderBy(desc(reflTable.createdAt))
    .limit(limit);
  return rows;
};

export const renderReflections = (
  rows: Array<{ verticalSlug: string | null; body: string; createdAt: Date }>
): string => {
  if (rows.length === 0) return "";
  return `Recent reflections (most recent first):\n${rows
    .map((r, i) => `${i + 1}. [${r.verticalSlug ?? "general"}] ${r.body}`)
    .join("\n")}`;
};

// Tiny SQL helper used by aggregations elsewhere.
export const _sql = sql;
