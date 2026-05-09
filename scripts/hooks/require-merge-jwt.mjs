#!/usr/bin/env node
// PreToolUse hook for Bash matching `gh pr merge`. Require either --admin AND
// authenticated user JWT in env (OPERATOR_JWT), or environment AUTOMERGE_AUTHORIZED=true.
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

if (payload?.tool !== "Bash") process.exit(0);
const cmd = payload?.params?.command ?? "";
if (!/\bgh\s+pr\s+merge\b/.test(cmd)) process.exit(0);

const hasAdmin = /\s--admin\b/.test(cmd);
const hasJwt = !!process.env.OPERATOR_JWT;
const automerge = process.env.AUTOMERGE_AUTHORIZED === "true";

if ((hasAdmin && hasJwt) || automerge) process.exit(0);

process.stderr.write(
  "[require-merge-jwt] Blocked `gh pr merge`: requires --admin AND OPERATOR_JWT in env, " +
  "or AUTOMERGE_AUTHORIZED=true. See ADR 0006.\n"
);
process.exit(2);
