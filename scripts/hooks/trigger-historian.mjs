#!/usr/bin/env node
// PostToolUse: when a `gh pr create` command runs, drop a marker that the
// HISTORIAN can pick up to write a phase doc.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

if (payload?.tool !== "Bash") process.exit(0);
const cmd = payload?.params?.command ?? "";
if (!/\bgh\s+pr\s+create\b/.test(cmd)) process.exit(0);

mkdirSync(".tmp", { recursive: true });
writeFileSync(".tmp/historian-trigger.json", JSON.stringify({ at: new Date().toISOString(), cmd }, null, 2));
process.exit(0);
