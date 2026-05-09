// Notion sync. One Notion database holds opportunities, one holds blockers.
// We write rather than read; Notion is a downstream mirror, not a source of truth.
import type { OpportunityRow } from "@autoresearcher/db";

type NotionResp = { id: string; url: string };

const apiBase = "https://api.notion.com/v1";

const headers = (): Record<string, string> => {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
};

export const isNotionEnabled = (): boolean =>
  !!process.env.NOTION_API_KEY && !!process.env.NOTION_OPPORTUNITIES_DB;

export const upsertOpportunityToNotion = async (opp: OpportunityRow): Promise<NotionResp | null> => {
  if (!isNotionEnabled()) return null;
  const dbId = process.env.NOTION_OPPORTUNITIES_DB;
  if (!dbId) return null;

  const body = {
    parent: { database_id: dbId },
    properties: {
      Title: { title: [{ text: { content: opp.title } }] },
      Vertical: { select: { name: opp.verticalSlug } },
      Status: { select: { name: opp.status } },
      Score: { number: opp.scoreTotal / 10 },
      Recommendation: { select: { name: opp.recommendedAction } },
      OpportunityID: { rich_text: [{ text: { content: opp.id } }] },
      Critic: opp.criticVerdict
        ? { select: { name: opp.criticVerdict } }
        : { select: null },
    },
    children: blocks(opp),
  };

  const res = await fetch(`${apiBase}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Notion upsert failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as NotionResp;
};

const blocks = (opp: OpportunityRow): Array<Record<string, unknown>> => [
  {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: "Thesis" } }] },
  },
  {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: opp.thesis } }] },
  },
  {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: "Evidence" } }] },
  },
  ...opp.evidence.map((e) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        { type: "text", text: { content: `${e.title} — `, link: null } },
        { type: "text", text: { content: e.url, link: { url: e.url } } },
        { type: "text", text: { content: ` — ${e.excerpt.slice(0, 240)}` } },
      ],
    },
  })),
  {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: "Critic notes" } }] },
  },
  {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: opp.criticNotes ?? "(pending)" } }],
    },
  },
];
