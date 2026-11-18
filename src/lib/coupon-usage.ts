import { prisma } from "@/lib/prisma";

/**
 * How many times this buyer has already used a coupon: their orders that
 * carry the code, matched by email (guest orders count) or by account, and
 * not cancelled or refunded - an order that never went through gives the use
 * back.
 */
export async function couponUsesByBuyer(
  code: string,
  buyer: { email?: string | null; customerId?: string | null },
): Promise<number> {
  const email = (buyer.email ?? "").trim();
  if (!email && !buyer.customerId) return 0;

  return prisma.order.count({
    where: {
      couponCode: { equals: code, mode: "insensitive" },
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(buyer.customerId ? [{ customerId: buyer.customerId }] : []),
      ],
    },
  });
}

/**
 * The shopper-facing reason a per-customer coupon can't be used again, or null
 * when it can. With no email or account yet (a guest on the cart page) there
 * is nothing to check against; the order itself is checked at checkout, where
 * the email is always known.
 */
export async function couponUsageError(
  coupon: { code: string; maxPerCustomer: number | null },
  buyer: { email?: string | null; customerId?: string | null },
): Promise<string | null> {
  if (coupon.maxPerCustomer == null) return null;
  if (!(buyer.email ?? "").trim() && !buyer.customerId) return null;

  const used = await couponUsesByBuyer(coupon.code, buyer);
  if (used < coupon.maxPerCustomer) return null;

  return coupon.maxPerCustomer === 1
    ? "You have already used this code."
    : `This code can be used ${coupon.maxPerCustomer} times per customer, and you have already used it ${used} times.`;
}
