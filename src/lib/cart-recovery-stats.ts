import "server-only";
import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/timezone";

/**
 * The numbers on the abandoned-cart overview.
 *
 * Every figure here is defined against the same window so they can be read
 * together: money that came back, money still in play, and money that ran out
 * of follow-ups without being recovered.
 */

/** A cart is out of runway this long after its last follow-up could have gone. */
const RUNWAY_GRACE_MINUTES = 72 * 60;

export type RecoveryOverview = {
  days: number;
  recoveredRevenueCents: number;
  recoveredOrders: number;
  recoverableRevenueCents: number;
  recoverableOrders: number;
  lostOrders: number;
  /** Recovered as a share of everything that finished its sequence. Null when nothing has. */
  recoveryRate: number | null;
  series: { day: string; recoverableCents: number; recoveredCents: number }[];
};

export async function getRecoveryOverview(days = 30, tz = "UTC"): Promise<RecoveryOverview> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [steps, sends, carts] = await Promise.all([
    prisma.cartFollowUp.findMany({
      where: { enabled: true },
      orderBy: { delayMinutes: "desc" },
      take: 1,
      select: { delayMinutes: true },
    }),
    prisma.cartFollowUpSend.findMany({
      where: { convertedAt: { gte: since } },
      select: { convertedAt: true, revenueCents: true },
    }),
    prisma.cart.findMany({
      where: { lastActivityAt: { gte: since }, itemCount: { gt: 0 }, email: { not: null } },
      select: { subtotalCents: true, lastActivityAt: true, status: true, recoveredOrderId: true },
    }),
  ]);

  /*
   * How long a cart stays worth chasing: the last step's delay plus a grace
   * period. With no templates set up yet, three days is the honest default -
   * it is roughly how long the built-in reminder keeps trying.
   */
  const runwayMinutes = (steps[0]?.delayMinutes ?? 0) + RUNWAY_GRACE_MINUTES;
  const runwayCutoff = Date.now() - runwayMinutes * 60_000;

  let recoverableRevenueCents = 0;
  let recoverableOrders = 0;
  let lostOrders = 0;

  const buckets = new Map<string, { recoverableCents: number; recoveredCents: number }>();
  const bucket = (day: string) => {
    let b = buckets.get(day);
    if (!b) {
      b = { recoverableCents: 0, recoveredCents: 0 };
      buckets.set(day, b);
    }
    return b;
  };

  for (const cart of carts) {
    if (cart.status === "CONVERTED" || cart.recoveredOrderId) continue;
    if (cart.lastActivityAt.getTime() >= runwayCutoff) {
      recoverableRevenueCents += cart.subtotalCents;
      recoverableOrders++;
    } else {
      lostOrders++;
    }
    bucket(ymd(cart.lastActivityAt, tz)).recoverableCents += cart.subtotalCents;
  }

  let recoveredRevenueCents = 0;
  for (const send of sends) {
    if (!send.convertedAt) continue;
    recoveredRevenueCents += send.revenueCents ?? 0;
    bucket(ymd(send.convertedAt, tz)).recoveredCents += send.revenueCents ?? 0;
  }

  const finished = sends.length + lostOrders;

  // Every day in the window, including the quiet ones - a line with gaps in it
  // reads as missing data rather than as a day nothing happened.
  const series: RecoveryOverview["series"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = ymd(new Date(Date.now() - i * 86_400_000), tz);
    const b = buckets.get(day);
    series.push({
      day,
      recoverableCents: b?.recoverableCents ?? 0,
      recoveredCents: b?.recoveredCents ?? 0,
    });
  }

  return {
    days,
    recoveredRevenueCents,
    recoveredOrders: sends.length,
    recoverableRevenueCents,
    recoverableOrders,
    lostOrders,
    recoveryRate: finished > 0 ? sends.length / finished : null,
    series,
  };
}
