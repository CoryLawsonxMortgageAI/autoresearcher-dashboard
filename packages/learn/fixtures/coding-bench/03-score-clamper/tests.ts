import { solve } from "./solution.js";
import { strict as assert } from "node:assert";

const r = solve({ fit: 7.34, evidence: 8, market: 9.55, competitive: 6.1, founder: 7 });
assert.equal(r.fit, 7.3);
assert.equal(r.evidence, 8);
assert.equal(r.market, 9.6);
assert.equal(r.total, 7.3 + 8 + 9.6 + 6.1 + 7);

const high = solve({ fit: 100, evidence: 12, market: 50, competitive: 11, founder: 10.5 });
assert.equal(high.fit, 10);
assert.equal(high.evidence, 10);
assert.equal(high.total, 50);

const low = solve({ fit: -5, evidence: -0.1, market: 0, competitive: NaN, founder: 0 });
assert.equal(low.fit, 0);
assert.equal(low.evidence, 0);
assert.equal(low.competitive, 0);
assert.equal(low.total, 0);

console.log("03-score-clamper: all tests passed");
