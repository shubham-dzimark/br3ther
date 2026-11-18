import { authorisePortalRequest, CRYPTO_KEY, ymdhis, wpError } from "@/lib/crypto-pay";
import { portalOrderId, wooStatus } from "@/lib/portal";
import { findOrderByPortalRef } from "@/lib/portal-order-ref";
import { getTimeZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Portal -> shop: the latest data for one order, for the portal's refresh.
 *   GET /api/crypto-pay/v1/order?order_id=<id>
 * (the plugin's /wp-json/crypto-pay/v1/order)
 *
 * Limited to crypto orders: the portal has no business reading the rest.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = await authorisePortalRequest(request);
  if (denied) return denied;

  const ref = (new URL(request.url).searchParams.get("order_id") ?? "").trim();
  const order = await findOrderByPortalRef(ref);
  if (!order || order.paymentMethodKey !== CRYPTO_KEY) {
    return wpError("not_found", "Order not found", 404);
  }

  return Response.json({
    success: true,
    data: {
      order_id: portalOrderId(order.orderNumber),
      customer_name: order.shipName.trim(),
      customer_email: order.email,
      order_amount: (order.totalCents / 100).toFixed(2),
      order_status: wooStatus(order.status),
      order_date: ymdhis(order.createdAt, await getTimeZone()),
    },
  });
}
