import { apiFetch } from "../../../lib/api";
import { ts } from "../../../lib/format";
import { notFound } from "next/navigation";

type OpportunityDetail = {
  id: string;
  runId: string;
  verticalSlug: string;
  title: string;
  thesis: string;
  evidence: Array<{ url: string; title: string; excerpt: string; retrievedAt: string; weight: number }>;
  scoreFit: number;
  scoreEvidence: number;
  scoreMarket: number;
  scoreCompetitive: number;
  scoreFounder: number;
  scoreTotal: number;
  recommendedAction: string;
  status: string;
  greenlitByUserId: string | null;
  greenlitAt: string | null;
  criticVerdict: string | null;
  criticNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  let opp: OpportunityDetail | null = null;
  try {
    opp = await apiFetch<OpportunityDetail>(`/api/opportunities/${params.id}`);
  } catch {
    return notFound();
  }
  if (!opp) return notFound();

  return (
    <>
      <div className="head">
        <h1>/opportunities/{opp.id.slice(0, 8)}</h1>
        <div className="meta">
          <span className="tag">{opp.verticalSlug}</span>
          <span className="tag cyan">{opp.recommendedAction}</span>
          <span className="tag">{opp.status}</span>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 16, color: "var(--fg)", marginBottom: 8 }}>{opp.title}</div>
        <div style={{ color: "var(--fg-dim)" }}>{opp.thesis}</div>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
          score breakdown
        </div>
        <dl className="kvs">
          <dt>fit</dt><dd>{(opp.scoreFit / 10).toFixed(1)} / 10</dd>
          <dt>evidence</dt><dd>{(opp.scoreEvidence / 10).toFixed(1)} / 10</dd>
          <dt>market</dt><dd>{(opp.scoreMarket / 10).toFixed(1)} / 10</dd>
          <dt>competitive</dt><dd>{(opp.scoreCompetitive / 10).toFixed(1)} / 10</dd>
          <dt>founder edge</dt><dd>{(opp.scoreFounder / 10).toFixed(1)} / 10</dd>
          <dt style={{ color: "var(--green)" }}>total</dt>
          <dd style={{ color: "var(--green)" }}>{(opp.scoreTotal / 10).toFixed(1)} / 50</dd>
        </dl>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
          evidence ({opp.evidence.length})
        </div>
        {opp.evidence.map((e, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid var(--bg-2)" : "none", padding: "8px 0" }}>
            <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>
            <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
              w={e.weight.toFixed(2)} · retrieved {ts(e.retrievedAt)}
            </div>
            <div style={{ marginTop: 4, color: "var(--fg-dim)", fontSize: 12 }}>{e.excerpt}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
          critic
        </div>
        {opp.criticVerdict ? (
          <>
            <span className={`tag ${opp.criticVerdict === "approve" ? "green" : opp.criticVerdict === "reject" ? "red" : "amber"}`}>
              {opp.criticVerdict}
            </span>
            <div style={{ marginTop: 8, color: "var(--fg-dim)" }}>{opp.criticNotes ?? ""}</div>
          </>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>not yet reviewed</span>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
          ops
        </div>
        <dl className="kvs">
          <dt>run</dt><dd><code>{opp.runId}</code></dd>
          <dt>created</dt><dd>{ts(opp.createdAt)}</dd>
          <dt>updated</dt><dd>{ts(opp.updatedAt)}</dd>
          <dt>greenlit</dt><dd>{opp.greenlitAt ? `${ts(opp.greenlitAt)} by ${opp.greenlitByUserId?.slice(0, 8) ?? "?"}` : "—"}</dd>
        </dl>
      </div>
    </>
  );
}
