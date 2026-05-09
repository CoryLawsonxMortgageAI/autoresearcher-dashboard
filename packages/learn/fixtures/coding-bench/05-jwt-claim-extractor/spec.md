# jwt-claim-extractor

Implement a JWT claim extractor that DOES NOT verify signature — it only
parses the (already-trusted) token to read claims. This mirrors the audit
log path where we have a verified JWT upstream and just need a claim.

```ts
export const solve: (token: string) => {
  ok: true; sub: string; iss: string; aud: string; exp: number; iat: number; raw: Record<string, unknown>;
} | { ok: false; reason: string };
```

Rules:
- A JWT has three base64url segments separated by `.`. Decode the second
  segment as JSON. That's the payload.
- Required claims: `sub` (string), `iss` (string), `aud` (string), `exp` (number),
  `iat` (number). If any required claim is missing or the wrong type,
  return `{ ok: false, reason: "missing/invalid <claim>" }`.
- Use `Buffer.from(s, "base64url")` for decoding.
- Strict mode, no `any`. Do NOT verify signature, do NOT check expiry.
