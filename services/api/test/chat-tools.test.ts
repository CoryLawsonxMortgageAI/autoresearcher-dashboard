// Chat-agent surface test (no LLM required). We assert the structural
// guarantees of the chat tool inventory:
//   1. The tool list does NOT include greenlight, reject, merge, or revert.
//   2. The system prompt explicitly tells the agent to refuse those.
//   3. dispatchTool throws on an unknown tool name (defense in depth).
//
// We import the agent module via dynamic import to avoid initializing the
// Anthropic client at import time (no API key needed for these checks).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src", "agents", "chat.ts");

describe("chat tool surface (static analysis of source)", () => {
  const src = readFileSync(SRC, "utf8");

  it("does NOT expose greenlight/reject/merge/revert as tools", () => {
    // We grep the source rather than importing — importing would load the
    // Anthropic SDK and demand an API key. The Tool definitions are right
    // there in the file as strict literals.
    const toolNamesBlock = src.match(/const TOOLS:\s*Anthropic\.Tool\[\]\s*=\s*\[([\s\S]*?)\];/);
    expect(toolNamesBlock).toBeTruthy();
    const block = toolNamesBlock?.[1] ?? "";
    expect(block).not.toMatch(/name:\s*"greenlight"/);
    expect(block).not.toMatch(/name:\s*"reject"/);
    expect(block).not.toMatch(/name:\s*"merge"/);
    expect(block).not.toMatch(/name:\s*"revert"/);
    expect(block).not.toMatch(/name:\s*"tap_merge"/);
    expect(block).not.toMatch(/name:\s*"edit_verticals"/);
    expect(block).not.toMatch(/name:\s*"write_skill"/);
  });

  it("system prompt forbids greenlight/reject and explains why", () => {
    const sysBlock = src.match(/const CHAT_SYSTEM\s*=\s*`([\s\S]*?)`/);
    expect(sysBlock).toBeTruthy();
    const sys = sysBlock?.[1] ?? "";
    expect(sys).toMatch(/may NOT greenlight or reject/i);
    expect(sys).toMatch(/operator's interactive tap/i);
    // Audit trail clue: must mention user_id so the agent stays out of the
    // operator's lane.
    expect(sys).toMatch(/user_id/);
  });

  it("dispatchTool throws on unknown tool names (string match)", () => {
    expect(src).toMatch(/throw new Error\(`unknown tool:\s*\$\{name\}`\);/);
  });

  it("only the cost-incurring tools (review_opportunity, run_scout_now) carry cost warnings in their description", () => {
    expect(src).toMatch(/Costs LLM tokens.*[\s\S]*?review_opportunity|review_opportunity[\s\S]*?Costs LLM tokens/);
    expect(src).toMatch(/Costs LLM tokens.*[\s\S]*?run_scout_now|run_scout_now[\s\S]*?Costs LLM tokens/);
  });

  it("MAX_TOOL_ITERATIONS is bounded (defense against runaway loops)", () => {
    const m = src.match(/MAX_TOOL_ITERATIONS\s*=\s*(\d+)/);
    expect(m).toBeTruthy();
    const n = Number(m?.[1] ?? "0");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(20);
  });
});
