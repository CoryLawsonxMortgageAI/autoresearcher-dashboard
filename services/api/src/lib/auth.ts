import { SignJWT, jwtVerify } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { getDb, magicLinks } from "@autoresearcher/db";
import { eq } from "drizzle-orm";

const getKey = (): Uint8Array => {
  const k = process.env.JWT_SIGNING_KEY;
  if (!k || k.length < 32) {
    throw new Error("JWT_SIGNING_KEY must be set and at least 32 chars.");
  }
  return new TextEncoder().encode(k);
};

export type OperatorClaims = {
  sub: string; // user id
  email: string;
  isOperator: boolean;
};

export const issueOperatorJwt = async (claims: OperatorClaims, ttlSeconds = 3600): Promise<string> =>
  new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setIssuer("autoresearcher")
    .setAudience("operator")
    .sign(getKey());

export const verifyJwt = async (token: string): Promise<OperatorClaims> => {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: "autoresearcher",
    audience: "operator",
  });
  if (typeof payload.sub !== "string") throw new Error("missing sub");
  return {
    sub: payload.sub,
    email: String(payload["email"] ?? ""),
    isOperator: Boolean(payload["isOperator"]),
  };
};

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export const issueMagicLink = async (args: {
  purpose: "greenlight" | "reject" | "operator-login";
  subjectId: string;
  userId: string;
  ttlSeconds?: number;
}): Promise<{ token: string; url: string }> => {
  const ttl = args.ttlSeconds ?? Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 900);
  const token = await new SignJWT({
    purpose: args.purpose,
    subjectId: args.subjectId,
    userId: args.userId,
    jti: randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setIssuer("autoresearcher")
    .setAudience("magic")
    .sign(getKey());

  const db = getDb();
  await db.insert(magicLinks).values({
    id: randomUUID(),
    tokenHash: sha256(token),
    purpose: args.purpose,
    subjectId: args.subjectId,
    userId: args.userId,
    expiresAt: new Date(Date.now() + ttl * 1000),
  });

  const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
  const url = `${base}/magic?t=${encodeURIComponent(token)}`;
  return { token, url };
};

export const consumeMagicLink = async (token: string): Promise<{
  purpose: string;
  subjectId: string;
  userId: string;
}> => {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: "autoresearcher",
    audience: "magic",
  });
  const hash = sha256(token);
  const db = getDb();
  const row = await db.query.magicLinks.findFirst({ where: eq(magicLinks.tokenHash, hash) });
  if (!row) throw new Error("magic link unknown");
  if (row.revoked) throw new Error("magic link revoked");
  if (row.consumedAt) throw new Error("magic link already consumed");
  if (row.expiresAt.getTime() < Date.now()) throw new Error("magic link expired");
  await db.update(magicLinks).set({ consumedAt: new Date() }).where(eq(magicLinks.id, row.id));
  return {
    purpose: String(payload["purpose"] ?? ""),
    subjectId: String(payload["subjectId"] ?? ""),
    userId: String(payload["userId"] ?? ""),
  };
};

// Hook-mandated helper: any code path that sets greenlit_by_user_id MUST call this.
export const requireUserId = async (authHeader: string | null): Promise<string> => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("missing bearer token");
  }
  const claims = await verifyJwt(authHeader.slice("Bearer ".length));
  return claims.sub;
};
