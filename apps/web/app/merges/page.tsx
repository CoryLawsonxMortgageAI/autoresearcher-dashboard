import { apiFetch } from "../../lib/api";
import { rel } from "../../lib/format";

type MergeRow = {
  id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  tier: "tier-1" | "tier-2" | "tier-3";
  status: string;
  cascadeGreen: boolean;
  criticVerdict: string | null;
  safetySummary: string | null;
  costCents: string;
  mergedAt: string | null;
  revertableUntil: string | null;
  createdAt: string;
};

export const dynamic = "force-dynamic";

export default async function MergesPage() {
  let items: MergeRow[] = [];
  let err: string | null = null;
  try {
    const r = await apiFetch<{ items: MergeRow[] }>("/api/merges");
    items = r.items;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div className="head">
        <h1>/merges</h1>
        <div className="meta">{items.length} prs · tap to merge tier-1/2 · tier-3 opens GitHub</div>
      </div>

      {err && <div className="card"><span className="tag red">api</span> {err}</div>}
      {items.length === 0 && !err && <div className="empty">no merges queued</div>}

      {items.map((m) => {
        const revertWindow = m.revertableUntil ? new Date(m.revertableUntil).getTime() - Date.now() : 0;
        const inRevertWindow = revertWindow > 0;
        return (
          <div key={m.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <span className={`tag ${m.tier === "tier-3" ? "red" : m.tier === "tier-2" ? "amber" : "green"}`}>{m.tier}</span>
                <span className="tag">{m.status}</span>
                <span style={{ marginLeft: 8 }}>#{m.prNumber} · {m.prTitle}</span>
              </div>
              <div style={{ color: "var(--fg-muted)" }}>{rel(m.createdAt)}</div>
            </div>
            <dl className="kvs">
              <dt>cascade</dt><dd>{m.cascadeGreen ? <span className="tag green">green</span> : <span className="tag red">not green</span>}</dd>
              <dt>critic</dt><dd>{m.criticVerdict ?? "pending"}</dd>
              <dt>cost</dt><dd>${(BigInt(m.costCents) / 100n).toString()}.{(BigInt(m.costCents) % 100n).toString().padStart(2, "0")}</dd>
              <dt>merged</dt><dd>{m.mergedAt ? rel(m.mergedAt) : "—"}</dd>
              <dt>revert</dt><dd>{inRevertWindow ? `${Math.round(revertWindow / 3600 / 1000)}h left` : "—"}</dd>
            </dl>
            {m.safetySummary && (
              <pre style={{ marginTop: 12, padding: 12, fontSize: 11, color: "var(--fg-dim)", whiteSpace: "pre-wrap" }}>
                {m.safetySummary}
              </pre>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <a href={m.prUrl} target="_blank" rel="noreferrer"><button>open in github</button></a>
              {m.tier !== "tier-3" && m.status === "ready-for-tap" && (
                <form action={`/api/merges/${m.prNumber}/tap`} method="post"><button className="primary">tap merge</button></form>
              )}
              {inRevertWindow && (
                <form action={`/api/merges/${m.prNumber}/revert`} method="post"><button className="danger">[revert]</button></form>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
