import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

// Per-request correlation id. Read from inbound header (x-request-id) or
// generate fresh. Attached to the Hono context, echoed in response, and
// available to downstream handlers via c.var.requestId.
export const requestId = async (c: Context, next: Next): Promise<void> => {
  const inbound = c.req.header("x-request-id");
  const id = inbound && /^[a-zA-Z0-9-]{1,80}$/.test(inbound) ? inbound : randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
