/*
 * The coupon usage limit as the admin form shows it. Shared by the server page
 * (starting values) and the client form, so it lives outside both.
 */

export type CouponUsageMode = "unlimited" | "total" | "per_customer";

/** Which limit a saved coupon uses, for the form's starting values. */
export function usageModeOf(c: { maxRedemptions: number | null; maxPerCustomer: number | null }): {
  mode: CouponUsageMode;
  count: number | null;
} {
  if (c.maxPerCustomer != null) return { mode: "per_customer", count: c.maxPerCustomer };
  if (c.maxRedemptions != null) return { mode: "total", count: c.maxRedemptions };
  return { mode: "unlimited", count: null };
}
