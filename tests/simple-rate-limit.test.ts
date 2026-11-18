import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../src/lib/simple-rate-limit";

test("allows up to the limit inside the window, then refuses", () => {
  const limit = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const t = 1_000_000;
  assert.deepEqual([limit("ip-a", t), limit("ip-a", t + 1), limit("ip-a", t + 2), limit("ip-a", t + 3)], [true, true, true, false]);
  // Another visitor has their own allowance.
  assert.equal(limit("ip-b", t + 3), true);
});

test("the allowance comes back once the window has passed", () => {
  const limit = createRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(limit("ip", 0), true);
  assert.equal(limit("ip", 59_999), false);
  assert.equal(limit("ip", 60_000), true);
});
