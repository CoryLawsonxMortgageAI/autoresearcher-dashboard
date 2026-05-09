#!/usr/bin/env node
// PreToolUse hook for Write/Edit. Block writes that set greenlit_by_user_id
// from a non-JWT source. This is a static-analysis-grade check: we look for
// literal SQL or ORM strings that set greenlit_by_user_id without going through
// the verifyJwt() helper.
import { readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const tool = payload?.tool ?? "";
if (tool !== "Write" && tool !== "Edit") process.exit(0);

const content = payload?.params?.content ?? payload?.params?.new_string ?? "";
const path = payload?.params?.file_path ?? payload?.params?.path ?? "";

if (!/greenlit_by_user_id/.test(content)) process.exit(0);

// Allow if the same content references verifyJwt() — that's the safe path.
const safe =
  /verifyJwt\s*\(/.test(content) ||
  /requireUserId\s*\(/.test(content) ||
  /from\s+["']@autoresearcher\/auth["']/.test(content);

if (safe) process.exit(0);

process.stderr.write(
  `[forbid-greenlit-impersonation] ${path}: greenlit_by_user_id assignment must come from verifyJwt() / requireUserId(). ` +
  "See ADR 0006.\n"
);
process.exit(2);
