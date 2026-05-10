// Tier-E :: SWE-bench-mini-style multi-file problems.
//
// Each problem has:
//   spec.md              human-readable problem
//   types.ts             shared types (read-only)
//   tests.ts             tests; imports from `./<target>.js`
//   reference-<target>.ts known-good implementation (static-mode source)
//
// Problem dir typically has a single editable target; the test file imports
// from a fixed name (e.g., `./ranker.js`). Static mode copies the
// reference into place. Live mode asks Claude to produce the target file
// content given the spec + types + tests.
//
// SECURITY NOTE: live-mode runs agent-written TypeScript via tsx in this
// process. For multi-file problems with broader file-system surface, this
// MUST move into a Docker sandbox (E2B / Modal / Fly machine ephemeral).
// Tracked in ADR 0013.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "fixtures", "swe-mini");

export type SweMiniResult = {
  id: string;
  passed: boolean;
  detail: string;
  durationMs: number;
  attempts: number;
};

export type SweMiniMode = "static" | "live";

const MAX_ATTEMPTS = (() => {
  const n = Number(process.env.SWE_MINI_MAX_ATTEMPTS ?? 3);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
})();

type Problem = {
  id: string;
  dir: string;
  // The target filename the agent must produce, e.g. "ranker.ts".
  target: string;
  // The reference source filename, e.g. "reference-ranker.ts".
  reference: string;
};

const detectProblem = (id: string): Problem => {
  const dir = join(ROOT, id);
  const files = readdirSync(dir);
  const refFile = files.find((f) => f.startsWith("reference-") && f.endsWith(".ts"));
  if (!refFile) throw new Error(`no reference-*.ts in ${dir}`);
  const target = refFile.replace(/^reference-/, "");
  return { id, dir, target, reference: refFile };
};

const listProblems = (): Problem[] => {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .filter((f) => statSync(join(ROOT, f)).isDirectory())
    .sort()
    .map(detectProblem);
};

const runTests = (dir: string): { ok: true } | { ok: false; output: string } => {
  try {
    // Quote for Windows paths with spaces (e.g., C:\Users\Cory\...).
    execSync(`pnpm dlx tsx "${join(dir, "tests.ts")}"`, { stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const out = `${e.stdout?.toString() ?? ""}\n${e.stderr?.toString() ?? ""}`.trim();
    return { ok: false, output: out || (e.message ?? "tests failed") };
  }
};

const synthesizeWithClaude = async (args: {
  spec: string;
  types: string;
  tests: string;
  target: string;
  lastFailure: string | null;
  attempt: number;
  ofN: number;
}): Promise<string> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for --live mode");
  const sdk = await import("@anthropic-ai/sdk");
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey });

  const userBase = `Problem spec:\n\`\`\`md\n${args.spec}\n\`\`\`\n
types.ts (read-only):\n\`\`\`ts\n${args.types}\n\`\`\`\n
tests.ts (read-only):\n\`\`\`ts\n${args.tests}\n\`\`\`\n
Produce the contents of \`${args.target}\`.`;

  const userContent = args.lastFailure
    ? `${userBase}\n\nPrevious attempt (${args.attempt - 1}/${args.ofN}) failed with:\n\`\`\`\n${args.lastFailure.slice(-2000)}\n\`\`\`\nProduce a corrected file.`
    : userBase;

  const resp = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3072,
    system:
      `You write TypeScript files that pass tests. Given a spec, a read-only types.ts, ` +
      `and a read-only tests.ts, return ONLY the contents of ${args.target}. ` +
      `No prose, no fences. Strict mode. No \`any\`. Import only from \`./types.js\`.`,
    messages: [{ role: "user", content: userContent }],
  });
  type TextBlock = { type: "text"; text: string };
  const isTextBlock = (b: { type: string }): b is TextBlock => b.type === "text";
  const text = resp.content.filter(isTextBlock).map((b) => b.text).join("\n");
  return text.replace(/^```(?:ts|typescript)?\s*/i, "").replace(/```\s*$/, "").trim();
};

const runOneProblem = async (p: Problem, mode: SweMiniMode): Promise<SweMiniResult> => {
  const t0 = Date.now();
  const targetPath = join(p.dir, p.target);

  if (mode === "static") {
    const ref = readFileSync(join(p.dir, p.reference), "utf8");
    writeFileSync(targetPath, ref);
    const r = runTests(p.dir);
    if (r.ok) return { id: p.id, passed: true, detail: "tests passed", durationMs: Date.now() - t0, attempts: 1 };
    return { id: p.id, passed: false, detail: r.output.slice(0, 500), durationMs: Date.now() - t0, attempts: 1 };
  }

  const spec = readFileSync(join(p.dir, "spec.md"), "utf8");
  const types = readFileSync(join(p.dir, "types.ts"), "utf8");
  const tests = readFileSync(join(p.dir, "tests.ts"), "utf8");

  let lastOutput: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = await synthesizeWithClaude({
      spec, types, tests, target: p.target,
      lastFailure: lastOutput, attempt, ofN: MAX_ATTEMPTS,
    });
    writeFileSync(targetPath, code);
    const r = runTests(p.dir);
    if (r.ok) {
      return { id: p.id, passed: true, detail: `tests passed on attempt ${attempt}`, durationMs: Date.now() - t0, attempts: attempt };
    }
    lastOutput = r.output;
  }
  return {
    id: p.id, passed: false,
    detail: (lastOutput ?? "tests failed").slice(0, 500),
    durationMs: Date.now() - t0,
    attempts: MAX_ATTEMPTS,
  };
};

export const runSweMini = async (mode: SweMiniMode = "static"): Promise<{
  mode: SweMiniMode;
  results: SweMiniResult[];
  passed: boolean;
  passRate: number;
}> => {
  const problems = listProblems();
  const results: SweMiniResult[] = [];
  for (const p of problems) results.push(await runOneProblem(p, mode));
  const passes = results.filter((r) => r.passed).length;
  const passRate = problems.length === 0 ? 1 : passes / problems.length;
  // Tier-E thresholds: static must be 1.0; live may be lower because problems
  // are intentionally harder than Tier-D.
  const threshold = mode === "static" ? 1.0 : 0.5;
  return { mode, results, passed: passRate >= threshold, passRate };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode: SweMiniMode = process.argv.includes("--live") ? "live" : "static";
  const r = await runSweMini(mode);
  console.log(`swe-mini (${mode}) ${r.passed ? "PASS" : "FAIL"} passRate=${r.passRate.toFixed(2)} (${r.results.filter((x) => x.passed).length}/${r.results.length})`);
  for (const res of r.results) {
    const detail = res.passed ? "" : ` :: ${res.detail.split("\n")[0]}`;
    console.log(`  ${res.passed ? "✓" : "✗"} ${res.id} (${res.durationMs}ms, attempts=${res.attempts})${detail}`);
  }
  process.exit(r.passed ? 0 : 1);
}
