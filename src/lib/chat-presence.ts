import "server-only";

/**
 * Is the customer still on the site?
 *
 * The chat widget polls /api/chat/messages every 5s while open and every 20s
 * while closed, on every storefront page. So "polled recently" means "has the
 * shop open in a tab", and silence means they have left - which is when a
 * staff reply should go to their inbox instead of waiting in a widget nobody
 * is looking at.
 *
 * Kept in memory on purpose: it changes every few seconds and is worthless
 * after a restart. Losing it only means one reply is emailed that would not
 * have needed to be, which is the safe direction to be wrong in. globalThis,
 * because route handlers and server actions can be separate module instances
 * inside the same Node process.
 */

/** Longer than the 20s closed-widget poll, with room for a slow tick. */
export const AWAY_AFTER_MS = 45_000;

const KEY = Symbol.for("shop.chatPresence");

function seen(): Map<string, number> {
  const g = globalThis as unknown as Record<symbol, Map<string, number> | undefined>;
  return (g[KEY] ??= new Map());
}

export function markCustomerSeen(ticketId: string): void {
  const map = seen();
  const now = Date.now();
  map.set(ticketId, now);
  // Forget threads nobody has polled for an hour, so the map cannot grow forever.
  if (map.size > 500) {
    for (const [id, at] of map) if (now - at > 3_600_000) map.delete(id);
  }
}

export function isCustomerOnline(ticketId: string): boolean {
  const at = seen().get(ticketId);
  return at !== undefined && Date.now() - at < AWAY_AFTER_MS;
}
