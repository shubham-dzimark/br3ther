/**
 * A fixed-window counter per key, held in this process's memory.
 *
 * Enough to stop someone guessing gift card codes through the balance check:
 * the site runs as one Node process, and a restart forgetting the counts is
 * harmless. Not a substitute for a shared limiter if that ever changes.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string, now: number = Date.now()): boolean => {
    const w = windows.get(key);
    if (!w || now - w.start >= opts.windowMs) {
      windows.set(key, { start: now, count: 1 });
      // Keep the map from growing without bound on a busy day.
      if (windows.size > 5000) {
        for (const [k, v] of windows) if (now - v.start >= opts.windowMs) windows.delete(k);
      }
      return true;
    }
    if (w.count >= opts.limit) return false;
    w.count += 1;
    return true;
  };
}
