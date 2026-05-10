// Next.js App Router catch-all that delegates every /api/* request to the
// Hono app exported from @autoresearcher/api. Lets the entire monorepo
// deploy as a single Next.js app on Vercel.
//
// Hono's `app.fetch` is a standard fetch handler; Next route handlers
// receive a fetch Request and return a fetch Response. So this is just a
// passthrough.
import { app } from "@autoresearcher/api/server";

export const runtime = "nodejs";
// Some routes (chat SSE, scout) take longer than the default 10s.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const handler = (req: Request): Promise<Response> => app.fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
