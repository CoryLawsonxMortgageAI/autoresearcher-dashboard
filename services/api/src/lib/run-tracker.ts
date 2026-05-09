import { getDb, runs as runsTable } from "@autoresearcher/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { RunPhase } from "@autoresearcher/shared";
import { assertWithinCeiling } from "./cost-ceiling.js";

export const startRun = async (args: {
  phase: RunPhase;
  parentRunId?: string;
  meta?: Record<string, unknown>;
}): Promise<string> => {
  const id = randomUUID();
  const db = getDb();
  await db.insert(runsTable).values({
    id,
    phase: args.phase,
    status: "running",
    parentRunId: args.parentRunId ?? null,
    meta: args.meta ?? {},
  });
  return id;
};

export const finishRun = async (args: {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  costCents: bigint;
  inputTokens: bigint;
  outputTokens: bigint;
  errorMessage?: string;
}): Promise<void> => {
  await assertWithinCeiling({ runId: args.runId, newCostCents: args.costCents });
  const db = getDb();
  await db
    .update(runsTable)
    .set({
      status: args.status,
      finishedAt: new Date(),
      usageCostCents: args.costCents,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      errorMessage: args.errorMessage ?? null,
    })
    .where(eq(runsTable.id, args.runId));
};
