// Voyager-inspired skill library, in source-code form (no vector index).
// Each skill is a markdown file with YAML frontmatter:
//
//   ---
//   id: <kebab-case>
//   when: <one-sentence trigger condition>
//   verticals: ["slug-1", "slug-2"]   # empty array = all
//   priority: 1..5                    # 5 = always include if applicable
//   ---
//   <prompt-snippet that gets inlined into SCOUT's user JSON>
//
// Skills are matched against a vertical slug at SCOUT call time. Operator
// edits, version-controls, reviews in PRs. No retrieval magic.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, "..", "fixtures", "skills");

export type Skill = {
  id: string;
  when: string;
  verticals: string[];
  priority: number;
  body: string;
  filename: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const parseFrontmatter = (raw: string, filename: string): Skill | null => {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return null;
  const fm = m[1] ?? "";
  const body = (m[2] ?? "").trim();
  const obj: Record<string, string | string[] | number> = {};
  for (const line of fm.split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const valRaw = (kv[2] ?? "").trim();
    if (valRaw.startsWith("[") && valRaw.endsWith("]")) {
      obj[key] = valRaw
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (/^\d+$/.test(valRaw)) {
      obj[key] = Number(valRaw);
    } else {
      obj[key] = valRaw.replace(/^['"]|['"]$/g, "");
    }
  }
  if (typeof obj["id"] !== "string" || typeof obj["when"] !== "string") return null;
  return {
    id: obj["id"],
    when: obj["when"],
    verticals: Array.isArray(obj["verticals"]) ? obj["verticals"] : [],
    priority: typeof obj["priority"] === "number" ? obj["priority"] : 3,
    body,
    filename,
  };
};

let _cache: Skill[] | null = null;

export const loadSkills = (): Skill[] => {
  if (_cache) return _cache;
  if (!existsSync(SKILLS_DIR)) {
    _cache = [];
    return _cache;
  }
  const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
  const skills: Skill[] = [];
  for (const f of files) {
    const raw = readFileSync(join(SKILLS_DIR, f), "utf8");
    const parsed = parseFrontmatter(raw, f);
    if (parsed) skills.push(parsed);
  }
  _cache = skills.sort((a, b) => b.priority - a.priority);
  return _cache;
};

export const skillsForVertical = (verticalSlug: string, max = 4): Skill[] =>
  loadSkills()
    .filter((s) => s.verticals.length === 0 || s.verticals.includes(verticalSlug))
    .slice(0, max);

export const renderSkills = (skills: Skill[]): string => {
  if (skills.length === 0) return "";
  return `Applicable research moves (priority-ordered):\n${skills
    .map((s) => `## skill: ${s.id}\nwhen: ${s.when}\n${s.body}`)
    .join("\n\n")}`;
};
