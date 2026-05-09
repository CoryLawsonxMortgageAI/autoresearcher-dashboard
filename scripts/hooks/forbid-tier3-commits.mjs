#!/usr/bin/env node
// Hard-block writes to Tier-3 paths unless AUTOMERGE_AUTHORIZED=true is set.
// Tier-3: auth/, destructive migrations, .github/workflows/, vercel.json, /legal/**.
// On block: also writes a BLOCKER marker file so the operator sees it on next session.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const tool = payload?.tool ?? "";
const params = payload?.params ?? {};
const path = params.file_path ?? params.path ?? "";
const cmd = params.command ?? "";

const tier3 = (p) =>
  /^auth\//.test(p) ||
  /^\.github\/workflows\//.test(p) ||
  p === "vercel.json" ||
  /^legal\//.test(p) ||
  /\/migrations\/.+\.(down|destructive)\./.test(p);

const targets = [];
if (tool === "Write" || tool === "Edit") {
  if (path) targets.push(path);
} else if (tool === "Bash") {
  // Heuristic: catch obvious shell writes to tier-3 paths.
  const m = cmd.match(/(?:>|tee\s+|cat\s*>|cp\s+\S+\s+|mv\s+\S+\s+)\s*([\w./-]+)/);
  if (m) targets.push(m[1]);
}

const offenders = targets.filter(tier3);
if (offenders.length === 0) process.exit(0);

if (process.env.AUTOMERGE_AUTHORIZED === "true") {
  process.stderr.write(`[forbid-tier3-commits] AUTOMERGE_AUTHORIZED=true; allowing Tier-3 write to ${offenders.join(", ")}.\n`);
  process.exit(0);
}

const ts = new Date().toISOString().slice(0, 10);
const blocker = `BLOCKER-tier3-${ts}.md`;
try {
  mkdirSync(dirname(blocker) || ".", { recursive: true });
  writeFileSync(
    blocker,
    `<!-- BLOCKER-OPEN -->\n# BLOCKER tier-3 ${ts}\n\nAgent attempted to write Tier-3 path(s):\n${offenders.map(o => `- ${o}`).join("\n")}\n\nAUTOMERGE_AUTHORIZED is not set. Resolve manually.\n`,
    { flag: "wx" }
  );
} catch {/* file already exists; fine */}
process.stderr.write(`[forbid-tier3-commits] Blocked Tier-3 write to ${offenders.join(", ")}. BLOCKER filed.\n`);
process.exit(2);
