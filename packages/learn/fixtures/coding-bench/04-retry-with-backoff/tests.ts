import { solve } from "./solution.js";
import { strict as assert } from "node:assert";

const main = async (): Promise<void> => {
  // Test 1: success on first try
  let calls = 0;
  const r1 = await solve(async () => { calls++; return 42; }, { attempts: 3, baseMs: 10, maxMs: 100 });
  assert.equal(r1, 42);
  assert.equal(calls, 1);

  // Test 2: success on third try, sleeps recorded
  calls = 0;
  const sleeps: number[] = [];
  const fakeSleep = async (ms: number): Promise<void> => { sleeps.push(ms); };
  const r2 = await solve(async () => {
    calls++;
    if (calls < 3) throw new Error("transient");
    return "ok";
  }, { attempts: 5, baseMs: 10, maxMs: 100, sleep: fakeSleep });
  assert.equal(r2, "ok");
  assert.equal(calls, 3);
  // Two backoffs: after attempt 1 (10ms), after attempt 2 (20ms)
  assert.deepEqual(sleeps, [10, 20]);

  // Test 3: maxMs caps the backoff
  const sleeps2: number[] = [];
  let calls2 = 0;
  try {
    await solve(async () => { calls2++; throw new Error("nope"); },
      { attempts: 4, baseMs: 100, maxMs: 150, sleep: async (ms) => { sleeps2.push(ms); } });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal((err as Error).message, "nope");
  }
  assert.equal(calls2, 4);
  assert.deepEqual(sleeps2, [100, 150, 150]);

  // Test 4: non-retryable short-circuits
  let calls3 = 0;
  const sleeps3: number[] = [];
  try {
    await solve(async () => { calls3++; throw new Error("fatal"); },
      {
        attempts: 5, baseMs: 10, maxMs: 100,
        isRetryable: (e) => (e as Error).message !== "fatal",
        sleep: async (ms) => { sleeps3.push(ms); },
      });
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal((err as Error).message, "fatal");
  }
  assert.equal(calls3, 1, "should not retry on non-retryable");
  assert.deepEqual(sleeps3, [], "should not sleep on non-retryable");

  // Test 5: attempts=0 throws before calling fn
  let calls4 = 0;
  try {
    await solve(async () => { calls4++; return "x"; }, { attempts: 0, baseMs: 10, maxMs: 100 });
    assert.fail("attempts=0 should throw");
  } catch {/* expected */}
  assert.equal(calls4, 0);

  console.log("04-retry-with-backoff: all tests passed");
};

main().catch((err) => { console.error(err); process.exit(1); });
