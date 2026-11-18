import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { csvRow } from "@/lib/tracking-csv";
import { orderNo } from "@/lib/order-display";
import type { Prisma } from "@/generated/prisma";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const PAID = ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const PAYMENT_LABEL: Record<string, string> = {
  emt: "Interac e-Transfer",
};

const HEADERS = [
  "order",
  "date",
  "method",
  "reference",
  "email",
  "delivery",
  "amount",
  "currency",
  "payment_status",
  "order_status",
] as const;

/** Money as a plain decimal - a spreadsheet can sum it, "$80 CAD" cannot. */
const amount = (cents: number) => (cents / 100).toFixed(2);

/**
 * Transaction export.
 *
 * Honours the same search and payment filter as the screen, so the file
 * matches what was listed when the button was pressed. Gated on "finance",
 * like the page itself - this is takings, not fulfilment data.
 */
export async function GET(request: Request): Promise<Response> {
  const tz = await getTimeZone();
  await requireCapability("finance");

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const payment = url.searchParams.get("payment") ?? "";

  const where: Prisma.OrderWhereInput = {
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { emtReference: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(payment === "paid" ? { status: { in: [...PAID] } } : {}),
    ...(payment === "pending" ? { status: "AWAITING_PAYMENT" as const } : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const body = [
    HEADERS.join(","),
    ...orders.map((o) => {
      const paid = (PAID as readonly string[]).includes(o.status);
      return csvRow([
        orderNo(o.orderNumber),
        ymdhm(o.createdAt, tz),
        PAYMENT_LABEL[o.paymentMethodKey ?? "emt"] ?? o.paymentMethodKey ?? "emt",
        o.emtReference ?? "",
        o.email,
        amount(o.shippingCents),
        amount(o.totalCents),
        o.currency,
        paid
          ? "received"
          : o.status === "AWAITING_PAYMENT"
            ? "pending"
            : o.status.replace(/_/g, " ").toLowerCase(),
        o.status.replace(/_/g, " ").toLowerCase(),
      ]);
    }),
  ].join("\n");

  const stamp = ymd(new Date(), tz);
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
