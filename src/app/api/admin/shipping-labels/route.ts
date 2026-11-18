import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { CSV_HEADERS, csvRow } from "@/lib/tracking-csv";
import type { OrderStatus } from "@/generated/prisma";
import { getTimeZone, ymd } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const STATUSES = [
  "AWAITING_PAYMENT",
  "PAYMENT_RECEIVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

/**
 * Shipping-label export. Streams a CSV of the orders matching the filters, in
 * exactly the column order the tracking import expects - so a courier can fill
 * in the carrier and tracking columns and the same file goes straight back in.
 */
export async function GET(request: Request): Promise<Response> {
  const tz = await getTimeZone();
  await requireCapability("orders");

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const untrackedOnly = url.searchParams.get("untracked") === "1";

  const where = {
    ...((STATUSES as readonly string[]).includes(status)
      ? { status: status as OrderStatus }
      : {}),
    // Stops a second label going out for a parcel that already shipped.
    ...(untrackedOnly ? { OR: [{ trackingCode: null }, { trackingCode: "" }] } : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      orderNumber: true,
      shipName: true,
      shipLine1: true,
      shipLine2: true,
      shipCity: true,
      shipRegion: true,
      shipPostalCode: true,
      shipCountry: true,
      trackingCarrier: true,
      trackingCode: true,
      shippedAt: true,
    },
  });

  const body = [
    CSV_HEADERS.join(","),
    ...orders.map((o) =>
      csvRow([
        o.orderNumber,
        o.shipName,
        [o.shipLine1, o.shipLine2].filter(Boolean).join(", "),
        o.shipCity,
        o.shipRegion,
        o.shipPostalCode,
        o.shipCountry,
        o.trackingCarrier,
        o.trackingCode,
        o.shippedAt ? ymd(o.shippedAt, tz) : "",
      ]),
    ),
  ].join("\r\n");

  const stamp = ymd(new Date(), tz);
  // Leading BOM so Excel opens accented names correctly.
  return new Response(`﻿${body}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shipping-labels-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
