import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Does a secret sent with a request match the one we hold?
 *
 * A plain `!==` stops at the first differing character, so how long a wrong
 * guess takes to reject hints at how much of it was right. Both sides are
 * hashed first, which gives two equal-length buffers for timingSafeEqual and
 * keeps the length of the real secret out of the timing as well.
 */
export function secretMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
