import { prisma } from "@/lib/prisma";
import { requireCapability, can } from "@/lib/permissions";
import { csvRow } from "@/lib/tracking-csv";
import { orderNo } from "@/lib/order-display";
import type { OrderStatus, Prisma } from "@/generated/prisma";
import { getTimeZone, ymd, ymdhm } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_RECEIVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
  "ON_HOLD",
  "FAILED",
] as const;

const HEADERS = [
  "order",
  "placed",
  "status",
  "customer",
  "email",
  "phone",
  "address",
  "city",
  "region",
  "postal_code",
  "country",
  "items",
  "subtotal",
  "discount",
  "shipping",
  "tax",
  "total",
  "currency",
  "coupon",
  "carrier",
  "tracking_number",
  "shipped_date",
] as const;

/** Money as a plain decimal - a spreadsheet can sum it, "$80 CAD" cannot. */
const amount = (cents: number) => (cents / 100).toFixed(2);

/**
 * Order export.
 *
 * One row per order, with the line items collapsed into a single readable
 * column - a row per item would break every SUM() on the totals, which is
 * what an export like this is usually opened to do.
 *
 * Honours the same status filter and search as the order list, so the file
 * matches what was on screen when the button was pressed.
 */
export async function GET(request: Request): Promise<Response> {
  const me = await requireCapability("orders");
  const tz = await getTimeZone();
  const seePii = can(me.role, "customer_pii");

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();

  const where: Prisma.OrderWhereInput = {
    ...((STATUSES as readonly string[]).includes(status)
      ? { status: status as OrderStatus }
      : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { shipName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { nameSnapshot: true, variantSnapshot: true, quantity: true } },
    },
  });

  const body = [
    HEADERS.join(","),
    ...orders.map((o) =>
      csvRow([
        orderNo(o.orderNumber),
        ymdhm(o.createdAt, tz),
        o.status.replace(/_/g, " ").toLowerCase(),
        o.shipName,
        // Redacted for a fulfilment role, exactly as on the order list.
        seePii ? o.email : "",
        seePii ? (o.phone ?? "") : "",
        [o.shipLine1, o.shipLine2].filter(Boolean).join(", "),
        o.shipCity,
        o.shipRegion,
        o.shipPostalCode,
        o.shipCountry,
        o.items
          .map((i) =>
            `${[i.nameSnapshot, i.variantSnapshot].filter(Boolean).join(" - ")} x${i.quantity}`,
          )
          .join("; "),
        amount(o.subtotalCents),
        amount(o.discountCents),
        amount(o.shippingCents),
        amount(o.taxCents),
        amount(o.totalCents),
        o.currency,
        o.couponCode ?? "",
        o.trackingCarrier ?? "",
        o.trackingCode ?? "",
        o.shippedAt ? ymd(o.shippedAt, tz) : "",
      ]),
    ),
  ].join("\n");

  const stamp = ymd(new Date(), tz);
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
