import { solve } from "./solution.js";
import { strict as assert } from "node:assert";

const e = (url: string, excerpt: string, weight = 0.5) => ({ url, title: "t", excerpt, weight });
const longExcerpt = "this excerpt is plenty long enough for the floor";

assert.equal(solve([]).ok, false);
assert.equal(solve([e("https://a.com/x", longExcerpt)]).ok, false);

assert.equal(solve([
  e("https://a.com/x", longExcerpt),
  e("https://a.com/y", longExcerpt),
]).ok, false, "same-domain pair should fail");

assert.equal(solve([
  e("https://a.com/x", longExcerpt),
  e("https://b.com/y", longExcerpt),
]).ok, true);

assert.equal(solve([
  e("https://a.com/x", longExcerpt),
  e("https://b.com/y", longExcerpt, 1.5),
]).ok, false, "weight out of range should fail");

assert.equal(solve([
  e("https://a.com/x", "too short"),
  e("https://b.com/y", longExcerpt),
]).ok, false, "short excerpt should fail");

console.log("02-evidence-validator: all tests passed");
