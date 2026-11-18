"use server";

import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { sendWelcomeCodeEmail } from "@/lib/order-mail";
import { notifyAdmins } from "@/lib/notifications";
import { rememberShopperEmail } from "@/lib/shopper-email";

export type SubscribeResult =
  | { ok: true; couponCode: string | null; message: string }
  | { ok: false; error: string };

/** Simple, deliberately permissive check - the real test is a deliverable send. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/*
 * The configured welcome code, but only if it actually exists and is live.
 * Advertising a code the checkout would then reject is worse than showing no
 * code at all. Shared by the popup and the footer so the two can never hand
 * out different offers.
 */
async function liveCouponCode(
  settings: Record<string, string>,
): Promise<string | null> {
  const configured = (settings[SETTING_KEYS.promoPopupCoupon] ?? "").trim().toUpperCase();
  if (!configured) return null;

  const coupon = await prisma.coupon.findUnique({ where: { code: configured } });
  const now = new Date();
  const usable =
    coupon &&
    coupon.isActive &&
    (!coupon.startsAt || coupon.startsAt <= now) &&
    (!coupon.endsAt || coupon.endsAt >= now) &&
    (coupon.maxRedemptions == null || coupon.timesRedeemed < coupon.maxRedemptions);

  return usable ? coupon.code : null;
}

/**
 * What the shopper sees after signing up. The saved success line talks about
 * a code ("Here's your code - it's waiting at checkout"), so it is only used
 * when a welcome code was actually handed out; otherwise a plain confirmation.
 */
function signupMessage(settings: Awaited<ReturnType<typeof getSettings>>, couponCode: string | null): string {
  if (couponCode) {
    return settings[SETTING_KEYS.promoPopupSuccess] || "You're in. Check your inbox for your offer.";
  }
  return "You're in. Thanks for joining - offers and new arrivals will come straight to your inbox.";
}

export async function subscribeToPromo(email: string): Promise<SubscribeResult> {
  const settings = await getSettings();
  if (settings[SETTING_KEYS.promoPopupEnabled] !== "1") {
    return { ok: false, error: "This offer isn't running right now." };
  }

  const clean = email.trim().toLowerCase();
  if (!looksLikeEmail(clean) || clean.length > 200) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const couponCode = await liveCouponCode(settings);

  // Re-submitting the same address is a no-op that still returns the code,
  // so a customer who closed the tab isn't locked out of their own offer.
  await prisma.newsletterSubscriber.upsert({
    where: { email: clean },
    update: { couponCode: couponCode ?? undefined },
    create: { email: clean, source: "promo_popup", couponCode },
  });
  // Lets an abandoned basket from this visitor get a reminder - see lib/shopper-email.
  await rememberShopperEmail(clean);

  // The success message shows the code, but that vanishes with the tab -
  // emailing it is what makes the offer survive until they come back to buy.
  if (couponCode) void sendWelcomeCodeEmail(clean, couponCode).catch(() => {});

  await notifyAdmins({
    type: "NEWSLETTER_SIGNUP",
    title: "New signup from the welcome popup",
    body: clean,
    href: "/admin/content/promo-popup",
  });

  return {
    ok: true,
    couponCode,
    message: signupMessage(settings, couponCode),
  };
}

/**
 * Spin & Win signup.
 *
 * Deliberately NOT subscribeToPromo: that one refuses whenever the welcome
 * popup is switched off, which has nothing to do with the wheel. Wiring the
 * wheel to it meant every address a spinner typed was silently discarded.
 *
 * It also does not hand out the welcome coupon - the spinner already won a
 * code from the wheel, and giving them a second one is not what the shop
 * asked for.
 */
export async function subscribeFromSpin(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!looksLikeEmail(clean) || clean.length > 200) return;

  await prisma.newsletterSubscriber.upsert({
    where: { email: clean },
    update: {},
    create: { email: clean, source: "spin_win" },
  });
  // Lets an abandoned basket from this visitor get a reminder - see lib/shopper-email.
  await rememberShopperEmail(clean);

  await notifyAdmins({
    type: "NEWSLETTER_SIGNUP",
    title: "New signup from Spin & Win",
    body: clean,
    href: "/admin/content/spin-win",
  });
}

/**
 * Footer subscribe box. Deliberately separate from subscribeToPromo: that one
 * refuses when the welcome popup is switched off, which has nothing to do with
 * whether the footer form should work.
 */
export async function subscribeFromFooter(email: string): Promise<SubscribeResult> {
  const settings = await getSettings();

  const clean = email.trim().toLowerCase();
  if (!looksLikeEmail(clean) || clean.length > 200) {
    return { ok: false, error: "Enter a valid email address." };
  }

  /*
   * Same offer as the popup. Storing the code here matters beyond the message:
   * the checkout only accepts the welcome code from an address that has it on
   * its subscriber row, so a footer signup without one could never redeem.
   */
  const couponCode = await liveCouponCode(settings);

  await prisma.newsletterSubscriber.upsert({
    where: { email: clean },
    update: { couponCode: couponCode ?? undefined },
    create: { email: clean, source: "footer", couponCode },
  });
  // Lets an abandoned basket from this visitor get a reminder - see lib/shopper-email.
  await rememberShopperEmail(clean);

  if (couponCode) void sendWelcomeCodeEmail(clean, couponCode).catch(() => {});

  await notifyAdmins({
    type: "NEWSLETTER_SIGNUP",
    title: "New newsletter signup",
    body: clean,
    href: "/admin/content/promo-popup",
  });

  return {
    ok: true,
    couponCode,
    message: signupMessage(settings, couponCode),
  };
}
