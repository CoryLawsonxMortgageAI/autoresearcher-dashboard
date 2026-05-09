import { z } from "zod";

// Tiers, per directive's "phase eval gates":
//   A: golden — must always pass (regression-blocking)
//   B: regression — score must not drop >5% week-over-week
//   C: stress — adversarial, model-swap-sensitive; tier-C regression after a
//      model swap is a stop condition.
export const Tier = z.enum(["A", "B", "C"]);
export type Tier = z.infer<typeof Tier>;

export const Fixture = z.object({
  id: z.string(),
  tier: Tier,
  kind: z.enum(["allowlist-rejection", "scoring-determinism", "critic-verdict", "evidence-floor"]),
  input: z.unknown(),
  expect: z.unknown(),
  description: z.string(),
});
export type Fixture = z.infer<typeof Fixture>;

export const FixtureResult = z.object({
  id: z.string(),
  tier: Tier,
  passed: z.boolean(),
  detail: z.string(),
});
export type FixtureResult = z.infer<typeof FixtureResult>;
