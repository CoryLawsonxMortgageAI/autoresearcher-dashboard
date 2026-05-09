// Obsidian export. Writes one markdown file per opportunity into the
// configured vault path with YAML frontmatter Obsidian recognises.
//
// Obsidian has no API — it's filesystem. We write to OBSIDIAN_VAULT_PATH and
// rely on Obsidian Sync / iCloud / git for distribution.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { OpportunityRow } from "@autoresearcher/db";

export const isObsidianEnabled = (): boolean => !!process.env.OBSIDIAN_VAULT_PATH;

export const writeOpportunityToVault = (opp: OpportunityRow): { path: string } | null => {
  const root = process.env.OBSIDIAN_VAULT_PATH;
  if (!root) return null;
  const subdir = process.env.OBSIDIAN_OPPORTUNITIES_DIR ?? "Autoresearcher/Opportunities";
  const fullDir = join(root, subdir, opp.verticalSlug);
  if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

  const safeTitle = opp.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  const path = join(fullDir, `${opp.id.slice(0, 8)} ${safeTitle}.md`);

  const fm = [
    "---",
    `id: ${opp.id}`,
    `vertical: ${opp.verticalSlug}`,
    `status: ${opp.status}`,
    `score: ${opp.scoreTotal / 10}`,
    `recommendation: ${opp.recommendedAction}`,
    `critic: ${opp.criticVerdict ?? "pending"}`,
    `created: ${opp.createdAt.toISOString()}`,
    `tags:`,
    `  - autoresearcher`,
    `  - ${opp.verticalSlug}`,
    `  - ${opp.recommendedAction}`,
    "---",
    "",
  ].join("\n");

  const evidence = opp.evidence
    .map((e) => `- [${e.title}](${e.url}) — ${e.excerpt.slice(0, 240)}`)
    .join("\n");

  const md = `${fm}# ${opp.title}\n\n## Thesis\n\n${opp.thesis}\n\n## Evidence\n\n${evidence}\n\n## Critic notes\n\n${opp.criticNotes ?? "_(pending)_"}\n`;
  writeFileSync(path, md);
  return { path };
};
