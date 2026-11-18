import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEmtConfig } from "@/lib/emt";
import { reverseOrderPayment } from "@/lib/order-payment";

export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cancels EMT orders that were never paid for, mirroring the vicetrip
 * gateway's daily auto-cancel. Driven by a systemd timer rather than WP-Cron.
 *
 * No restocking is needed: this store decrements stock when payment is
 * confirmed, not at checkout, so an unpaid order never held any.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !tokenMatches(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = await getEmtConfig();
  if (config.autoCancelDays < 1) {
    return NextResponse.json({ ok: true, skipped: "auto-cancel disabled", cancelled: 0 });
  }

  const cutoff = new Date(Date.now() - config.autoCancelDays * 864e5);

  const stale = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      createdAt: { lt: cutoff },
      // e-Transfer orders only: this is e-Transfer's rule, and a crypto order
      // may be waiting on the portal's review, not on the customer.
      OR: [{ paymentMethodKey: "emt" }, { paymentMethodKey: null }],
    },
    select: { id: true, orderNumber: true },
  });

  /*
   * Through the shared reversal, one order at a time.
   *
   * A bare updateMany wrote the status and nothing else, so points a customer
   * had spent at checkout were never handed back - checkout debits them before
   * payment, so an unpaid order can absolutely be holding some. The reversal
   * is also conditional on the order still being non-terminal, which closes
   * the other half of the problem: a payment confirmed between selecting these
   * rows and updating them would previously have been overwritten with
   * CANCELLED.
   */
  let cancelled = 0;
  for (const o of stale) {
    const stillUnpaid = await prisma.order.count({
      where: { id: o.id, status: "AWAITING_PAYMENT", paymentConfirmedAt: null },
    });
    if (stillUnpaid !== 1) continue;
    if (await reverseOrderPayment(o.id, "CANCELLED")) cancelled += 1;
  }

  if (config.debugLog) {
    console.log(
      `[emt] auto-cancel: ${cancelled} order(s) older than ${config.autoCancelDays} day(s) cancelled${
        cancelled ? `: ${stale.map((o) => o.orderNumber).join(", ")}` : ""
      }`,
    );
  }

  return NextResponse.json({
    ok: true,
    cancelled,
    orders: stale.map((o) => o.orderNumber),
    olderThanDays: config.autoCancelDays,
  });
}
