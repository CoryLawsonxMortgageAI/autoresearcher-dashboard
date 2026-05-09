import { z } from "zod";

export const MergeTier = z.enum(["tier-1", "tier-2", "tier-3"]);
export type MergeTier = z.infer<typeof MergeTier>;

export const MergeStatus = z.enum([
  "pending-cascade",
  "ready-for-tap",
  "merged",
  "reverted",
  "blocked",
]);
export type MergeStatus = z.infer<typeof MergeStatus>;

export const MergeRecord = z.object({
  id: z.string().uuid(),
  prNumber: z.number().int().positive(),
  prTitle: z.string(),
  prUrl: z.string().url(),
  tier: MergeTier,
  status: MergeStatus,
  cascadeGreen: z.boolean(),
  criticVerdict: z.enum(["approve", "reject", "needs-revision"]).nullable(),
  evalDeltaJson: z.string().nullable(),
  costCents: z.bigint(),
  safetySummary: z.string().nullable(),
  mergedByUserId: z.string().nullable(),
  mergedAt: z.string().nullable(),
  revertedAt: z.string().nullable(),
  revertableUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MergeRecord = z.infer<typeof MergeRecord>;
