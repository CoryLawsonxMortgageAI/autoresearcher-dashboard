// Coding bench (Tier D). Karpathy idiom: tests are ground truth.
//
// Each problem under fixtures/coding-bench/<id>/ has:
//   spec.md            Human-readable problem
//   tests.ts           Tests that import { solve } from './solution.js' and assert
//   reference-solution.ts   A known-good solution; used in --static mode and
//                            for diff-against-agent in --live mode
//
// Modes:
//   --static (default): copy reference-solution.ts -> solution.ts and run
//                       tests. Verifies the bench harness works in CI without
//                       calling Claude. PASS means the framework is sound.
//   --live:             call Claude with the spec, write the response to
//                       solution.ts, run tests. Score = pass-rate. This is
//                       the actual coding-ability benchmark.
//
// We do not lower the static threshold to "skip on CI" — if static fails,
// the harness itself is broken and we want CI to scream.

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = join(here, "..", "fixtures", "coding-bench");

export type BenchResult = {
  id: string;
  passed: boolean;
  detail: string;
  durationMs: number;
};

export type BenchMode = "static" | "live";

const listProblems = (): string[] =>
  readdirSync(BENCH_ROOT)
    .filter((f) => statSync(join(BENCH_ROOT, f)).isDirectory())
    .sort();

const runOneProblem = async (problemId: string, mode: BenchMode): Promise<BenchResult> => {
  const dir = join(BENCH_ROOT, problemId);
  const t0 = Date.now();

  if (mode === "static") {
    const ref = readFileSync(join(dir, "reference-solution.ts"), "utf8");
    writeFileSync(join(dir, "solution.ts"), ref);
  } else {
    // Live mode: dynamic import to avoid pulling Anthropic SDK into the static
    // bench's runtime. Operator runs `pnpm bench:live` after exporting
    // ANTHROPIC_API_KEY.
    const spec = readFileSync(join(dir, "spec.md"), "utf8");
    const code = await synthesizeWithClaude(spec);
    writeFileSync(join(dir, "solution.ts"), code);
  }

  try {
    // Run the tests.ts file with tsx; it imports ./solution.ts and asserts.
    execSync(`pnpm dlx tsx ${join(dir, "tests.ts")}`, { stdio: "pipe" });
    return { id: problemId, passed: true, detail: "tests passed", durationMs: Date.now() - t0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 500) : String(err);
    return { id: problemId, passed: false, detail, durationMs: Date.now() - t0 };
  }
};

const synthesizeWithClaude = async (spec: string): Promise<string> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for --live mode");
  // Minimal call; we don't depend on services/api here so packages/learn
  // stays runnable from CI without the full server graph.
  const sdk = await import("@anthropic-ai/sdk");
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    system:
      "You write TypeScript. Given a problem spec, return ONLY the contents of solution.ts. " +
      "No prose, no fences. Export a function named `solve`. Strict mode, no `any`.",
    messages: [{ role: "user", content: spec }],
  });
  type TextBlock = { type: "text"; text: string };
  const isTextBlock = (b: { type: string }): b is TextBlock => b.type === "text";
  const text = resp.content
    .filter(isTextBlock)
    .map((b) => b.text)
    .join("\n");
  return text.replace(/^```(?:ts|typescript)?\s*/i, "").replace(/```\s*$/, "").trim();
};

export const runBench = async (mode: BenchMode = "static"): Promise<{
  mode: BenchMode;
  results: BenchResult[];
  passed: boolean;
  passRate: number;
}> => {
  const problems = listProblems();
  const results: BenchResult[] = [];
  for (const p of problems) results.push(await runOneProblem(p, mode));
  const passes = results.filter((r) => r.passed).length;
  const passRate = problems.length === 0 ? 1 : passes / problems.length;
  // Tier-D thresholds:
  //   static: must be 1.0 (the harness has to work)
  //   live: must be >= 0.6 (live coding ability against synthetic problems)
  const threshold = mode === "static" ? 1.0 : 0.6;
  return { mode, results, passed: passRate >= threshold, passRate };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode: BenchMode = process.argv.includes("--live") ? "live" : "static";
  const r = await runBench(mode);
  console.log(`bench (${mode}) ${r.passed ? "PASS" : "FAIL"} passRate=${r.passRate.toFixed(2)} (${r.results.filter((x) => x.passed).length}/${r.results.length})`);
  for (const res of r.results) {
    console.log(`  ${res.passed ? "✓" : "✗"} ${res.id} (${res.durationMs}ms)${res.passed ? "" : ` :: ${res.detail.split("\n")[0]}`}`);
  }
  process.exit(r.passed ? 0 : 1);
}
