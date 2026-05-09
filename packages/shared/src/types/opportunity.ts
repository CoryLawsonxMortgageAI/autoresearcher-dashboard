import { z } from "zod";

export const OpportunityStatus = z.enum([
  "inbox",
  "reviewing",
  "greenlit",
  "rejected",
  "stale",
]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

export const ScoreBreakdown = z.object({
  fit: z.number().min(0).max(10),
  evidenceQuality: z.number().min(0).max(10),
  marketSize: z.number().min(0).max(10),
  competitiveDensity: z.number().min(0).max(10),
  founderEdge: z.number().min(0).max(10),
  total: z.number().min(0).max(50),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

export const Evidence = z.object({
  url: z.string().url(),
  title: z.string(),
  excerpt: z.string(),
  retrievedAt: z.string(),
  weight: z.number().min(0).max(1),
});
export type Evidence = z.infer<typeof Evidence>;

export const RecommendedAction = z.enum([
  "deep-dive",
  "interview-3-buyers",
  "build-prototype",
  "skip",
  "watch",
]);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const Opportunity = z.object({
  id: z.string().uuid(),
  verticalSlug: z.string(),
  title: z.string().min(5).max(200),
  thesis: z.string().min(20),
  evidence: z.array(Evidence).min(1),
  score: ScoreBreakdown,
  recommendedAction: RecommendedAction,
  status: OpportunityStatus,
  greenlitByUserId: z.string().nullable(),
  greenlitAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  runId: z.string().uuid(),
  criticVerdict: z.enum(["approve", "reject", "needs-revision"]).nullable(),
  criticNotes: z.string().nullable(),
});
export type Opportunity = z.infer<typeof Opportunity>;
