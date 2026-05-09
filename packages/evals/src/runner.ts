import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Fixture, type FixtureResult, type Tier } from "./types.js";
import { runFixture } from "./checks.js";

const here = dirname(fileURLToPath(import.meta.url));

const fixturesRoot = join(here, "..", "fixtures");

const loadTier = (tier: Tier): Fixture[] => {
  const dir = join(fixturesRoot, `tier-${tier.toLowerCase()}`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => Fixture.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
};

export const runTier = async (tier: Tier): Promise<{
  tier: Tier;
  results: FixtureResult[];
  score: number;
  passed: boolean;
}> => {
  const fixtures = loadTier(tier);
  const results: FixtureResult[] = [];
  for (const f of fixtures) {
    results.push(await runFixture(f));
  }
  const passes = results.filter((r) => r.passed).length;
  const score = fixtures.length === 0 ? 1 : passes / fixtures.length;
  // Tier A is regression-blocking: must be 1.0.
  // Tier B threshold: 0.95. Tier C threshold: 0.80.
  const threshold = tier === "A" ? 1.0 : tier === "B" ? 0.95 : 0.8;
  return { tier, results, score, passed: score >= threshold };
};
