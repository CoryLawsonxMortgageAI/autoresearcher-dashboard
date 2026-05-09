import type { ScoreBreakdown, RecommendedAction } from "@autoresearcher/shared";

// Five-axis scoring, each 0-10, total 0-50. Karpathy-style: dead simple,
// readable, hackable. No "AI" magic in the scorer — that's the SCOUT's job.
// The scorer turns SCOUT's structured findings into a deterministic number.

export type ScoreInputs = {
  evidenceCount: number;
  domainAuthorityAvg: number; // 0-100, derived from URL TLD heuristics or upstream signal
  hasNamedBuyer: boolean;
  marketHints: { ttlMillions: number; growth: number };
  competitiveCount: number; // known competitors
  founderEdgeNotes: string[]; // each entry adds up to +1.5 capped
};

export const scoreOpportunity = (i: ScoreInputs): ScoreBreakdown => {
  const fit = clamp10(2 + (i.hasNamedBuyer ? 5 : 0) + Math.min(3, i.evidenceCount));
  const evidenceQuality = clamp10(i.domainAuthorityAvg / 10);
  const marketSize = clamp10(Math.log10(Math.max(1, i.marketHints.ttlMillions)) * 2 + i.marketHints.growth * 0.2);
  const competitiveDensity = clamp10(10 - Math.min(10, i.competitiveCount));
  const founderEdge = clamp10(i.founderEdgeNotes.slice(0, 4).reduce((a) => a + 1.5, 4));
  const total = fit + evidenceQuality + marketSize + competitiveDensity + founderEdge;
  return { fit, evidenceQuality, marketSize, competitiveDensity, founderEdge, total };
};

const clamp10 = (n: number): number => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

export const recommendAction = (s: ScoreBreakdown): RecommendedAction => {
  if (s.total >= 38) return "build-prototype";
  if (s.total >= 30) return "interview-3-buyers";
  if (s.total >= 22) return "deep-dive";
  if (s.total >= 14) return "watch";
  return "skip";
};
