/**
 * Which notifications are orders.
 *
 * Its own file with no "server-only": the bell and the order toast run in the
 * browser and both need this list, and a second hand-maintained copy would
 * drift the first time a type was added.
 */
export const ORDER_TYPES = ["ORDER_PLACED", "PAYMENT_CONFIRMED"] as const;
