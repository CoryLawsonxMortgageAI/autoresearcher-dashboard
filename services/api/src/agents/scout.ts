// SCOUT — surface concrete B2B opportunities for an allowlisted vertical.
//
// Karpathy-minimal: one function in, structured output out. The LLM does the
// research; we do the validation. We never trust the LLM to enforce the
// allowlist — that happens in the tool layer (requireAllowedVertical).
//
// In-context learning surface (Karpathy idiom: files, not embeddings):
//   1. Prompt bank        — top-K greenlit/rejected examples (Reflexion-light)
//   2. Reflections        — recent CRITIC paragraphs (Reflexion proper)
//   3. Skill library      — versioned research moves (Voyager-light)
//   4. Best-of-N + critic — test-time compute scaling
//
// The system prompt stays STABLE for prompt caching; everything above rides
// on the user message.
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  loadVerticals,
  requireAllowedVertical,
  scoreOpportunity,
  recommendAction,
  SCOUT_SYSTEM,
  verticalContext,
} from "@autoresearcher/skill";
import type { Vertical } from "@autoresearcher/shared";
import {
  loadLatestBank,
  renderFewShot,
  skillsForVertical,
  renderSkills,
} from "@autoresearcher/learn";
import { getDb, opportunities as oppTable } from "@autoresearcher/db";
import { callClaude, costCents, MODEL_OPUS } from "../lib/llm.js";
import { startRun, finishRun } from "../lib/run-tracker.js";
import { publishEvent } from "../lib/pusher.js";
import { captureException } from "../lib/sentry.js";
import { recentReflections, renderReflections, writeReflection } from "../lib/reflections.js";
import { append as appendTrajectory } from "../lib/trajectory.js";

const ScoutFinding = z.object({
  verticalSlug: z.string(),
  title: z.string().min(5).max(200),
  thesis: z.string().min(20),
  evidence: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().min(1),
        excerpt: z.string().min(20),
        retrievedAt: z.string(),
        weight: z.number().min(0).max(1),
      })
    )
    .min(2),
  inputs: z.object({
    evidenceCount: z.number().int().nonnegative(),
    domainAuthorityAvg: z.number().min(0).max(100),
    hasNamedBuyer: z.boolean(),
    marketHints: z.object({ ttlMillions: z.number().nonnegative(), growth: z.number() }),
    competitiveCount: z.number().int().nonnegative(),
    founderEdgeNotes: z.array(z.string()),
  }),
});
export type ScoutFinding = z.infer<typeof ScoutFinding>;

const ScoutOutput = z.object({ findings: z.array(ScoutFinding) });

export type ScoutResult = {
  runId: string;
  opportunityIds: string[];
  rejectedOutOfAllowlist: number;
  bestOfN: number;
};

const BEST_OF_N = (() => {
  const raw = process.env.SCOUT_BEST_OF_N;
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(5, Math.max(1, Math.floor(n)));
})();

