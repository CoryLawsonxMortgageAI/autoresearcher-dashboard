import { z } from "zod";

export const RunPhase = z.enum([
  "phase-0",
  "phase-1",
  "phase-2",
  "phase-3",
  "phase-4",
  "phase-5",
  "phase-6",
  "scout-nightly",
  "digest-weekly",
  "eval-tier-a",
  "eval-tier-b",
  "eval-tier-c",
  "ad-hoc",
]);
export type RunPhase = z.infer<typeof RunPhase>;

export const RunStatus = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type RunStatus = z.infer<typeof RunStatus>;

// usageCost: bigint cents. Per directive, money is never `number`.
export const Run = z.object({
  id: z.string().uuid(),
  phase: RunPhase,
  status: RunStatus,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  usageCostCents: z.bigint(),
  inputTokens: z.bigint(),
  outputTokens: z.bigint(),
  errorMessage: z.string().nullable(),
  parentRunId: z.string().uuid().nullable(),
  meta: z.record(z.string(), z.unknown()),
});
export type Run = z.infer<typeof Run>;
