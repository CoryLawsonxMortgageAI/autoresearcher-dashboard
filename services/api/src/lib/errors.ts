// Structured error envelope. All thrown errors flow through here so clients
// see `{ error: { code, message, requestId } }` consistently.
import type { Context } from "hono";

export type ApiErrorCode =
  | "internal"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "cost_ceiling"
  | "tier3_blocked"
  | "out_of_allowlist";

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number = 500
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorEnvelope = (c: Context, err: unknown): Response => {
  const requestId = c.var.requestId ?? "—";
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, requestId } },
      err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: { code: "internal" as const, message, requestId } }, 500);
};
