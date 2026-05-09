type Evidence = { url: string; title: string; excerpt: string; weight: number };

export const solve = (evidence: Evidence[]): { ok: boolean; reason: string } => {
  if (evidence.length < 2) return { ok: false, reason: "need >= 2 evidence entries" };
  const domains = new Set<string>();
  for (const e of evidence) {
    if (e.weight < 0 || e.weight > 1) return { ok: false, reason: `weight out of [0,1]: ${e.weight}` };
    if (e.excerpt.trim().length < 20) return { ok: false, reason: `excerpt too short for ${e.url}` };
    try {
      domains.add(new URL(e.url).hostname);
    } catch {
      return { ok: false, reason: `invalid url: ${e.url}` };
    }
  }
  if (domains.size < 2) return { ok: false, reason: "need >= 2 distinct domains" };
  return { ok: true, reason: "ok" };
};
