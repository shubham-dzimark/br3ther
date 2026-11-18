import "server-only";
import { prisma } from "@/lib/prisma";
import { couponUsageError } from "@/lib/coupon-usage";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getEmtConfig, emtAdjustmentCents } from "@/lib/emt";
import { getLoyaltyConfig, pointsToCents, referralDiscountFor } from "@/lib/loyalty";
import { getMoneyFormatter } from "@/lib/currency";
import { basketClassIds, quoteShipping } from "@/lib/shipping";
import {
  activeGiftRules,
  cheapestItemDiscount,
  earnedGifts,
  giftsWaiveShipping,
  type GiftLineInput,
} from "@/lib/gifts";

export type OrderTotals = {
  subtotalCents: number;
  shippingCents: number;
  /** The shipping method's name, for the checkout line and the order. */
  shippingName: string;
  /** Which method was used, null when it came from the old settings. */
  shippingMethodId: string | null;
  discountCents: number;
  emtAdjustmentCents: number;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  couponError: string | null;
  /** "Cheapest item free" offers the cart has earned, taken off before any code. */
  giftDiscountCents: number;
  giftDiscountLabel: string | null;
  /** True when a free-shipping gift offer is what made shipping free. */
  giftFreeShipping: boolean;
  taxLabel: string;
  /** Points actually applied (may be less than requested). */
  pointsRedeemed: number;
  pointsDiscountCents: number;
  pointsError: string | null;
  referralCode: string | null;
  referralDiscountCents: number;
  referralError: string | null;
  /** Which of the three mutually exclusive discounts actually applied. */
  appliedDiscount: "coupon" | "referral" | "points" | null;
  /** Set when a valid discount had to be dropped to keep it to one. */
  exclusiveNote: string | null;
};

/**
 * Single source of truth for order maths. The checkout page and the
 * order-placing action both call this, so what the customer is shown and what
 * gets stored can never drift apart.
 */
