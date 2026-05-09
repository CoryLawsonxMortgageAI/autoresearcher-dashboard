type Axes = { fit: number; evidence: number; market: number; competitive: number; founder: number };
type Out = Axes & { total: number };

const clamp = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  const bounded = Math.max(0, Math.min(10, n));
  return Math.round(bounded * 10) / 10;
};

export const solve = (axes: Axes): Out => {
  const fit = clamp(axes.fit);
  const evidence = clamp(axes.evidence);
  const market = clamp(axes.market);
  const competitive = clamp(axes.competitive);
  const founder = clamp(axes.founder);
  return { fit, evidence, market, competitive, founder, total: fit + evidence + market + competitive + founder };
};
