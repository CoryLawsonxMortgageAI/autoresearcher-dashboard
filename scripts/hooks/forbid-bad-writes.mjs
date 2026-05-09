#!/usr/bin/env node
// PreToolUse hook for Write/Edit. Reject:
//   * `: any` and `<any>` casts (TS) and `Any` python type when imported from typing
//   * money-as-number (variables matching /price|cost|amount|usd|fee|revenue/i typed number)
//   * TODO outside /scratch/
//   * any .env* file except .env.example
//
// Reads the tool call payload from stdin as JSON: { tool, params }.
// Exit 0 = allow, exit non-zero with stderr message = block.
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const tool = payload?.tool ?? "";
const params = payload?.params ?? {};
if (tool !== "Write" && tool !== "Edit") process.exit(0);

const path = params.file_path ?? params.path ?? "";
const content = params.content ?? params.new_string ?? "";

const fail = (msg) => { process.stderr.write(`[forbid-bad-writes] ${msg}\n`); process.exit(2); };

const envName = path.split("/").pop() ?? "";
if (/^\.env(\.|$)/.test(envName) && envName !== ".env.example") {
  fail(`Refusing to write env file ${path}. Only .env.example is allowed in-tree.`);
}

if (/\/scratch\//.test(path)) process.exit(0);

if (/[^A-Za-z]TODO[: ]/.test(content)) {
  fail(`TODO found in ${path}. Move to /scratch/ or finish the work.`);
}

if (/\.tsx?$/.test(path)) {
  if (/:\s*any(\s|,|\)|;|>|=|$)/m.test(content) || /<any>/.test(content) || /\bas\s+any\b/.test(content)) {
    fail(`\`any\` is forbidden in ${path}. Use \`unknown\` or a proper type.`);
  }
  const moneyVar = /\b(price|cost|amount|usd|fee|revenue|balance)\w*\s*:\s*number\b/i;
  if (moneyVar.test(content)) {
    fail(`Money typed as number in ${path}. Use bigint cents or a Money type.`);
  }
}

process.exit(0);
