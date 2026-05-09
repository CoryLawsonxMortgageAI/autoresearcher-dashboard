// SCOUT — surface concrete B2B opportunities for an allowlisted vertical.
//
// Karpathy-minimal: one function in, structured output out. The LLM does the
// research; we do the validation. We never trust the LLM to enforce the
// allowlist — that happens in the tool layer (requireAllowedVertical).
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
import { loadLatestBank, renderFewShot } from "@autoresearcher/learn";
import { getDb, opportunities as oppTable } from "@autoresearcher/db";
import { callClaude, costCents, MODEL_OPUS } from "../lib/llm.js";
import { startRun, finishRun } from "../lib/run-tracker.js";
import { publishEvent } from "../lib/pusher.js";
import { captureException } from "../lib/sentry.js";

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
};

export const runScout = async (args: { phase: "scout-nightly" | "ad-hoc" } = { phase: "scout-nightly" }): Promise<ScoutResult> => {
  const runId = await startRun({ phase: args.phase });
  let cost = 0n;
  let inTok = 0n;
  let outTok = 0n;
  const insertedIds: string[] = [];
  let rejected = 0;

  try {
    await publishEvent("activity", { type: "scout_started", runId, at: new Date().toISOString() }, runId);

    // Load the latest distilled feedback bank. In-context learning, not training:
    // operator decisions from the last cycle steer the next batch as few-shot
    // examples in the user JSON. The system prompt stays stable for caching.
    const bank = safeLoadBank();
    const fewShot = bank ? renderFewShot(bank, 6) : "";

    const verticals = loadVerticals().verticals;
    for (const v of verticals) {
      const userJson = {
        instructions: "Surface up to 3 concrete opportunities in this vertical. Each must have >=2 distinct evidence URLs.",
        vertical: { slug: v.slug, name: v.name, description: v.description, queries: v.queries, exclusions: v.exclusions ?? [] },
        outputShape: ScoutFinding._def.typeName,
        context: verticalContext(v),
        feedback: fewShot || "(none yet — first cycle)",
        feedbackVersion: bank?.version ?? "v0-bootstrap",
      };
      const { text, inputTokens, outputTokens } = await callClaude({
        model: MODEL_OPUS,
        system: SCOUT_SYSTEM,
        userJson,
      });
      inTok += BigInt(inputTokens);
      outTok += BigInt(outputTokens);
      cost += costCents(MODEL_OPUS, inputTokens, outputTokens);

      const parsed = parseScoutOutput(text);
      if (!parsed) continue;

      for (const finding of parsed.findings) {
        try {
          requireAllowedVertical(finding.verticalSlug);
        } catch {
          rejected++;
          continue;
        }
        const score = scoreOpportunity(finding.inputs);
        const action = recommendAction(score);
        const id = randomUUID();
        await getDb().insert(oppTable).values({
          id,
          runId,
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
    }

    await finishRun({ runId, status: "completed", costCents: cost, inputTokens: inTok, outputTokens: outTok });
    return { runId, opportunityIds: insertedIds, rejectedOutOfAllowlist: rejected };
  } catch (err) {
    captureException(err);
    await finishRun({
      runId,
      status: "failed",
      costCents: cost,
      inputTokens: inTok,
      outputTokens: outTok,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

const parseScoutOutput = (text: string): { findings: ScoutFinding[] } | null => {
  // The model is instructed to return pure JSON. We tolerate fenced blocks.
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
