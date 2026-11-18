import { prisma } from "@/lib/prisma";
import { confirmOrderPaid } from "@/lib/order-payment";
import { authorisePortalRequest, CRYPTO_KEY, queueCryptoSync, wpError } from "@/lib/crypto-pay";
import { portalOrderId, wooStatus } from "@/lib/portal";
import { findOrderByPortalRef } from "@/lib/portal-order-ref";

export const dynamic = "force-dynamic";

/** The request's params wherever WordPress's get_param would have found them. */
async function readParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => {
    out[k] = v;
  });
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) out[k] = String(v ?? "");
    } else if (type.includes("form")) {
      (await request.formData()).forEach((v, k) => {
        out[k] = String(v);
      });
    }
  } catch {
    // Missing or malformed body: the checks below reject it.
  }
  return out;
}

/**
 * Portal -> shop: mark a crypto order paid.
 *   POST /api/crypto-pay/v1/order-status   { order_id, status: "processing" }
 * (the plugin's /wp-json/crypto-pay/v1/order-status)
 *
 * The only transition this performs is a fully received payment. Anything
 * else is refused - the shop owns cancellation, completion and refunds - and
 * a final state is never overridden.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = await authorisePortalRequest(request);
  if (denied) return denied;

  const params = await readParams(request);
  const status = (params.status ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (status !== "processing") {
    return wpError("bad_status", "Unsupported status transition", 400);
  }

  const order = await findOrderByPortalRef((params.order_id ?? "").trim());
  if (!order || order.paymentMethodKey !== CRYPTO_KEY) {
    return wpError("not_found", "Order not found", 404);
  }

  const orderId = portalOrderId(order.orderNumber);
  const current = wooStatus(order.status);

  // Idempotent: already paid and awaiting fulfilment is a success, unchanged.
  if (current === "processing") {
    return Response.json({ success: true, order_id: orderId, order_status: current });
  }

  // Only from awaiting payment, the state this gateway leaves orders in.
  if (order.status !== "AWAITING_PAYMENT") {
    return wpError(
      "invalid_transition",
      `Order is not awaiting payment (current status: ${current}).`,
      409,
    );
  }

  // The same routine as confirming by hand: stock, points, referral, email.
  await confirmOrderPaid(order.id, {
    note: "Payment received — confirmed by crypto pay portal.",
  });
  queueCryptoSync(order.id);

  const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  return Response.json({
    success: true,
    order_id: orderId,
    order_status: wooStatus(fresh?.status ?? order.status),
  });
}
