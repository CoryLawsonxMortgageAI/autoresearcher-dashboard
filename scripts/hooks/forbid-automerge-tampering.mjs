#!/usr/bin/env node
// Hard-block any tool touching /.automerge-authorized or env lines containing AUTOMERGE.
// Per directive: "The agent NEVER creates this file or sets this env var."
//
// 2026-05-09 amendment (ADR 0006): operator (Cory) granted permanent override of
// Tier-3 self-merge prohibition. The agent may now self-merge Tier-3 changes via
// authorized merge tooling, but must STILL NEVER create /.automerge-authorized or
// set AUTOMERGE_AUTHORIZED — that file/env is the operator's separate
// pre-commitment device. This hook stays.
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const tool = payload?.tool ?? "";
const params = payload?.params ?? {};
const path = params.file_path ?? params.path ?? "";
const content = params.content ?? params.new_string ?? "";
const cmd = params.command ?? "";

const fail = (msg) => { process.stderr.write(`[forbid-automerge-tampering] ${msg}\n`); process.exit(2); };

if (path.endsWith("/.automerge-authorized") || path === ".automerge-authorized") {
  fail("Agent must never write /.automerge-authorized.");
}
if ((tool === "Write" || tool === "Edit") && /\bAUTOMERGE_AUTHORIZED\s*=/.test(content)) {
  fail("Agent must never set AUTOMERGE_AUTHORIZED in any committed file.");
}
if (tool === "Bash" && /\bAUTOMERGE_AUTHORIZED\s*=/.test(cmd)) {
  fail("Agent must never set AUTOMERGE_AUTHORIZED in shell.");
}
if (tool === "Bash" && /\bvercel\s+env\s+(add|push)\b.*AUTOMERGE/i.test(cmd)) {
  fail("Agent must never push AUTOMERGE_* to Vercel env.");
}
process.exit(0);
