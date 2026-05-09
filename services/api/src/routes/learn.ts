import { Hono } from "hono";
import { listVersions, loadLatestBank } from "@autoresearcher/learn";

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
