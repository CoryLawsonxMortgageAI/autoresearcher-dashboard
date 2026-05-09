type Ok = {
  ok: true; sub: string; iss: string; aud: string; exp: number; iat: number;
  raw: Record<string, unknown>;
};
type Fail = { ok: false; reason: string };

export const solve = (token: string): Ok | Fail => {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "token must have 3 segments" };
  const [, payloadSegRaw] = parts;
  const payloadSeg = payloadSegRaw ?? "";
  if (!payloadSeg) return { ok: false, reason: "missing payload segment" };
  let raw: Record<string, unknown>;
  try {
    const decoded = Buffer.from(payloadSeg, "base64url").toString("utf8");
    const obj: unknown = JSON.parse(decoded);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, reason: "payload not an object" };
    }
    raw = obj as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "payload not base64url-encoded JSON" };
  }
  const sub = raw["sub"];
  if (typeof sub !== "string") return { ok: false, reason: "missing/invalid sub" };
  const iss = raw["iss"];
  if (typeof iss !== "string") return { ok: false, reason: "missing/invalid iss" };
  const aud = raw["aud"];
  if (typeof aud !== "string") return { ok: false, reason: "missing/invalid aud" };
  const exp = raw["exp"];
  if (typeof exp !== "number") return { ok: false, reason: "missing/invalid exp" };
  const iat = raw["iat"];
  if (typeof iat !== "number") return { ok: false, reason: "missing/invalid iat" };
  return { ok: true, sub, iss, aud, exp, iat, raw };
};
