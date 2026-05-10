import { Hono } from "hono";
import { pusherHealth } from "../lib/pusher.js";

export const healthRouter = new Hono();

// Tells the operator which LLM provider this deploy is configured for,
// without making any LLM call. Free, idempotent, safe to scrape.
const detectLlmProvider = (): { provider: "anthropic" | "openrouter" | "none"; modelId: string | null } => {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", modelId: "claude-opus-4-7" };
  if (process.env.OPENROUTER_API_KEY) return { provider: "openrouter", modelId: "anthropic/claude-opus-4-7" };
  return { provider: "none", modelId: null };
};

healthRouter.get("/", (c) => {
  const pusher = pusherHealth();
  const llm = detectLlmProvider();
  const dbReady = !!process.env.DATABASE_URL;
  const authReady = !!process.env.JWT_SIGNING_KEY;
  const demo = !dbReady; // Chat /quick is enabled; persistence is off.
  return c.json({
    status: pusher.healthy ? "ok" : "degraded",
    pusher,
    llm,
    ready: { db: dbReady, auth: authReady, llm: llm.provider !== "none" },
    demo,
    time: new Date().toISOString(),
    env: process.env.SENTRY_ENVIRONMENT ?? "development",
  });
});
