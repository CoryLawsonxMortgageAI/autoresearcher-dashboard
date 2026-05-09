import { z } from "zod";

export const PusherChannel = z.enum(["activity", "opportunities", "merges", "blockers"]);
export type PusherChannel = z.infer<typeof PusherChannel>;

export const ActivityEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scout_started"), runId: z.string().uuid(), at: z.string() }),
  z.object({
    type: z.literal("opportunity_added"),
    opportunityId: z.string().uuid(),
    verticalSlug: z.string(),
    title: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("opportunity_greenlit"),
    opportunityId: z.string().uuid(),
    by: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("phase_completed"),
    phase: z.string(),
    runId: z.string().uuid(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("blocker_filed"),
    blockerId: z.string().uuid(),
    kind: z.string(),
    filename: z.string(),
    at: z.string(),
  }),
  z.object({
    type: z.literal("merge_ready"),
    prNumber: z.number().int().positive(),
    tier: z.enum(["tier-1", "tier-2", "tier-3"]),
    at: z.string(),
  }),
  z.object({
    type: z.literal("merge_completed"),
    prNumber: z.number().int().positive(),
    by: z.string(),
    at: z.string(),
  }),
  z.object({ type: z.literal("eval_completed"), tier: z.enum(["A", "B", "C"]), score: z.number(), at: z.string() }),
]);
export type ActivityEvent = z.infer<typeof ActivityEvent>;
