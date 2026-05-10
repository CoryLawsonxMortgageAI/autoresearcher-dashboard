import { apiFetch, isDbUnavailableError } from "../../lib/api";
import { rel } from "../../lib/format";
import { DemoBanner } from "../../components/DemoBanner";

type EventRow = {
  id: string;
  type: string;
  channel: string;
  payload: Record<string, unknown>;
  publishedAt: string;
  runId: string | null;
};

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  let items: EventRow[] = [];
  let err: string | null = null;
  let demo = false;
  try {
    const res = await apiFetch<{ items: EventRow[] }>("/api/activity?limit=200");
    items = res.items;
  } catch (e) {
    if (isDbUnavailableError(e)) demo = true;
    else err = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div className="head">
        <h1>/activity</h1>
        <div className="meta">{demo ? "demo mode · no events" : `${items.length} events · live`}</div>
      </div>
      {demo && <DemoBanner kind="no-db" />}
      {err && <div className="card"><span className="tag red">api</span> {err}</div>}
      <div className="feed">
        {items.length === 0 && !err && <div className="empty">no activity yet</div>}
        {items.map((e) => {
          const line = summarise(e);
          return (
            <div key={e.id} className="feed-item">
              <span className="t">{rel(e.publishedAt)}</span>
              <span className="type">{e.type}</span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const summarise = (e: EventRow): string => {
  const p = e.payload;
  if (typeof p["title"] === "string") return String(p["title"]);
  if (typeof p["filename"] === "string") return String(p["filename"]);
  if (typeof p["phase"] === "string") return `phase ${String(p["phase"])}`;
  if (typeof p["prNumber"] === "number") return `pr #${p["prNumber"]}`;
  return e.channel;
};
