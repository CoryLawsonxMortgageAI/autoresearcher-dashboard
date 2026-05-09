import { Hono } from "hono";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAJECTORY_ROOT ?? "./data/trajectories";

export const trajectoriesRouter = new Hono();

trajectoriesRouter.get("/", (c) => {
  if (!existsSync(ROOT)) return c.json({ items: [] });
  try {
    const files = readdirSync(ROOT)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const stat = statSync(join(ROOT, f));
        return {
          runId: f.replace(/\.jsonl$/, ""),
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
      .slice(0, 200);
    return c.json({ items: files });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

trajectoriesRouter.get("/:runId", (c) => {
  const runId = c.req.param("runId");
  if (!runId || !/^[a-z0-9-]+$/i.test(runId)) {
    return c.json({ error: "invalid runId" }, 400);
  }
  const path = join(ROOT, `${runId}.jsonl`);
  if (!existsSync(path)) return c.json({ error: "not found" }, 404);
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const steps: unknown[] = [];
  for (const l of lines) {
    try { steps.push(JSON.parse(l)); }
    catch { steps.push({ kind: "parse-error", raw: l.slice(0, 200) }); }
  }
  return c.json({ runId, steps });
});
