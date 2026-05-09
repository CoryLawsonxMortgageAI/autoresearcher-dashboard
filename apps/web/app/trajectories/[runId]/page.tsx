import { apiFetch } from "../../../lib/api";
import { ts } from "../../../lib/format";
import { notFound } from "next/navigation";

type Step =
  | { kind: "llm"; model: string; system: string; userJson: unknown; outputText: string;
      inputTokens: number; outputTokens: number; costCents: string; ms: number; at: string }
  | { kind: "tool"; name: string; input: unknown; output: unknown; ms: number; at: string }
  | { kind: "note"; text: string; at: string }
  | { kind: "verdict"; verdict: string; notes: string; at: string }
  | { kind: "parse-error"; raw: string };

export const dynamic = "force-dynamic";

export default async function TrajectoryPage({ params }: { params: { runId: string } }) {
  let resp: { runId: string; steps: Step[] } | null = null;
  try {
    resp = await apiFetch<{ runId: string; steps: Step[] }>(`/api/trajectories/${params.runId}`);
  } catch {
    return notFound();
  }
  if (!resp) return notFound();

  const llmSteps = resp.steps.filter((s): s is Extract<Step, { kind: "llm" }> => s.kind === "llm");
  const totalCost = llmSteps.reduce((acc, s) => acc + BigInt(s.costCents || "0"), 0n);
  const totalIn = llmSteps.reduce((acc, s) => acc + s.inputTokens, 0);
  const totalOut = llmSteps.reduce((acc, s) => acc + s.outputTokens, 0);
  const totalMs = llmSteps.reduce((acc, s) => acc + s.ms, 0);

  return (
    <>
      <div className="head">
        <h1>/trajectories/{resp.runId.slice(0, 12)}</h1>
        <div className="meta">
          {resp.steps.length} steps · {llmSteps.length} llm · {totalIn} in · {totalOut} out · ${(Number(totalCost) / 100).toFixed(2)} · {totalMs}ms
        </div>
      </div>

      {resp.steps.map((s, i) => (
        <div key={i} className="card">
          <div style={{ fontSize: 11, color: "var(--fg-muted)", letterSpacing: "0.05em", marginBottom: 6 }}>
            {"at" in s ? ts(s.at) : "—"} · <span className="tag">{s.kind}</span>
          </div>
          {s.kind === "llm" && (
            <>
              <div style={{ fontSize: 11, color: "var(--fg-dim)" }}>
                model <code>{s.model}</code> · system <code>{s.system}</code> · {s.inputTokens} in · {s.outputTokens} out · {s.ms}ms
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--fg-muted)" }}>user json</summary>
                <pre style={{ fontSize: 11, color: "var(--fg-dim)", overflowX: "auto", padding: 8 }}>
                  {JSON.stringify(s.userJson, null, 2)}
                </pre>
              </details>
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--fg-muted)" }}>output ({s.outputText.length} chars)</summary>
                <pre style={{ fontSize: 11, color: "var(--fg)", whiteSpace: "pre-wrap", padding: 8 }}>{s.outputText}</pre>
              </details>
            </>
          )}
          {s.kind === "tool" && (
            <>
              <div><code>{s.name}</code> · {s.ms}ms</div>
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--fg-muted)" }}>input</summary>
                <pre style={{ fontSize: 11, color: "var(--fg-dim)", padding: 8 }}>{JSON.stringify(s.input, null, 2)}</pre>
              </details>
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--fg-muted)" }}>output</summary>
                <pre style={{ fontSize: 11, color: "var(--fg-dim)", padding: 8 }}>{JSON.stringify(s.output, null, 2)}</pre>
              </details>
            </>
          )}
          {s.kind === "verdict" && (
            <>
              <span className={`tag ${s.verdict === "approve" ? "green" : s.verdict === "reject" ? "red" : "amber"}`}>{s.verdict}</span>
              <div style={{ marginTop: 6, color: "var(--fg-dim)" }}>{s.notes}</div>
            </>
          )}
          {s.kind === "note" && <div>{s.text}</div>}
          {s.kind === "parse-error" && <div style={{ color: "var(--red)" }}>parse error: {s.raw}</div>}
        </div>
      ))}
    </>
  );
}
