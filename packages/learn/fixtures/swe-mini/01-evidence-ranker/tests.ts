import { solve } from "./ranker.js";
import type { Evidence } from "./types.js";
import { strict as assert } from "node:assert";

const e = (url: string, weight: number, excerpt = "this excerpt is plenty long enough to pass"): Evidence => ({
  url, title: "t", excerpt, weight,
});

// Test 1: filters low weight
const r1 = solve({
  evidence: [e("https://a.com/1", 0.1), e("https://b.com/1", 0.5)],
  maxResults: 5,
});
assert.equal(r1.length, 1);
assert.equal(r1[0]?.url, "https://b.com/1");

// Test 2: filters short excerpts
const r2 = solve({
  evidence: [e("https://a.com/1", 0.5, "too short"), e("https://b.com/1", 0.5)],
  maxResults: 5,
});
assert.equal(r2.length, 1);
assert.equal(r2[0]?.url, "https://b.com/1");

// Test 3: same hostname dedup keeps highest weight
const r3 = solve({
  evidence: [
    e("https://a.com/1", 0.4),
    e("https://a.com/2", 0.9),
    e("https://b.com/1", 0.5),
  ],
  maxResults: 5,
});
assert.equal(r3.length, 2);
assert.equal(r3[0]?.url, "https://a.com/2");
assert.equal(r3[0]?.weight, 0.9);

// Test 4: deterministic tie-break on URL ascending
const r4 = solve({
  evidence: [
    e("https://b.com/1", 0.5),
    e("https://a.com/1", 0.5),
    e("https://c.com/1", 0.5),
  ],
  maxResults: 5,
});
assert.deepEqual(
  r4.map((x) => x.url),
  ["https://a.com/1", "https://b.com/1", "https://c.com/1"]
);

// Test 5: maxResults caps the output
const r5 = solve({
  evidence: [
    e("https://a.com/1", 0.9),
    e("https://b.com/1", 0.8),
    e("https://c.com/1", 0.7),
  ],
  maxResults: 2,
});
assert.equal(r5.length, 2);

// Test 6: maxResults=0 returns []
assert.equal(solve({
  evidence: [e("https://a.com/1", 0.9)],
  maxResults: 0,
}).length, 0);

// Test 7: empty in -> empty out
assert.equal(solve({ evidence: [], maxResults: 5 }).length, 0);

console.log("swe-mini/01-evidence-ranker: all tests passed");
