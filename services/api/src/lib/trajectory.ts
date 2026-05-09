// Per-run trajectory log. One JSONL line per agent step.
// Reference: SWE-Gym (Pan et al., 2024) and replay-buffer practice.
//
// Lines are appended atomically (one writeFile call per line) so a crashed
// run still leaves a partial log. The directory is configurable; default
// is `./data/trajectories/` next to the worker process.
//
// We do NOT log the operator's JWT or any header content. Only model I/O.
import { mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAJECTORY_ROOT ?? "./data/trajectories";

export type TrajectoryStep =
  | { kind: "llm"; model: string; system: string; userJson: unknown; outputText: string;
      inputTokens: number; outputTokens: number; costCents: string; ms: number; at: string }
  | { kind: "tool"; name: string; input: unknown; output: unknown; ms: number; at: string }
  | { kind: "note"; text: string; at: string }
  | { kind: "verdict"; verdict: string; notes: string; at: string };

const ensure = (): void => {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
};

export const trajectoryPath = (runId: string): string => join(ROOT, `${runId}.jsonl`);

export const append = (runId: string, step: TrajectoryStep): void => {
  ensure();
  const safe = redact(step);
  appendFileSync(trajectoryPath(runId), JSON.stringify(safe) + "\n");
};

const redact = (step: TrajectoryStep): TrajectoryStep => {
  if (step.kind !== "llm") return step;
  // Strip obviously secret-looking strings from the user JSON before persisting.
  const userJson = JSON.parse(JSON.stringify(step.userJson, (_, v) => {
    if (typeof v === "string" && /(?:bearer|sk-|api[-_]?key|secret)/i.test(v)) return "[REDACTED]";
    return v;
  }));
  return { ...step, userJson };
};
