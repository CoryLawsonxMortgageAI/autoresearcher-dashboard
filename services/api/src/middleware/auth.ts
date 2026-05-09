import type { Context, Next } from "hono";
import { verifyJwt, type OperatorClaims } from "../lib/auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: OperatorClaims;
  }
}

export const requireOperator = async (c: Context, next: Next): Promise<Response | void> => {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing bearer token" }, 401);
  }
  try {
    const claims = await verifyJwt(auth.slice("Bearer ".length));
    if (!claims.isOperator) return c.json({ error: "not an operator" }, 403);
    c.set("user", claims);
    await next();
  } catch (err) {
    return c.json({ error: "invalid token", detail: String(err) }, 401);
  }
};
