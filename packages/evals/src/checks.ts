import { OutOfAllowlistError, requireAllowedVertical, scoreOpportunity, recommendAction } from "@autoresearcher/skill";
import type { Fixture, FixtureResult } from "./types.js";

export const runFixture = async (f: Fixture): Promise<FixtureResult> => {
  try {
    switch (f.kind) {
      case "allowlist-rejection": {
        const input = f.input as { slug: string };
        const expect = f.expect as { rejected: boolean };
        let rejected = false;
        try { requireAllowedVertical(input.slug); } catch (e) {
          if (e instanceof OutOfAllowlistError) rejected = true;
        }
        return ok(f, rejected === expect.rejected, `slug=${input.slug} rejected=${rejected}`);
      }
      case "scoring-determinism": {
        const input = f.input as Parameters<typeof scoreOpportunity>[0];
        const expect = f.expect as { totalMin: number; totalMax: number };
        const s = scoreOpportunity(input);
        const inRange = s.total >= expect.totalMin && s.total <= expect.totalMax;
        return ok(f, inRange, `total=${s.total} expected ${expect.totalMin}..${expect.totalMax}`);
      }
      case "critic-verdict": {
        // Static check: given a (synthetic) opportunity shape, what does the
        // recommender pick? Used to catch action-band drift after refactors.
        const input = f.input as { score: Parameters<typeof recommendAction>[0] };
        const expect = f.expect as { action: string };
        const a = recommendAction(input.score);
        return ok(f, a === expect.action, `action=${a} expected ${expect.action}`);
      }
      case "evidence-floor": {
        const input = f.input as { evidenceCount: number };
        const expect = f.expect as { passes: boolean };
        const passes = input.evidenceCount >= 2;
        return ok(f, passes === expect.passes, `evidenceCount=${input.evidenceCount}`);
      }
    }
  } catch (err) {
    return ok(f, false, `threw: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const ok = (f: Fixture, passed: boolean, detail: string): FixtureResult => ({
  id: f.id, tier: f.tier, passed, detail,
});
