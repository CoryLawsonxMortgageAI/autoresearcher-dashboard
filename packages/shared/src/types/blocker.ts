import { z } from "zod";

export const BlockerKind = z.enum([
  "material-ambiguity",
  "missing-vercel-env",
  "tier-c-regression",
  "destructive-op",
  "cost-ceiling",
  "eval-gate-failure",
  "out-of-allowlist",
  "auto-action-refused",
  "external-4xx",
  "tier3-automerge-attempt",
  "rate-ceiling",
  "revert-failed",
  "post-merge-sentry-spike",
  "pusher-down",
]);
export type BlockerKind = z.infer<typeof BlockerKind>;

export const BlockerOption = z.object({
  rank: z.number().int().min(1).max(3),
  label: z.string(),
  description: z.string(),
});

export const Blocker = z.object({
  id: z.string().uuid(),
  kind: BlockerKind,
  phase: z.string(),
  filename: z.string(),
  filedAt: z.string(),
  resolvedAt: z.string().nullable(),
  failingCommandOrOutput: z.string(),
  diagnosis: z.string(),
  options: z.array(BlockerOption).length(3),
  defaultAfter24h: z.string(),
});
export type Blocker = z.infer<typeof Blocker>;
