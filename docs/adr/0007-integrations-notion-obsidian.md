# ADR 0007 — Notion + Obsidian as downstream mirrors

Status: Adopted (per operator request 2026-05-09: "Now I use Notion and obsidian")

## Decision

Opportunities flow into Notion and Obsidian as **downstream mirrors**, not
sources of truth. The MySQL `opportunities` table is the source of truth.

| Tool      | Direction       | Trigger                                                  | Failure mode         |
|-----------|-----------------|----------------------------------------------------------|----------------------|
| Notion    | api -> notion   | On opportunity greenlight                                | Silent skip if no API key |
| Obsidian  | api -> filesystem | On opportunity greenlight                              | Silent skip if no vault path |

## Why downstream-only

- Notion API rate limits and downtime would corrupt the opportunity flow if
  Notion were the source of truth.
- Obsidian has no API; it's filesystem. Two-way sync requires a watcher with
  conflict resolution. Out of scope.
- Operator workflow: review in dashboard, take notes in Obsidian, share
  greenlit decisions in Notion. The dashboard is the interactive surface;
  Notion and Obsidian are the long-term-memory surfaces.

## Implementation

- `services/api/src/integrations/notion.ts` — REST POST to Notion's pages API
  with a database parent. One page per opportunity. Title, vertical, status,
  score, recommendation, critic verdict are properties. Thesis, evidence
  list, and critic notes are children blocks.
- `services/api/src/integrations/obsidian.ts` — Writes
  `${OBSIDIAN_VAULT_PATH}/Autoresearcher/Opportunities/${slug}/${id8} ${title}.md`
  with YAML frontmatter Obsidian recognises (id, vertical, status, score,
  recommendation, critic, created, tags).

Both are best-effort. They run inside `Promise.allSettled` so one failure
doesn't block the other or the greenlight itself. The dashboard remains
the operational surface; this is a notebook layer.

## Future

If the operator wants two-way (e.g., greenlight from Notion check-box), we
add a Notion webhook + signed verification + an idempotency key keyed on
opportunity id. Out of scope for v1.0.
