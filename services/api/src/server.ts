import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initSentry, captureException } from "./lib/sentry.js";
import { initOtel } from "./lib/otel.js";
import { healthRouter } from "./routes/health.js";
import { activityRouter } from "./routes/activity.js";
import { opportunitiesRouter } from "./routes/opportunities.js";
import { mergesRouter } from "./routes/merges.js";
import { magicRouter } from "./routes/magic.js";
import { scoutRouter } from "./routes/scout.js";
import { evalsRouter } from "./routes/evals.js";

initSentry();
void initOtel();

export const app = new Hono();
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allow = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim());
      if (!origin) return allow[0] ?? "*";
      return allow.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.onError((err, c) => {
  captureException(err);
  return c.json({ error: err.message }, 500);
});

app.route("/api/health", healthRouter);
app.route("/api/activity", activityRouter);
app.route("/api/opportunities", opportunitiesRouter);
app.route("/api/merges", mergesRouter);
app.route("/api/magic", magicRouter);
app.route("/api/scout", scoutRouter);
app.route("/api/evals", evalsRouter);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import("@hono/node-server");
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port });
  console.log(`[api] listening on :${port}`);
}

// For Vercel @vercel/node serverless, this default export works as a fetch handler.
export default app.fetch;
