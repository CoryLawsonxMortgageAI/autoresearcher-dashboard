#!/usr/bin/env node
// PostToolUse: queue a typecheck for the package containing the written file.
// Writes a marker file consumed by the dev-server watcher (or by CI in non-watch).
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const tool = payload?.tool ?? "";
if (tool !== "Write") process.exit(0);
const path = payload?.params?.file_path ?? "";
if (!/^packages\/[^/]+\/src\//.test(path)) process.exit(0);

const pkg = path.split("/").slice(0, 2).join("/");
mkdirSync(".tmp", { recursive: true });
appendFileSync(".tmp/typecheck-queue.txt", `${pkg}\n`);
process.exit(0);
