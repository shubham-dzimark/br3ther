import "server-only";
import { prisma } from "@/lib/prisma";
import { portalOrderId } from "@/lib/portal";

/**
 * Find an order from the reference a payment portal sends back.
 *
 * Portals built against WooCommerce know an order by a number - the trailing
 * digits we pushed as order_id - not by our order reference. The reference and
 * the internal id are tried first (manual calls use them), then the digits.
 */
export async function findOrderByPortalRef(ref: string) {
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
  const hit = candidates.find((o) => portalOrderId(o.orderNumber) === asNumber);
  return hit ? prisma.order.findUnique({ where: { id: hit.id } }) : null;
}
