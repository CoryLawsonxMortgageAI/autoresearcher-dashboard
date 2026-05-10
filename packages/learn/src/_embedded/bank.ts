// Embedded fallback for the prompt bank. Same pattern as skills: the
// JSON files under packages/learn/fixtures/prompt-bank/ are the
// authoritative editable source; this is the bundled-into-the-function
// copy used at runtime when FS lookups fail (e.g., serverless).
//
// Distillation in production should write a NEW versioned file AND
// regenerate this module so the next deploy's serverless function can
// load it. The simple bootstrap value below ships with v1.0 launch.

import type { PromptBank } from "../prompt-bank.js";

export const EMBEDDED_BANK: PromptBank = {
  version: "v0-bootstrap",
  generatedAt: "2026-05-09T00:00:00.000Z",
  windowDays: 0,
  examples: [],
  metrics: {
    greenlitCount: 0,
    rejectedCount: 0,
    greenlightRate: 0,
  },
};

// In multi-version environments we'd embed an array. v0 only ships one.
export const EMBEDDED_BANK_VERSIONS: string[] = ["v0-bootstrap.json"];
