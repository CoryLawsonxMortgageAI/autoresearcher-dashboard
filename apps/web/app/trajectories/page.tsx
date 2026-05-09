import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { rel } from "../../lib/format";

type TrajectoryFile = { runId: string; sizeBytes: number; modifiedAt: string };

export const dynamic = "force-dynamic";

export default async function TrajectoriesPage() {
  let items: TrajectoryFile[] = [];
  let err: string | null = null;
  try {
    const r = await apiFetch<{ items: TrajectoryFile[] }>("/api/trajectories");
    items = r.items;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  return (
    <>
      <div className="head">
        <h1>/trajectories</h1>
        <div className="meta">{items.length} runs · jsonl per run · 200 most recent</div>
      </div>
      {err && <div className="card"><span className="tag red">api</span> {err}</div>}
      {items.length === 0 && !err && (
        <div className="empty">no trajectories on disk yet — they appear after the first agent run</div>
      )}
      <div className="row head-row">
        <span>run id</span>
        <span></span>
        <span>size</span>
        <span></span>
        <span></span>
        <span>modified</span>
      </div>
      {items.map((t) => (
        <Link key={t.runId} href={`/trajectories/${t.runId}`} style={{ color: "inherit", display: "block" }}>
          <div className="row">
            <span style={{ color: "var(--cyan)" }}>{t.runId.slice(0, 12)}</span>
            <span></span>
            <span style={{ color: "var(--fg-dim)" }}>{(t.sizeBytes / 1024).toFixed(1)} KB</span>
            <span></span>
            <span></span>
            <span style={{ color: "var(--fg-muted)" }}>{rel(t.modifiedAt)}</span>
          </div>
        </Link>
      ))}
    </>
  );
}
