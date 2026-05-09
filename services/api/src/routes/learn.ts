import { Hono } from "hono";
import { listVersions, loadLatestBank, loadSkills } from "@autoresearcher/learn";
import { recentReflections } from "../lib/reflections.js";

export const learnRouter = new Hono();

learnRouter.get("/bank", (c) => {
  try {
    const bank = loadLatestBank();
    return c.json(bank);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

learnRouter.get("/bank/versions", (c) => c.json({ versions: listVersions() }));

learnRouter.get("/skills", (c) =>
  c.json({
    skills: loadSkills().map(({ id, when, verticals, priority, filename }) =>
      ({ id, when, verticals, priority, filename })
    ),
  })
);

learnRouter.get("/reflections", async (c) => {
  const agentRaw = c.req.query("agent") ?? "scout";
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const verticalSlug = c.req.query("vertical") ?? undefined;
  if (agentRaw !== "scout" && agentRaw !== "critic" && agentRaw !== "historian") {
    return c.json({ error: "invalid agent" }, 400);
  }
  try {
    const rows = await recentReflections({ agent: agentRaw, verticalSlug, limit });
    return c.json({ items: rows });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
