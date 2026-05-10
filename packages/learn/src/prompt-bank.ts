// Versioned prompt bank. Karpathy idiom: learning artifacts are files, not
// opaque embeddings or fine-tuned weights. Each distillation writes a new
// versioned file; the agent reads the latest. Operator can `git checkout`
// a prior version if a learning iteration regresses.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { EMBEDDED_BANK, EMBEDDED_BANK_VERSIONS } from "./_embedded/bank.js";

const here = dirname(fileURLToPath(import.meta.url));
const BANK_DIR = join(here, "..", "fixtures", "prompt-bank");

export const PromptBankExample = z.object({
  outcome: z.enum(["greenlit", "rejected"]),
  verticalSlug: z.string(),
  title: z.string(),
  thesis: z.string().min(20),
  whyOutcome: z.string().min(10),
});
export type PromptBankExample = z.infer<typeof PromptBankExample>;

export const PromptBank = z.object({
  version: z.string(), // e.g. "v3-2026-05-09"
  generatedAt: z.string(),
  windowDays: z.number(),
  examples: z.array(PromptBankExample),
  metrics: z.object({
    greenlitCount: z.number(),
    rejectedCount: z.number(),
    greenlightRate: z.number(),
  }),
});
export type PromptBank = z.infer<typeof PromptBank>;

const versionFromName = (n: string): { major: number; rest: string } | null => {
  const m = n.match(/^v(\d+)(.*)\.json$/);
  if (!m) return null;
  return { major: Number(m[1]), rest: m[2] ?? "" };
};

export const listVersions = (): string[] => {
  try {
    if (existsSync(BANK_DIR)) {
      const fs = readdirSync(BANK_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => {
          const va = versionFromName(a)?.major ?? 0;
          const vb = versionFromName(b)?.major ?? 0;
          return va - vb;
        });
      if (fs.length > 0) return fs;
    }
  } catch {/* fall through */}
  return [...EMBEDDED_BANK_VERSIONS];
};

export const loadLatestBank = (): PromptBank => {
  try {
    if (existsSync(BANK_DIR)) {
      const versions = readdirSync(BANK_DIR).filter((f) => f.endsWith(".json")).sort();
      const latest = versions[versions.length - 1];
      if (latest) {
        const raw = readFileSync(join(BANK_DIR, latest), "utf8");
        return PromptBank.parse(JSON.parse(raw));
      }
    }
  } catch {/* fall through */}
  return EMBEDDED_BANK;
};

export const writeBank = (bank: PromptBank): { path: string } => {
  const path = join(BANK_DIR, `${bank.version}.json`);
  writeFileSync(path, JSON.stringify(bank, null, 2) + "\n");
  return { path };
};

// Render examples for inclusion in the SCOUT user JSON. We never put learned
// content into the *system* prompt (that stays stable for prompt-caching);
// few-shot examples go in the user message so the cache hit rate stays high.
export const renderFewShot = (bank: PromptBank, max = 6): string => {
  const picked = bank.examples.slice(0, max);
  if (picked.length === 0) return "";
  const lines = picked.map(
    (ex, i) =>
      `Example ${i + 1} (${ex.outcome.toUpperCase()}, ${ex.verticalSlug}):
  title: ${ex.title}
  thesis: ${ex.thesis}
  why ${ex.outcome}: ${ex.whyOutcome}`
  );
  return `Recent operator feedback (most recent ${picked.length} of last cycle):\n${lines.join("\n\n")}`;
};
