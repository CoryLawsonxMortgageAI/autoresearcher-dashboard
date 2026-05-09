import { solve } from "./solution.js";
import { strict as assert } from "node:assert";

const main = async (): Promise<void> => {
  // Test 1: only last call fires
  let calls: number[] = [];
  const debounced = solve((n: number) => calls.push(n), 30);
  debounced(1);
  debounced(2);
  debounced(3);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, [3], `expected [3], got ${JSON.stringify(calls)}`);

  // Test 2: separated calls both fire
  calls = [];
  const d2 = solve((n: number) => calls.push(n), 20);
  d2(10);
  await new Promise((r) => setTimeout(r, 60));
  d2(20);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, [10, 20], `expected [10, 20], got ${JSON.stringify(calls)}`);

  // Test 3: passes through multiple args
  let received: [string, number] | null = null;
  const d3 = solve((s: string, n: number) => { received = [s, n]; }, 10);
  d3("a", 1);
  d3("b", 2);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(received, ["b", 2]);

  console.log("01-debounce: all tests passed");
};

main().catch((err) => { console.error(err); process.exit(1); });
