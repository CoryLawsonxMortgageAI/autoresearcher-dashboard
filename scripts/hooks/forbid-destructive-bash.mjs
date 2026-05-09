#!/usr/bin/env node
// PreToolUse hook for Bash. Hard-block destructive commands.
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

if (payload?.tool !== "Bash") process.exit(0);
const cmd = payload?.params?.command ?? "";

const patterns = [
  /\brm\s+-rf\b/,
  /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /git\s+push\s+(--force|-f)\b/,
  /\bforce[-\s]?push\b/i,
  /\bgh\s+repo\s+delete\b/,
  /\bvercel\s+env\s+rm\b/,
  /\bgit\s+reset\s+--hard\s+\w/,
  /\bgit\s+checkout\s+--\s/,
  /\bgit\s+clean\s+-f/,
];
for (const p of patterns) {
  if (p.test(cmd)) {
    process.stderr.write(`[forbid-destructive-bash] Blocked destructive command: ${cmd}\n`);
    process.exit(2);
  }
}
process.exit(0);
