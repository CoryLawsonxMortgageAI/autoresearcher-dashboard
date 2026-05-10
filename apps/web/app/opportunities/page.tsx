import Link from "next/link";
import { apiFetch, isDbUnavailableError } from "../../lib/api";
import { rel } from "../../lib/format";
import { DemoBanner } from "../../components/DemoBanner";

type OppRow = {
  id: string;
  verticalSlug: string;
  title: string;
  scoreTotal: number; // already divided by 10 by the API
  recommendedAction: string;
  status: string;
  criticVerdict: string | null;
  createdAt: string;
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: { status?: string; minScore?: string };
}) {
  const qs = new URLSearchParams();
  if (searchParams.status) qs.set("status", searchParams.status);
  if (searchParams.minScore) qs.set("minScore", searchParams.minScore);
  let items: OppRow[] = [];
  let err: string | null = null;
  let demo = false;
  try {
    const r = await apiFetch<{ items: OppRow[] }>(`/api/opportunities?${qs.toString()}`);
    items = r.items;
  } catch (e) {
    if (isDbUnavailableError(e)) demo = true;
    else err = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div className="head">
        <h1>/opportunities</h1>
        <div className="meta">{items.length} listed · status: {searchParams.status ?? "any"}</div>
      </div>

      <div style={{ marginBottom: 12, fontSize: 11, color: "var(--fg-muted)" }}>
        {(["inbox", "reviewing", "greenlit", "rejected", "stale"] as const).map((s) => (
          <Link key={s} href={`/opportunities?status=${s}`} style={{ marginRight: 12 }}>
            {s}
          </Link>
        ))}
        <Link href="/opportunities">all</Link>
      </div>

      {demo && <DemoBanner kind="no-db" />}
      {err && <div className="card"><span className="tag red">api</span> {err}</div>}

      <div className="row head-row">
        <span>vertical</span>
        <span>title</span>
        <span>action</span>
        <span>critic</span>
        <span style={{ textAlign: "right" }}>score</span>
        <span>added</span>
      </div>

      {items.length === 0 && !err && <div className="empty">empty inbox</div>}

      {items.map((o) => (
        <Link
          key={o.id}
          href={`/opportunities/${o.id}`}
          style={{ color: "inherit", display: "block" }}
        >
          <div className="row">
            <span className="vert">{o.verticalSlug}</span>
            <span className="title">{o.title}</span>
            <span><span className="tag cyan">{o.recommendedAction}</span></span>
            <span>{verdictTag(o.criticVerdict)}</span>
            <span className="score">{o.scoreTotal.toFixed(1)}</span>
            <span className="t" style={{ color: "var(--fg-muted)" }}>{rel(o.createdAt)}</span>
          </div>
        </Link>
      ))}
    </>
  );
}

const verdictTag = (v: string | null): React.JSX.Element => {
  if (v === "approve") return <span className="tag green">approve</span>;
  if (v === "reject") return <span className="tag red">reject</span>;
  if (v === "needs-revision") return <span className="tag amber">needs-rev</span>;
  return <span className="tag">pending</span>;
};
