import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPortalConfig,
  isTerminal,
  portalOrderId,
  queuePortalPush,
  readToken,
  statusForTransfer,
  tokenMatches,
} from "@/lib/portal";
import { confirmOrderPaid } from "@/lib/order-payment";

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
 * Portal -> store callback. Mirrors the plugin's /ipp-sync/v1/update-order.
 *
 * Body: { token?, record_id, order_id, transfer_status }
 * transfer_status: 0 = still awaiting, 1 = received, 2 = rejected/reversed.
 *
 * The token may travel in the X-VT-Token header (preferred) or the body, so
 * the portal's existing format keeps working.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = await getPortalConfig();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON" }, { status: 400 });
  }

  // Unlike the original plugin, an unset token authorises nothing.
  if (!config.usable) {
    return NextResponse.json(
      { success: false, error: "portal sync is not configured" },
      { status: 503 },
    );
  }

  if (!tokenMatches(readToken(request, body), config.token)) {
    return NextResponse.json({ success: false, error: "Invalid token" }, { status: 403 });
  }

  const recordId = String(body.record_id ?? "").trim();
  const orderRef = String(body.order_id ?? body.order_number ?? "").trim();
  const transferStatus = Number(body.transfer_status);

  if (!orderRef || !Number.isInteger(transferStatus)) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid params" },
      { status: 400 },
    );
  }

  const nextStatus = statusForTransfer(transferStatus);
  if (!nextStatus) {
    return NextResponse.json(
      { success: false, error: "transfer_status must be 0, 1 or 2" },
      { status: 400 },
    );
  }

  // Accept either our order number or the internal id.
  const order = await findOrderByPortalRef(orderRef);

  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }
  if (order.paymentMethodKey !== "emt") {
    return NextResponse.json(
      { success: false, error: "Not an e-Transfer order" },
      { status: 409 },
    );
  }

  // Completed, refunded or cancelled orders are left untouched.
  if (isTerminal(order.status)) {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: `Order is ${order.status.toLowerCase()} and was left untouched.`,
    });
  }

  const note = recordId ? `Payment portal record ID: ${recordId}` : null;

  if (nextStatus === "PROCESSING") {
    // Same routine the admin buttons use, so a portal confirmation and a manual
    // one have identical effects on stock, points and referrals.
    await confirmOrderPaid(order.id, {
      status: "PROCESSING",
      emtReference: recordId || null,
      note,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { portalStatus: `callback:${transferStatus}`, portalSyncedAt: new Date() },
    });
  } else {
    // Pending (0) or rejected (2): like the WooCommerce plugin, the order goes
    // On hold for staff to review. Nothing is cancelled automatically.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        emtReference: recordId || order.emtReference,
        staffNote: note
          ? [order.staffNote, note].filter(Boolean).join("\n")
          : order.staffNote,
        portalStatus: `callback:${transferStatus}`,
        portalSyncedAt: new Date(),
      },
    });
  }

  /*
   * Report the order's new status back, as the plugin does: Woo's
   * update_status() fires woocommerce_order_status_changed, which pushes the
   * order to the portal again. Without this the portal's Order Status column
   * stayed "on-hold" beside a completed transfer. Queued, so the portal is not
   * kept waiting on its own callback; an unchanged order is skipped.
   */
  queuePortalPush(order.id);

  return NextResponse.json({
    success: true,
    order_id: portalOrderId(order.orderNumber),
    order_status: nextStatus.toLowerCase(),
  });
}
