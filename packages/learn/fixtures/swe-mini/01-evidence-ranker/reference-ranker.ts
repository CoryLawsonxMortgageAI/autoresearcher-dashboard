import type { Evidence, RankInput, SolveSig } from "./types.js";

const hostname = (url: string): string => {
  try { return new URL(url).hostname; } catch { return url; }
};

export const solve: SolveSig = (input: RankInput): Evidence[] => {
  const filtered = input.evidence.filter(
    (e) => e.weight >= 0.2 && e.excerpt.trim().length >= 20
  );

  // Keep highest-weight per hostname.
  const byHost = new Map<string, Evidence>();
  for (const e of filtered) {
    const h = hostname(e.url);
    const cur = byHost.get(h);
    if (!cur || e.weight > cur.weight) byHost.set(h, e);
  }

  return [...byHost.values()]
    .sort((a, b) => (b.weight - a.weight) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .slice(0, Math.max(0, input.maxResults));
};
