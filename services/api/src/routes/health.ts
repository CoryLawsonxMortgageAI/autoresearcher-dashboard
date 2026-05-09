import { Hono } from "hono";
import { pusherHealth } from "../lib/pusher.js";

export const healthRouter = new Hono();

healthRouter.get("/", (c) => {
  const pusher = pusherHealth();
  return c.json({
    status: pusher.healthy ? "ok" : "degraded",
    pusher,
    time: new Date().toISOString(),
    env: process.env.SENTRY_ENVIRONMENT ?? "development",
  });
});
