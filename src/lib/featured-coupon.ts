import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/*
 * The one promo code featured on the cart and checkout ("Use code SAVE30 for
 * 30% off everything" with an Apply button). Chosen on the admin Coupons page.
 *
 * Shown only while the coupon could actually be used - active, inside its
 * dates, not used up - and never for the welcome code the popup hands to one
 * email address, which is personal rather than public.
 */

export type FeaturedCoupon = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minSubtotalCents: number;
};

type CouponLike = {
  code: string;
  type: string;
  value: number;
  minSubtotalCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
};

/** Can this coupon be featured right now? Pure, for tests. */
export function featurable(c: CouponLike | null, now: Date, personalCode = ""): c is CouponLike {
  if (!c || !c.isActive) return false;
  if (c.startsAt && c.startsAt > now) return false;
  if (c.endsAt && c.endsAt < now) return false;
  if (c.maxRedemptions != null && c.timesRedeemed >= c.maxRedemptions) return false;
  if (personalCode && c.code.toUpperCase() === personalCode.trim().toUpperCase()) return false;
  return true;
}

export async function getFeaturedCoupon(now = new Date()): Promise<FeaturedCoupon | null> {
  const settings = await getSettings();
  const code = (settings[SETTING_KEYS.checkoutFeaturedCoupon] ?? "").trim().toUpperCase();
  if (!code) return null;
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!featurable(coupon, now, settings[SETTING_KEYS.promoPopupCoupon] ?? "")) return null;
  return {
    code: coupon.code,
    type: coupon.type === "FIXED" ? "FIXED" : "PERCENT",
    value: coupon.value,
    minSubtotalCents: coupon.minSubtotalCents,
  };
}