export const runScout = async (
  args: { phase: "scout-nightly" | "ad-hoc" } = { phase: "scout-nightly" }
): Promise<ScoutResult> => {
  const runId = await startRun({ phase: args.phase, meta: { bestOfN: BEST_OF_N } });
  let cost = 0n;
  let inTok = 0n;
  let outTok = 0n;
  const insertedIds: string[] = [];
  let rejected = 0;
  const verticalMetrics: Record<string, { kept: number; dropped: number }> = {};

  try {
    await publishEvent("activity", { type: "scout_started", runId, at: new Date().toISOString() }, runId);

    const bank = safeLoadBank();
    const fewShot = bank ? renderFewShot(bank, 6) : "";

    const verticals = loadVerticals().verticals;
    for (const v of verticals) {
      const verticalReflections = await recentReflections({
        agent: "scout", verticalSlug: v.slug, limit: 3,
      }).catch(() => []);
      const skills = skillsForVertical(v.slug, 5);

      const userJson = buildUserJson({
        v, fewShot,
        feedbackVersion: bank?.version ?? "v0-bootstrap",
        reflections: renderReflections(verticalReflections),
        skills: renderSkills(skills),
      });

      const { findings, llmCostCents, llmInTok, llmOutTok } = await scoutVerticalBestOfN({
        runId, vertical: v, userJson, n: BEST_OF_N,
      });
      inTok += llmInTok; outTok += llmOutTok; cost += llmCostCents;

      let kept = 0;
      let dropped = 0;
      for (const finding of findings) {
        try { requireAllowedVertical(finding.verticalSlug); }
        catch { rejected++; dropped++; continue; }

        const score = scoreOpportunity(finding.inputs);
        const action = recommendAction(score);
        const id = randomUUID();
        await getDb().insert(oppTable).values({
          id, runId,
          verticalSlug: finding.verticalSlug,
          title: finding.title,
          thesis: finding.thesis,
          evidence: finding.evidence,
          scoreFit: Math.round(score.fit * 10),
          scoreEvidence: Math.round(score.evidenceQuality * 10),
          scoreMarket: Math.round(score.marketSize * 10),
          scoreCompetitive: Math.round(score.competitiveDensity * 10),
          scoreFounder: Math.round(score.founderEdge * 10),
          scoreTotal: Math.round(score.total * 10),
          recommendedAction: action,
          status: "inbox",
        });
        insertedIds.push(id);
        kept++;
        await publishEvent(
          "opportunities",
          {
            type: "opportunity_added",
            opportunityId: id,
            verticalSlug: finding.verticalSlug,
            title: finding.title,
            at: new Date().toISOString(),
          },
          runId
        );
      }
      verticalMetrics[v.slug] = { kept, dropped };
    }

    // After the run completes successfully, write a single Reflexion-style
    // note: what got kept, what got dropped, anything notable. The next SCOUT
    // run reads the most recent reflections per vertical.
    await writeRunReflection({ runId, verticalMetrics });

    await finishRun({ runId, status: "completed", costCents: cost, inputTokens: inTok, outputTokens: outTok });
    return { runId, opportunityIds: insertedIds, rejectedOutOfAllowlist: rejected, bestOfN: BEST_OF_N };
  } catch (err) {
    captureException(err);
    await finishRun({
      runId, status: "failed",
      costCents: cost, inputTokens: inTok, outputTokens: outTok,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

type UserJsonArgs = {
  v: Vertical;
  fewShot: string;
  feedbackVersion: string;
  reflections: string;
  skills: string;
};

const buildUserJson = (a: UserJsonArgs): Record<string, unknown> => ({
  instructions: "Surface up to 3 concrete opportunities in this vertical. Each must have >=2 distinct evidence URLs.",
  vertical: {
    slug: a.v.slug, name: a.v.name, description: a.v.description,
    queries: a.v.queries, exclusions: a.v.exclusions ?? [],
  },
  outputShape: "ScoutOutput",
  context: verticalContext(a.v),
  feedback: a.fewShot || "(none yet — first cycle)",
  feedbackVersion: a.feedbackVersion,
  reflections: a.reflections || "(no prior reflections for this vertical)",
  skills: a.skills || "(no applicable skills)",
});

type BoNResult = {
  findings: ScoutFinding[];
  llmCostCents: bigint;
  llmInTok: bigint;
  llmOutTok: bigint;
};

const scoutVerticalBestOfN = async (args: {
  runId: string;
  vertical: Vertical;
  userJson: Record<string, unknown>;
  n: number;
}): Promise<BoNResult> => {
  let cost = 0n;
  let inT = 0n;
  let outT = 0n;
  const candidatePools: ScoutFinding[][] = [];

  for (let attempt = 0; attempt < args.n; attempt++) {
    const t0 = Date.now();
    const { text, inputTokens, outputTokens } = await callClaude({
      model: MODEL_OPUS,
      system: SCOUT_SYSTEM,
      userJson: { ...args.userJson, _attempt: attempt + 1, _ofN: args.n },
    });
    inT += BigInt(inputTokens);
    outT += BigInt(outputTokens);
    cost += costCents(MODEL_OPUS, inputTokens, outputTokens);

    appendTrajectory(args.runId, {
      kind: "llm",
      model: MODEL_OPUS,
      system: "SCOUT_SYSTEM",
      userJson: args.userJson,
      outputText: text.slice(0, 8000),
      inputTokens, outputTokens,
      costCents: cost.toString(),
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    });

    const parsed = parseScoutOutput(text);
    if (parsed) candidatePools.push(parsed.findings);
  }

  // Composite-score adjudication. We don't run a separate CRITIC LLM call here
  // (cost and prompt-caching reasons); we use the deterministic scorer as the
  // ranker, which is honest with the directive: scoring is code, reviewed.
  const scoredFindings = candidatePools.flat().map((f) => ({
    f, score: scoreOpportunity(f.inputs).total,
  }));
  // Dedup by lowercased title prefix.
  const seen = new Map<string, { f: ScoutFinding; score: number }>();
  for (const sf of scoredFindings) {
    const key = sf.f.title.trim().toLowerCase().slice(0, 80);
    const cur = seen.get(key);
    if (!cur || sf.score > cur.score) seen.set(key, sf);
  }
  // Per-vertical cap of 3 surviving findings.
  const ranked = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  return { findings: ranked.map((r) => r.f), llmCostCents: cost, llmInTok: inT, llmOutTok: outT };
};

const writeRunReflection = async (args: {
  runId: string;
  verticalMetrics: Record<string, { kept: number; dropped: number }>;
}): Promise<void> => {
  for (const [slug, m] of Object.entries(args.verticalMetrics)) {
    if (m.kept === 0 && m.dropped === 0) continue;
    const body =
      m.kept === 0
        ? `Vertical ${slug}: zero kept (${m.dropped} dropped). Likely cause: evidence floor or named-buyer gate. Next run: prioritize verticals with named-buyer signal.`
        : `Vertical ${slug}: kept ${m.kept}, dropped ${m.dropped}. Score-driven adjudication selected the best across BoN attempts.`;
    await writeReflection({
      runId: args.runId,
      agent: "scout",
      verticalSlug: slug,
      body,
      metrics: { kept: m.kept, dropped: m.dropped },
    }).catch(() => {/* db unavailable; reflection is best-effort */});
  }
};

const parseScoutOutput = (text: string): { findings: ScoutFinding[] } | null => {
  const cleaned = stripFences(text);
  try {
    const obj: unknown = JSON.parse(cleaned);
    return ScoutOutput.parse(obj);
  } catch {
    return null;
  }
};

const stripFences = (s: string): string =>
  s.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

const safeLoadBank = (): ReturnType<typeof loadLatestBank> | null => {
  try { return loadLatestBank(); } catch { return null; }
};
