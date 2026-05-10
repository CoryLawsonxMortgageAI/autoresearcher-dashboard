#!/usr/bin/env node
// `pnpm doctor` — pre-flight check for new clones. Especially useful on
// Windows, where the most common failure modes are wrong Node version,
// wrong pnpm version, missing Git Bash, antivirus eating node_modules,
// or CRLF line endings corrupting parsed config files.
//
// Exits 0 if green, 1 if any red.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, totalmem, cpus, homedir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(REPO);
const isWin = platform() === "win32";

let red = 0;
let yellow = 0;

const ok    = (msg) => console.log(`✓ ${msg}`);
const warn  = (msg) => { console.log(`! ${msg}`); yellow++; };
const fail  = (msg) => { console.log(`✗ ${msg}`); red++; };

const cmd = (cmd, args = []) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: isWin });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

console.log(`autoresearcher doctor  ·  ${platform()} ${process.arch}  ·  cpus=${cpus().length}  ·  ram=${Math.round(totalmem() / 1e9)}GB`);
console.log("");

// 1. Node version
{
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj > 20 || (maj === 20 && min >= 10)) ok(`Node ${process.version}`);
  else fail(`Node ${process.version} is too old. Install 20.10+ (Windows: nvm-windows or volta).`);
}

// 2. pnpm version
{
  const r = cmd("pnpm", ["--version"]);
  if (r.code === 0) {
    const v = r.out.trim();
    const [maj] = v.split(".").map(Number);
    if (maj >= 9) ok(`pnpm ${v}`);
    else fail(`pnpm ${v} is too old. Run: corepack enable && corepack prepare pnpm@9 --activate`);
  } else fail("pnpm not found. Run: corepack enable && corepack prepare pnpm@9 --activate");
}

// 3. git
{
  const r = cmd("git", ["--version"]);
  if (r.code === 0) ok(r.out.trim());
  else fail("git not on PATH. Install Git for Windows (https://git-scm.com/download/win).");
}

// 4. lockfile present and parseable
{
  const lock = join(REPO, "pnpm-lock.yaml");
  if (existsSync(lock) && statSync(lock).size > 1000) ok("pnpm-lock.yaml present");
  else warn("pnpm-lock.yaml missing or empty — first install will generate it.");
}

// 5. Line endings (Windows CRLF can corrupt YAML frontmatter parsing)
{
  const skill = join(REPO, "packages/learn/fixtures/skills/named-buyer-floor.md");
  if (existsSync(skill)) {
    const raw = readFileSync(skill);
    if (raw.includes(13)) {
      warn("skill .md files contain CRLF — frontmatter parser tolerates it but you should set git's autocrlf to false: git config --global core.autocrlf input");
    } else ok("skill .md files use LF (good)");
  } else warn("skill fixtures missing — run after pnpm install");
}

// 6. .env presence
{
  if (existsSync(".env")) {
    const env = readFileSync(".env", "utf8");
    const probe = (key) => /^[A-Z_]+=\S+\s*$/m.test(env.split("\n").filter((l) => l.startsWith(key + "=")).join("\n"));
    const haveDb = probe("DATABASE_URL");
    const haveJwt = probe("JWT_SIGNING_KEY");
    const haveAnt = probe("ANTHROPIC_API_KEY");
    const haveOr = probe("OPENROUTER_API_KEY");
    if (haveDb) ok("DATABASE_URL set"); else warn("DATABASE_URL not set — DB-touching routes will 500.");
    if (haveJwt) ok("JWT_SIGNING_KEY set"); else warn("JWT_SIGNING_KEY not set — auth/magic-link routes will 500.");
    if (haveAnt) ok("ANTHROPIC_API_KEY set (LLM provider: anthropic native)");
    else if (haveOr) ok("OPENROUTER_API_KEY set (LLM provider: openrouter)");
    else warn("No LLM key set — agents (SCOUT/CRITIC/chat) won't run. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.");
  } else fail(".env missing. Copy .env.example to .env and fill in. Or run pnpm bootstrap.");
}

// 7. node_modules sanity (Windows + antivirus is a common foot-gun).
// pnpm uses an isolated layout — root deps live at the root, but app-specific
// deps live under apps/web/node_modules. Probe in both places.
{
  if (existsSync("node_modules")) {
    const rootHasTsx = existsSync("node_modules/tsx") ||
      existsSync("node_modules/.pnpm");
    const webHasNext =
      existsSync("apps/web/node_modules/next") ||
      existsSync("node_modules/.pnpm/next@14.2.10") ||
      existsSync("node_modules/next");
    if (rootHasTsx && webHasNext) ok("node_modules looks installed");
    else if (rootHasTsx) warn("node_modules ok at root; apps/web missing next — `pnpm install` again, or `pnpm install --filter @autoresearcher/web`.");
    else warn("node_modules incomplete — run `pnpm install`. On Windows, exclude the repo from Defender real-time scanning if installs are slow or partial.");
  } else warn("node_modules missing — run `pnpm install`.");
}

// 8. Disk space hint (best-effort)
if (isWin) {
  // Windows: just inform; we don't probe.
  console.log("  (Windows note: keep at least 5 GB free for node_modules + .next caches.)");
}

console.log("");
if (red > 0) {
  console.log(`${red} red, ${yellow} yellow. fix the red ones before running pnpm dev.`);
  process.exit(1);
} else if (yellow > 0) {
  console.log(`${yellow} yellow. you can pnpm dev but expect degraded mode for unset env vars.`);
  process.exit(0);
} else {
  console.log("all green. pnpm dev away.");
  process.exit(0);
}
