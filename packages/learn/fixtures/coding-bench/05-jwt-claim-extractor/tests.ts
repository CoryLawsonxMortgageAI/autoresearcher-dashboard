import { solve } from "./solution.js";
import { strict as assert } from "node:assert";

const encode = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");

const goodToken = `header.${encode({ sub: "u-1", iss: "autoresearcher", aud: "operator", exp: 9999999999, iat: 1, extra: true })}.sig`;

const r1 = solve(goodToken);
assert.equal(r1.ok, true);
if (r1.ok) {
  assert.equal(r1.sub, "u-1");
  assert.equal(r1.iss, "autoresearcher");
  assert.equal(r1.aud, "operator");
  assert.equal(r1.exp, 9999999999);
  assert.equal(r1.iat, 1);
  assert.equal(r1.raw["extra"], true);
}

assert.equal(solve("oneseg").ok, false);
assert.equal(solve("a.b").ok, false);
assert.equal(solve(`a.${encode({ sub: 1 })}.c`).ok, false, "non-string sub should fail");
assert.equal(solve(`a.${encode({ sub: "u", iss: "i", aud: "a", exp: "9999", iat: 1 })}.c`).ok, false, "non-number exp should fail");
assert.equal(solve("a.notbase64!.c").ok, false);

console.log("05-jwt-claim-extractor: all tests passed");
