import { apiFetch } from "../../lib/api";
import { ts } from "../../lib/format";

type Bank = {
  version: string;
  generatedAt: string;
  windowDays: number;
  examples: Array<{
    outcome: "greenlit" | "rejected";
    verticalSlug: string;
    title: string;
    thesis: string;
    whyOutcome: string;
  }>;
  metrics: { greenlitCount: number; rejectedCount: number; greenlightRate: number };
};

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let bank: Bank | null = null;
  let versions: string[] = [];
  let err: string | null = null;
  try {
    bank = await apiFetch<Bank>("/api/learn/bank");
    const v = await apiFetch<{ versions: string[] }>("/api/learn/bank/versions");
    versions = v.versions;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div className="head">
        <h1>/learn</h1>
        <div className="meta">in-context learning · few-shot bank · coding bench</div>
      </div>

      {err && <div className="card"><span className="tag red">api</span> {err}</div>}

      {bank && (
        <>
          <div className="card">
            <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
              latest prompt bank
            </div>
            <dl className="kvs">
              <dt>version</dt><dd><code>{bank.version}</code></dd>
              <dt>generated</dt><dd>{ts(bank.generatedAt)}</dd>
              <dt>window</dt><dd>{bank.windowDays}d</dd>
              <dt>greenlit</dt><dd style={{ color: "var(--green)" }}>{bank.metrics.greenlitCount}</dd>
              <dt>rejected</dt><dd style={{ color: "var(--red)" }}>{bank.metrics.rejectedCount}</dd>
              <dt>rate</dt><dd>{(bank.metrics.greenlightRate * 100).toFixed(0)}%</dd>
              <dt>examples</dt><dd>{bank.examples.length}</dd>
            </dl>
          </div>

          <div className="card">
            <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
              versions
            </div>
            <div style={{ fontSize: 12 }}>
              {versions.map((v) => (
                <span key={v} className="tag" style={{ marginRight: 6 }}>{v.replace(/\.json$/, "")}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>
              examples (top {bank.examples.length})
            </div>
            {bank.examples.length === 0 && <div className="empty">no decisions distilled yet — run `pnpm distill`</div>}
            {bank.examples.map((ex, i) => (
              <div key={i} style={{ borderTop: i ? "1px solid var(--bg-2)" : "none", padding: "8px 0" }}>
                <span className={`tag ${ex.outcome === "greenlit" ? "green" : "red"}`}>{ex.outcome}</span>
                <span className="tag">{ex.verticalSlug}</span>
                <div style={{ marginTop: 6, color: "var(--fg)" }}>{ex.title}</div>
                <div style={{ marginTop: 4, color: "var(--fg-dim)", fontSize: 12 }}>{ex.thesis}</div>
                <div style={{ marginTop: 6, color: "var(--fg-muted)", fontSize: 11 }}>
                  why: {ex.whyOutcome}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
