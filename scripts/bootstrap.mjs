#!/usr/bin/env node
// Cross-platform bootstrap. Replaces scripts/bootstrap.sh.
// Works on:
//   - Linux / macOS shells
//   - Windows cmd, PowerShell, and Git Bash
//
// Steps:
//   1. Print Node + pnpm versions (refuse if Node < 20.10).
//   2. `pnpm install --frozen-lockfile`.
//   3. Materialize .env: pull from Vercel if VERCEL_TOKEN is set, else
//      copy .env.example.
//   4. If DATABASE_URL is set, run db:generate + db:migrate.
//   5. Seed the operator user.
//   6. Typecheck.
//   7. Start `pnpm dev` and open the dashboard in the default browser.
//
// Designed to be re-runnable: every step is idempotent.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "..");
process.chdir(REPO);

const isWin = platform() === "win32";

const log = (msg) => process.stdout.write(`== ${msg} ==\n`);
const warn = (msg) => process.stderr.write(`!! ${msg}\n`);

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    stdio: opts.stdio ?? "inherit",
    shell: isWin, // resolves .cmd shims on Windows
    cwd: REPO,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
  }
  return r;
};

const tryRun = (cmd, args, opts = {}) => {
  try {
    return run(cmd, args, opts);
  } catch (err) {
    warn(`step failed (continuing): ${err.message}`);
    return null;
  }
};

const requireNode = () => {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 20 || (maj === 20 && min < 10)) {
    throw new Error(`Node ${process.versions.node} is too old. Install 20.10+ (https://nodejs.org).`);
  }
};

const openBrowser = (url) => {
  if (isWin) {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform() === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
};

const main = async () => {
  log("node version");
  requireNode();
  console.log(`node ${process.version}  ${platform()} ${process.arch}`);

  log("pnpm version");
  run("pnpm", ["--version"]);

  log("install");
  run("pnpm", ["install", "--frozen-lockfile"]);

  if (existsSync(".env")) {
    log(".env already present (skipping vercel pull)");
  } else {
    if (process.env.VERCEL_TOKEN) {
      log("pulling .env from vercel");
      tryRun("pnpm", ["dlx", "vercel@latest", "env", "pull", ".env", "--yes",
        "--environment=development", `--token=${process.env.VERCEL_TOKEN}`]);
    }
    if (!existsSync(".env")) {
      warn("no .env yet — copying .env.example. fill in DATABASE_URL, JWT_SIGNING_KEY, ANTHROPIC_API_KEY before running scout/chat.");
      copyFileSync(".env.example", ".env");
    }
  }

  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const hasDbUrl = /^DATABASE_URL\s*=\s*\S+\s*$/m.test(env) && !/^DATABASE_URL\s*=\s*""\s*$/m.test(env);

  if (hasDbUrl) {
    log("db: generate + migrate");
    tryRun("pnpm", ["--filter", "@autoresearcher/db", "generate"]);
    run("pnpm", ["--filter", "@autoresearcher/db", "migrate"]);
    log("seed operator user (idempotent)");
    tryRun("pnpm", ["tsx", "scripts/seed-fixtures.ts"]);
  } else {
    warn("DATABASE_URL not set — skipping migrations + seed. Frontend renders fine; DB-touching routes will return a structured 500 with code='internal' until you set it.");
  }

  log("typecheck");
  run("pnpm", ["-r", "typecheck"]);

  log("starting dev server (api + web). ctrl+c to stop.");
  const dev = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    shell: isWin,
    env: process.env,
  });

  const url = "http://localhost:3000/activity";
  setTimeout(() => {
    log(`opening ${url}`);
    openBrowser(url);
  }, 4000);

  const stop = () => {
    if (!dev.killed) dev.kill("SIGINT");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", stop);

  dev.on("exit", (code) => process.exit(code ?? 0));
};

main().catch((err) => {
  process.stderr.write(`bootstrap failed: ${err.message}\n`);
  process.exit(1);
});
