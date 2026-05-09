// CRITIC — adversarial review of an opportunity OR a merge.
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, opportunities as oppTable } from "@autoresearcher/db";
import { callClaude, costCents, MODEL_OPUS } from "../lib/llm.js";
import { CRITIC_SYSTEM } from "@autoresearcher/skill";
import { startRun, finishRun } from "../lib/run-tracker.js";
import { captureException } from "../lib/sentry.js";
import { writeReflection } from "../lib/reflections.js";
import { append as appendTrajectory } from "../lib/trajectory.js";

const CriticOutput = z.object({
  verdict: z.enum(["approve", "reject", "needs-revision"]),
  notes: z.string().min(20),
  topRiskOneLine: z.string().min(5),
  evidenceVerified: z.boolean(),
  allowlistDrift: z.boolean(),
});
export type CriticOutput = z.infer<typeof CriticOutput>;

export const reviewOpportunity = async (opportunityId: string): Promise<CriticOutput> => {
  const runId = await startRun({ phase: "ad-hoc", meta: { kind: "critic-opportunity", opportunityId } });
  let cost = 0n; let inT = 0n; let outT = 0n;
  try {
    const db = getDb();
    const opp = await db.query.opportunities.findFirst({ where: eq(oppTable.id, opportunityId) });
    if (!opp) throw new Error(`opportunity ${opportunityId} not found`);

    const t0 = Date.now();
    const userJson = {
      opportunity: {
        id: opp.id,
        verticalSlug: opp.verticalSlug,
        title: opp.title,
        thesis: opp.thesis,
        evidence: opp.evidence,
        scoreTotal: opp.scoreTotal,
        recommendedAction: opp.recommendedAction,
      },
    };
    const r = await callClaude({
      model: MODEL_OPUS,
      system: CRITIC_SYSTEM,
      userJson,
    });
    inT = BigInt(r.inputTokens); outT = BigInt(r.outputTokens);
    cost = costCents(MODEL_OPUS, r.inputTokens, r.outputTokens);

    appendTrajectory(runId, {
      kind: "llm",
      model: MODEL_OPUS,
      system: "CRITIC_SYSTEM",
      userJson,
      outputText: r.text.slice(0, 8000),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheCreationInputTokens: r.cacheCreationInputTokens,
      cacheReadInputTokens: r.cacheReadInputTokens,
      costCents: cost.toString(),
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    });

    const verdict = parseVerdict(r.text);
    await db
      .update(oppTable)
      .set({ criticVerdict: verdict.verdict, criticNotes: verdict.notes })
      .where(eq(oppTable.id, opportunityId));

    appendTrajectory(runId, {
      kind: "verdict",
      verdict: verdict.verdict,
      notes: verdict.notes.slice(0, 1000),
      at: new Date().toISOString(),
    });

    // Reflexion: a one-line note about what this review found, scoped to the
    // vertical so the next SCOUT cycle for THIS vertical sees the lesson.
    await writeReflection({
      runId,
      agent: "critic",
      verticalSlug: opp.verticalSlug,
      body: `[${verdict.verdict}] ${opp.title.slice(0, 80)}: ${verdict.topRiskOneLine}`.slice(0, 500),
      metrics: {
        evidenceVerified: verdict.evidenceVerified ? 1 : 0,
        allowlistDrift: verdict.allowlistDrift ? 1 : 0,
        verdictApprove: verdict.verdict === "approve" ? 1 : 0,
      },
    }).catch(() => {/* db unavailable; reflection is best-effort */});

    await finishRun({ runId, status: "completed", costCents: cost, inputTokens: inT, outputTokens: outT });
    return verdict;
  } catch (err) {
    captureException(err);
    await finishRun({
      runId, status: "failed", costCents: cost, inputTokens: inT, outputTokens: outT,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

export type MergeSafetyArgs = {
  prNumber: number;
  prTitle: string;
  diffSummary: string;
  affectedPaths: string[];
  evalDelta?: string;
};

export const mergeSafetySummary = async (args: MergeSafetyArgs): Promise<{
  text: string;
  verdict: "approve" | "reject" | "needs-revision";
  costCents: bigint;
}> => {
  const runId = await startRun({ phase: "ad-hoc", meta: { kind: "critic-merge", pr: args.prNumber } });
  let cost = 0n; let inT = 0n; let outT = 0n;
  try {
    const { text, inputTokens, outputTokens } = await callClaude({
      model: MODEL_OPUS,
      system:
        CRITIC_SYSTEM +
        "\n\nFor merges, additionally produce: (a) what changed, (b) what could break, " +
        "(c) what rollback looks like. End with a single line `verdict: approve|reject|needs-revision`.",
      userJson: args,
    });
    inT = BigInt(inputTokens); outT = BigInt(outputTokens);
    cost = costCents(MODEL_OPUS, inputTokens, outputTokens);
    const verdictLine = text.match(/verdict:\s*(approve|reject|needs-revision)/i);
    const verdict = (verdictLine?.[1]?.toLowerCase() ?? "needs-revision") as
      | "approve" | "reject" | "needs-revision";
    await finishRun({ runId, status: "completed", costCents: cost, inputTokens: inT, outputTokens: outT });
    return { text, verdict, costCents: cost };
  } catch (err) {
    captureException(err);
    await finishRun({
      runId, status: "failed", costCents: cost, inputTokens: inT, outputTokens: outT,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
};

const parseVerdict = (text: string): CriticOutput => {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const obj: unknown = JSON.parse(cleaned);
    return CriticOutput.parse(obj);
  } catch {
    // The model is permitted to return prose in this path; fall back conservative.
    return {
      verdict: "needs-revision",
      notes: text.slice(0, 1000),
      topRiskOneLine: "unparseable critic output; defaulting to needs-revision",
      evidenceVerified: false,
      allowlistDrift: false,
    };
  }
};
