// `pnpm sync-secrets` — pulls env from Vercel into a worker-readable .env.runtime
// file. Used by the Railway/Fly worker on boot per directive.
//
// We do NOT write the operator's local .env. Operators use `vercel env pull` for
// that. This script is for non-Vercel hosts that still want Vercel as the
// source-of-truth for secrets.
import { execSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT;
const SCOPE = process.env.VERCEL_SCOPE;
const ENVIRONMENT = process.env.VERCEL_ENVIRONMENT ?? "production";
const OUT = process.env.SECRETS_OUT ?? ".env.runtime";

if (!TOKEN) {
  console.error("VERCEL_TOKEN is required");
  process.exit(2);
}
if (!PROJECT) {
  console.error("VERCEL_PROJECT is required");
  process.exit(2);
}

const args = [
  "vercel",
  "env",
  "pull",
  OUT,
  "--yes",
  `--environment=${ENVIRONMENT}`,
  `--token=${TOKEN}`,
];
if (SCOPE) args.push(`--scope=${SCOPE}`);
args.push("--cwd=apps/web"); // Vercel project lives under apps/web

console.log(`[sync-secrets] pulling ${ENVIRONMENT} -> ${OUT}`);
execSync(`pnpm dlx ${args.join(" ")}`, { stdio: "inherit" });

if (!existsSync(OUT)) {
  console.error("[sync-secrets] vercel did not write the file");
  process.exit(2);
}

// Refuse to leak AUTOMERGE_AUTHORIZED into worker context. Per directive: the
// agent / worker must never set or read that variable directly. Strip it.
import { readFileSync } from "node:fs";
const raw = readFileSync(OUT, "utf8");
const stripped = raw
  .split("\n")
  .filter((line) => !/^\s*AUTOMERGE_AUTHORIZED\b/.test(line))
  .join("\n");
writeFileSync(OUT, stripped);
console.log("[sync-secrets] stripped AUTOMERGE_AUTHORIZED from runtime env");
