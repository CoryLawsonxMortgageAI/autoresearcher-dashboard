import { apiFetch } from "../../lib/api";
import { ts } from "../../lib/format";

type EvalRun = {
  id: string;
  phase: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  meta: Record<string, unknown>;
};

export const dynamic = "force-dynamic";

export default async function EvalsPage() {
  let latest: Record<string, EvalRun | null> = {};
  let err: string | null = null;
  try {
    latest = await apiFetch<Record<string, EvalRun | null>>("/api/evals/latest");
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  const tiers = [
    { key: "eval-tier-a", label: "tier A · golden" },
    { key: "eval-tier-b", label: "tier B · regression" },
    { key: "eval-tier-c", label: "tier C · stress" },
  ] as const;

  return (
    <>
      <div className="head">
        <h1>/evals</h1>
        <div className="meta">latest run per tier</div>
      </div>
      {err && <div className="card"><span className="tag red">api</span> {err}</div>}
      {tiers.map((t) => {
        const r = latest[t.key];
        const score = r?.meta?.score;
        return (
          <div key={t.key} className="card">
            <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 6 }}>
              {t.label}
            </div>
            {r ? (
              <dl className="kvs">
                <dt>score</dt><dd style={{ color: "var(--green)" }}>{typeof score === "number" ? score.toFixed(2) : "—"}</dd>
                <dt>status</dt><dd>{r.status}</dd>
                <dt>finished</dt><dd>{ts(r.finishedAt)}</dd>
                <dt>run</dt><dd><code>{r.id}</code></dd>
              </dl>
            ) : (
              <div style={{ color: "var(--fg-muted)" }}>no runs yet</div>
            )}
          </div>
        );
      })}
    </>
  );
}
