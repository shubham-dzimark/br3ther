import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPortalConfig,
  portalOrderId,
  readToken,
  tokenMatches,
} from "@/lib/portal";
import { getTimeZone, ymdhm } from "@/lib/timezone";

/*
 * The portal knows an order by the numeric id we pushed, so a callback arrives
 * as a number - not our order reference. Match the reference first (older
 * integrations and manual calls still use it), then fall back to comparing the
 * digits, which is what portalOrderId() sent.
 */
async function findOrderByPortalRef(ref: string) {
  if (!ref) return null;

  const direct =
    (await prisma.order.findUnique({ where: { orderNumber: ref } })) ??
    (await prisma.order.findUnique({ where: { id: ref } }));
  if (direct) return direct;

  const tail = /(\d+)\s*$/.exec(ref);
  const asNumber = tail ? Number.parseInt(tail[1], 10) : NaN;
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;

  // Small table; comparing digits in SQL would need a raw query for no gain.
  const candidates = await prisma.order.findMany({
    select: { id: true, orderNumber: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const hit = candidates.find(
    (o) => portalOrderId(o.orderNumber) === asNumber,
  );
  return hit ? prisma.order.findUnique({ where: { id: hit.id } }) : null;
}

export const dynamic = "force-dynamic";

/**
 * Portal -> store read. Mirrors the plugin's /ipp-sync/v1/get-order.
 *
 * The original took the token in the query string, which leaks it into access
 * logs, proxies and browser history. Here it belongs in the X-VT-Token header;
 * ?token= is still accepted for compatibility but is reported as deprecated.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const config = await getPortalConfig();
  const url = new URL(request.url);

  if (!config.usable) {
    return NextResponse.json(
      { success: false, error: "portal sync is not configured" },
      { status: 503 },
    );
  }

  const queryToken = url.searchParams.get("token") ?? "";
  const token = readToken(request) || queryToken;

  if (!tokenMatches(token, config.token)) {
    return NextResponse.json({ success: false, error: "Invalid token" }, { status: 403 });
  }

  const ref = (url.searchParams.get("order_id") ?? "").trim();
  if (!ref) {
    return NextResponse.json(
      { success: false, error: "order_id is required" },
      { status: 400 },
    );
  }

  const order = await findOrderByPortalRef(ref);

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    // Flag the insecure form so the portal operator can move to the header.
    deprecated: queryToken ? "Send the token in the X-VT-Token header, not the query string." : undefined,
    data: {
      order_id: portalOrderId(order.orderNumber),
      order_number: order.orderNumber,
      customer_name: order.shipName,
      customer_email: order.email,
      order_amount: (order.totalCents / 100).toFixed(2),
      order_currency: order.currency,
      order_status: order.status.toLowerCase(),
      order_date: ymdhm(order.createdAt, await getTimeZone()),
      emt_reference: order.emtReference,
    },
  });
}