export async function computeTotals(
  subtotalCents: number,
  options: {
    couponCode?: string | null;
    /** Points the customer asked to spend. */
    redeemPoints?: number;
    /** Their balance, so we never spend more than they have. */
    pointsBalance?: number;
    /** A friend's referral code, which earns a fixed discount. */
    referralCode?: string | null;
    /** The buyer's own code, so nobody refers themselves. */
    ownReferralCode?: string | null;
    /** Referral codes are for account holders only. */
    signedIn?: boolean;
    /** The buyer, so a referral can be limited to one per customer. */
    customerId?: string | null;
    /** The buyer's email (typed at checkout, or the account's), for per-customer coupon limits. */
    email?: string | null;
    /** A free-shipping gift rule the cart has earned. */
    giftFreeShipping?: boolean;
    /**
     * The priced cart lines, so gift offers are settled here with everything
     * else: free shipping, "cheapest item free" and gift-only codes.
     */
    giftLines?: GiftLineInput[];
    /** The shipping method the customer picked, if any. */
    shippingMethodId?: string | null;
    /** The variants in the basket, so shipping-class costs can apply. */
    variantIds?: string[];
    /**
     * The payment gateway chosen. The e-Transfer discount or surcharge belongs
     * to e-Transfer alone; left unset (the cart estimate) it still applies.
     */
    paymentMethodKey?: string | null;
  } = {},
): Promise<OrderTotals> {
  const [settings, emt, loyalty] = await Promise.all([
    getSettings(),
    getEmtConfig(),
    getLoyaltyConfig(),
  ]);

  const taxPercent = Number(settings[SETTING_KEYS.taxPercent]) || 0;
  const taxInclusive = settings[SETTING_KEYS.taxInclusive] === "1";
  const taxLabel = settings[SETTING_KEYS.taxLabel] || "Tax";

  /*
   * Postage comes from the shipping methods - or, in a shop that has never set
   * one up, from the old flat-rate settings, which the quote falls back to.
   */
  const quote = await quoteShipping(
    {
      subtotalCents,
      classIds: options.variantIds?.length
        ? await basketClassIds(options.variantIds)
        : [],
    },
    options.shippingMethodId,
  );

  /*
   * Gift offers. A COUPON offer is earned by knowing its code, so a code that
   * exists only for a gift is accepted below rather than rejected as invalid.
   * Free shipping and "cheapest item free" come from the same evaluation the
   * cart and the order use.
   */
  const rawCode = (options.couponCode ?? "").trim().toUpperCase();
  const giftRules = options.giftLines || rawCode ? await activeGiftRules() : [];
  const earned = options.giftLines ? earnedGifts(giftRules, options.giftLines, rawCode || null) : [];
  const giftCodeMatches =
    rawCode !== "" &&
    giftRules.some(
      (r) => r.trigger === "COUPON" && (r.couponCode ?? "").trim().toUpperCase() === rawCode,
    );
  const giftFreeShipping = Boolean(options.giftFreeShipping) || giftsWaiveShipping(earned);
  const giftDiscount = cheapestItemDiscount(earned, options.giftLines ?? []);
  const giftDiscountCents = Math.min(giftDiscount.cents, subtotalCents);

  // A free-shipping gift offer wins over everything the method would charge.
  const shippingCents = giftFreeShipping ? 0 : quote.cents;

  /*
   * The welcome code is issued to a single email address by the promo popup,
   * so it is personal rather than public: usable only by a signed-in customer
   * whose own address received it, and only once. Every other coupon stays a
   * plain public code. Returns null when the code is fine to use.
   */
  let personalChecked: { code: string; error: string | null } | null = null;
  async function personalCouponError(code: string): Promise<string | null> {
    if (personalChecked && personalChecked.code === code) return personalChecked.error;

    const promoCode = (settings[SETTING_KEYS.promoPopupCoupon] ?? "").trim().toUpperCase();
    let error: string | null = null;

    if (promoCode !== "" && code.toUpperCase() === promoCode) {
      const buyer = options.customerId
        ? await prisma.customer.findUnique({
            where: { id: options.customerId },
            select: { email: true },
          })
        : null;

      if (!buyer?.email) {
        error = "Sign in with the email address this code was sent to.";
      } else {
        const issued = await prisma.newsletterSubscriber.findFirst({
          where: {
            email: buyer.email.toLowerCase(),
            couponCode: { equals: code, mode: "insensitive" },
          },
          select: { id: true },
        });

        if (!issued) {
          error = "This code was sent to a different email address.";
        } else {
          // Guest orders count too - match the address, not just the account.
          const usedBefore = await prisma.order.findFirst({
            where: {
              couponCode: { equals: code, mode: "insensitive" },
              status: { not: "CANCELLED" },
              OR: [
                ...(options.customerId ? [{ customerId: options.customerId }] : []),
                { email: buyer.email },
              ],
            },
            select: { id: true },
          });
          if (usedBefore) error = "You have already used this code.";
        }
      }
    }

    personalChecked = { code, error };
    return error;
  }

  // ---- Coupon ----
  let discountCents = 0;
  let couponCode: string | null = null;
  let couponError: string | null = null;
  const raw = rawCode;

  if (raw) {
    const coupon = await prisma.coupon.findUnique({ where: { code: raw } });
    const now = new Date();
    // Uses per customer, counted by email and account from their past orders.
    const usageError =
      coupon?.isActive && coupon.maxPerCustomer != null
        ? await couponUsageError(coupon, {
            email: options.email ?? null,
            customerId: options.customerId ?? null,
          })
        : null;

    if ((!coupon || !coupon.isActive) && giftCodeMatches) {
      // A gift-only code: nothing comes off the price, the gift is the reward.
      couponCode = raw;
    } else if (!coupon || !coupon.isActive) {
      couponError = "That code isn't valid.";
    } else if (coupon.startsAt && coupon.startsAt > now) {
      couponError = "That code isn't active yet.";
    } else if (coupon.endsAt && coupon.endsAt < now) {
      couponError = "That code has expired.";
    } else if (
      coupon.maxRedemptions != null &&
      coupon.timesRedeemed >= coupon.maxRedemptions
    ) {
      couponError = "That code has been fully redeemed.";
    } else if (usageError) {
      couponError = usageError;
    } else if (await personalCouponError(coupon.code)) {
      // Ownership is checked before the subtotal minimum: telling someone to
      // spend more on a code they can never use would be misleading.
      couponError = await personalCouponError(coupon.code);
    } else if (subtotalCents < coupon.minSubtotalCents) {
      // Name the threshold and the shortfall - "below the minimum" alone gives
      // the shopper nothing to act on.
      const fmt = await getMoneyFormatter();
      couponError = `This code needs a ${fmt.format(
        coupon.minSubtotalCents,
      )} order — add ${fmt.format(coupon.minSubtotalCents - subtotalCents)} more.`;
    } else {
      // Worked out on what is left after any "cheapest item free" offer.
      const base = subtotalCents - giftDiscountCents;
      discountCents =
        coupon.type === "PERCENT"
          ? Math.round((base * coupon.value) / 100)
          : Math.min(coupon.value, base);
      couponCode = coupon.code;
    }
  }

  // ---- Referral code (a friend's code buys a fixed discount) ----
  let referralCode: string | null = null;
  let referralDiscountCents = 0;
  let referralError: string | null = null;
  const rawReferral = (options.referralCode ?? "").trim().toUpperCase();

  if (rawReferral) {
    // Guests can't claim a referral: there's no account to attribute the
    // referral to, so the referrer could never be paid for it.
    if (!options.signedIn) {
      referralError = "SIGN_IN";
    } else if (
      options.ownReferralCode &&
      rawReferral === options.ownReferralCode.toUpperCase()
    ) {
      referralError = "You can't use your own referral code.";
    } else {
      const referrer = await prisma.customer.findUnique({
        where: { referralCode: rawReferral },
        select: { id: true },
      });

      /*
       * A referral is a one-off welcome discount, not a reusable coupon. It was
       * applying on every order, so the same code could be redeemed again and
       * again. `Customer.referredByCode` is stamped the first time one is used,
       * and past orders are checked too in case that stamp was ever missed.
       */
      let alreadyUsed = false;
      if (options.customerId) {
        const buyer = await prisma.customer.findUnique({
          where: { id: options.customerId },
          select: { referredByCode: true, email: true },
        });

        // Two records exist: the stamp on the customer, and the referral event
        // raised for the referrer. Either one means the discount was claimed.
        const priorEvent = buyer?.email
          ? await prisma.referralEvent.findFirst({
              where: {
                referredEmail: buyer.email,
                status: { not: "CANCELLED" },
              },
              select: { id: true },
            })
          : null;

        alreadyUsed = Boolean(buyer?.referredByCode) || Boolean(priorEvent);
      }

      if (!referrer) {
        referralError = "That referral code isn't valid.";
      } else if (referrer.id === options.customerId) {
        referralError = "You can't use your own referral code.";
      } else if (alreadyUsed) {
        referralError = "ALREADY_USED";
      } else {
        const outcome = referralDiscountFor(subtotalCents, loyalty);
        if (outcome.error === "MIN_SPEND") {
          referralError = "MIN_SPEND";
        } else {
          referralDiscountCents = outcome.discountCents;
          referralCode = rawReferral;
        }
      }
    }
  }

  // ---- Loyalty points ----
  let pointsRedeemed = 0;
  let pointsDiscountCents = 0;
  let pointsError: string | null = null;
  const wanted = Math.max(0, Math.floor(options.redeemPoints ?? 0));

  if (wanted > 0) {
    const balance = Math.max(0, options.pointsBalance ?? 0);

    if (!loyalty.enabled) {
      pointsError = "Points aren't available right now.";
    } else if (wanted > balance) {
      pointsError = "That's more points than you have.";
    } else if (wanted < loyalty.minRedeemPoints) {
      pointsError = `Redeem at least ${loyalty.minRedeemPoints} points.`;
    } else {
      // Cap the discount at the configured share of the subtotal. The other
      // two discounts aren't subtracted first - only one of the three can win,
      // so they never stack.
      const ceilingCents = Math.floor(
        subtotalCents * (loyalty.maxDiscountPercent / 100),
      );
      const requestedCents = pointsToCents(wanted, loyalty);
      pointsDiscountCents = Math.max(0, Math.min(requestedCents, ceilingCents));
      // Only charge the points actually used.
      pointsRedeemed = Math.min(
        wanted,
        Math.ceil((pointsDiscountCents / 100) * loyalty.redeemRate),
      );
      if (pointsDiscountCents < requestedCents) {
        pointsError = "Capped at the maximum points discount for this order.";
      }
    }
  }

  /*
   * ---- One discount per order ----
   *
   * Coupon, referral and points are mutually exclusive. All three are validated
   * above so the customer still sees why an individual code was rejected; here
   * we keep only the one worth the most, rather than picking by an arbitrary
   * precedence that could hand them the worse deal.
   */
  const candidates = [
    { kind: "coupon" as const, cents: discountCents },
    { kind: "referral" as const, cents: referralDiscountCents },
    { kind: "points" as const, cents: pointsDiscountCents },
  ].filter((c) => c.cents > 0);

  let appliedDiscount: "coupon" | "referral" | "points" | null = null;
  let exclusiveNote: string | null = null;

  if (candidates.length > 0) {
    const winner = candidates.reduce((a, b) => (b.cents > a.cents ? b : a));
    appliedDiscount = winner.kind;

    if (candidates.length > 1) {
      const LABEL = {
        coupon: "discount code",
        referral: "referral code",
        points: "points",
      } as const;
      exclusiveNote = `Only one discount can be used per order, so we applied your ${LABEL[winner.kind]} — it saves you the most.`;
    }

    if (winner.kind !== "coupon") {
      discountCents = 0;
      // A code that also unlocks a gift stays applied for the gift.
      if (!giftCodeMatches) couponCode = null;
    }
    if (winner.kind !== "referral") {
      referralDiscountCents = 0;
      referralCode = null;
    }
    if (winner.kind !== "points") {
      pointsDiscountCents = 0;
      pointsRedeemed = 0;
      // A cap warning is meaningless once the points weren't used at all.
      if (pointsError?.startsWith("Capped")) pointsError = null;
    }
  }

  // ---- EMT discount / surcharge ----
  // Positive adjustPercent reduces the total, negative adds to it.
  const emtAdjust =
    !options.paymentMethodKey || options.paymentMethodKey === "emt"
      ? emtAdjustmentCents(subtotalCents, emt)
      : 0;

  /*
   * Postage joins the taxable base only when the method says it is taxable -
   * Woo's "Tax status" on a shipping method, which is the whole reason that
   * field exists.
   */
  const taxableBase = Math.max(
    0,
    subtotalCents -
      giftDiscountCents -
      discountCents -
      referralDiscountCents -
      pointsDiscountCents -
      emtAdjust +
      (quote.taxable ? shippingCents : 0),
  );

  const taxCents =
    taxPercent <= 0
      ? 0
      : taxInclusive
        ? // Price already includes tax: break it out rather than adding on top.
          Math.round(taxableBase - taxableBase / (1 + taxPercent / 100))
        : Math.round((taxableBase * taxPercent) / 100);

  const totalCents =
    (taxInclusive ? taxableBase : taxableBase + taxCents) +
    // Untaxed postage is still payable; it simply sat out of the tax sum.
    (quote.taxable ? 0 : shippingCents);

  return {
    subtotalCents,
    shippingCents,
    shippingName: giftFreeShipping ? "Free shipping" : quote.name,
    shippingMethodId: quote.methodId,
    discountCents,
    emtAdjustmentCents: emtAdjust,
    taxCents,
    totalCents: Math.max(0, totalCents),
    couponCode,
    couponError,
    giftDiscountCents,
    giftDiscountLabel: giftDiscountCents > 0 ? giftDiscount.label : null,
    giftFreeShipping,
    taxLabel,
    pointsRedeemed,
    pointsDiscountCents,
    pointsError,
    referralCode,
    referralDiscountCents,
    referralError,
    appliedDiscount,
    exclusiveNote,
  };
}
