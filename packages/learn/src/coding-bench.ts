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
//                       solution.ts, run tests. On failure, retry up to
//                       BENCH_MAX_ATTEMPTS times, passing the test failure
//                       output back as feedback (Self-Refine / Self-Debug).
//                       Score = pass-rate.
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
  attempts: number;
};

export type BenchMode = "static" | "live";

const MAX_ATTEMPTS = (() => {
  const n = Number(process.env.BENCH_MAX_ATTEMPTS ?? 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
})();

const listProblems = (): string[] =>
  readdirSync(BENCH_ROOT)
    .filter((f) => statSync(join(BENCH_ROOT, f)).isDirectory())
    .sort();

const runTests = (dir: string): { ok: true } | { ok: false; output: string } => {
  try {
    // Quote the path: Windows installs commonly land under "C:\Users\<name>\..."
    // which contains spaces. execSync uses the default shell (cmd.exe on
    // Windows, /bin/sh on Unix) when given a string command, which resolves
    // .cmd shims correctly for `pnpm`.
    execSync(`pnpm dlx tsx "${join(dir, "tests.ts")}"`, { stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const out = `${e.stdout?.toString() ?? ""}\n${e.stderr?.toString() ?? ""}`.trim();
    return { ok: false, output: out || (e.message ?? "tests failed") };
  }
};

const runOneProblem = async (problemId: string, mode: BenchMode): Promise<BenchResult> => {
  const dir = join(BENCH_ROOT, problemId);
  const t0 = Date.now();

  if (mode === "static") {
    const ref = readFileSync(join(dir, "reference-solution.ts"), "utf8");
    writeFileSync(join(dir, "solution.ts"), ref);
    const r = runTests(dir);
    if (r.ok) return { id: problemId, passed: true, detail: "tests passed", durationMs: Date.now() - t0, attempts: 1 };
    return { id: problemId, passed: false, detail: r.output.slice(0, 500), durationMs: Date.now() - t0, attempts: 1 };
  }

  // Live mode: Self-Debug retry loop. Up to MAX_ATTEMPTS tries; each failed
  // attempt feeds the test output back to the model. References:
  //   - Self-Refine (Madaan et al., 2023): iterative refinement with feedback
  //   - SWE-agent (Yang et al., 2024): test failure as the steering signal
  const spec = readFileSync(join(dir, "spec.md"), "utf8");
  let lastOutput: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = await synthesizeWithClaude({ spec, lastFailure: lastOutput, attempt, ofN: MAX_ATTEMPTS });
    writeFileSync(join(dir, "solution.ts"), code);
    const r = runTests(dir);
    if (r.ok) {
      return { id: problemId, passed: true, detail: `tests passed on attempt ${attempt}`, durationMs: Date.now() - t0, attempts: attempt };
    }
    lastOutput = r.output;
  }
  return {
    id: problemId,
    passed: false,
    detail: (lastOutput ?? "tests failed").slice(0, 500),
    durationMs: Date.now() - t0,
    attempts: MAX_ATTEMPTS,
  };
};

const synthesizeWithClaude = async (args: {
  spec: string;
  lastFailure: string | null;
  attempt: number;
  ofN: number;
}): Promise<string> => {
  // Accept either ANTHROPIC_API_KEY (native) or OPENROUTER_API_KEY (proxy).
  // Mirrors the provider abstraction in services/api/src/lib/llm-client.ts;
  // we don't import that here to keep packages/learn dep-light.
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!anthropicKey && !openrouterKey) {
    throw new Error("Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY for --live mode");
  }
  const sdk = await import("@anthropic-ai/sdk");
  const Anthropic = sdk.default;
  const isOpenRouter = !anthropicKey && !!openrouterKey;
  const client = new Anthropic({
    apiKey: anthropicKey ?? openrouterKey ?? "",
    ...(isOpenRouter
      ? {
          baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_REFERRER ?? "https://autoresearcher-dashboard.vercel.app",
            "X-Title": "autoresearcher-bench",
          },
        }
      : {}),
  });
  const modelId = isOpenRouter ? "anthropic/claude-opus-4-7" : "claude-opus-4-7";

  const userContent = args.lastFailure
    ? `${args.spec}\n\n---\nPrevious attempt (${args.attempt - 1}/${args.ofN}) failed with:\n\`\`\`\n${args.lastFailure.slice(-2000)}\n\`\`\`\nProduce a corrected solution.ts. Do not repeat the failing approach.`
    : args.spec;

  const resp = await client.messages.create({
    model: modelId,
    max_tokens: 2048,
    system:
      "You write TypeScript. Given a problem spec, return ONLY the contents of solution.ts. " +
      "No prose, no fences. Export a function named `solve`. Strict mode, no `any`. " +
      "If a previous attempt is shown with its failure, reason about why it failed before writing the new solution.",
    messages: [{ role: "user", content: userContent }],
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
    const tag = `${res.passed ? "✓" : "✗"} ${res.id}`;
    const stats = `(${res.durationMs}ms, attempts=${res.attempts})`;
    const detail = res.passed ? "" : ` :: ${res.detail.split("\n")[0]}`;
    console.log(`  ${tag} ${stats}${detail}`);
  }
  process.exit(r.passed ? 0 : 1);
}
