import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Loyalty points, ported from the vicetrip WooCommerce scheme:
 * earn N points per unit of currency spent, redeem at M points per unit,
 * plus a one-time signup bonus.
 */
export type LoyaltyConfig = {
  enabled: boolean;
  earnRate: number;
  redeemRate: number;
  signupBonusPoints: number;
  minRedeemPoints: number;
  maxDiscountPercent: number;
  referralPoints: number;
  referralMinSpendCents: number;
  referralFriendDiscountCents: number;
};

export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  const s = await getSettings();
  return {
    enabled: s[SETTING_KEYS.loyaltyEnabled] === "1",
    earnRate: Math.max(0, Number(s[SETTING_KEYS.loyaltyEarnRate]) || 0),
    // Guard against 0 - it is a divisor.
    redeemRate: Math.max(1, Number(s[SETTING_KEYS.loyaltyRedeemRate]) || 10),
    signupBonusPoints: Math.max(0, Number(s[SETTING_KEYS.loyaltySignupBonus]) || 0),
    minRedeemPoints: Math.max(0, Number(s[SETTING_KEYS.loyaltyMinRedeem]) || 0),
    maxDiscountPercent: Math.min(
      100,
      Math.max(0, Number(s[SETTING_KEYS.loyaltyMaxDiscountPercent]) || 100),
    ),
    referralPoints: Math.max(0, Number(s[SETTING_KEYS.loyaltyReferralPoints]) || 0),
    referralMinSpendCents: Math.max(0, Number(s[SETTING_KEYS.referralMinSpendCents]) || 0),
    referralFriendDiscountCents: Math.max(
      0,
      Number(s[SETTING_KEYS.referralFriendDiscountCents]) || 0,
    ),
  };
}

/** Cash value of a points balance, in cents. */
export function pointsToCents(points: number, config: LoyaltyConfig): number {
  if (points <= 0) return 0;
  return Math.round((points / config.redeemRate) * 100);
}

/** Points earned by spending this many cents. */
export function centsToPoints(cents: number, config: LoyaltyConfig): number {
  if (cents <= 0 || config.earnRate <= 0) return 0;
  return Math.floor((cents / 100) * config.earnRate);
}

/**
 * One-time signup bonus. Guarded by a flag on the customer so a repeated
 * call - or a second registration attempt - can't award it twice.
 */
export async function awardSignupBonus(customerId: string): Promise<number> {
  const config = await getLoyaltyConfig();
  if (!config.enabled || config.signupBonusPoints <= 0) return 0;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { signupBonusAwarded: true },
  });
  if (!customer || customer.signupBonusAwarded) return 0;

  await prisma.$transaction([
    prisma.loyaltyTransaction.create({
      data: {
        customerId,
        points: config.signupBonusPoints,
        type: "EARNED",
        note: "Signup bonus",
      },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        pointsBalance: { increment: config.signupBonusPoints },
        signupBonusAwarded: true,
      },
    }),
  ]);

  return config.signupBonusPoints;
}

/** Points earned once an order is actually paid for. */
export async function awardOrderPoints(orderId: string): Promise<number> {
  const config = await getLoyaltyConfig();
  if (!config.enabled || config.earnRate <= 0) return 0;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customerId: true,
      subtotalCents: true,
      customer: { select: { passwordHash: true } },
    },
  });
  if (!order?.customerId) return 0;
  /*
   * Points are for registered accounts only. A guest checkout still keeps a
   * customer record (for order history and the claim-your-account link), but
   * it has no password and earns nothing. Someone who creates an account
   * before the payment is confirmed earns on that order, as a member.
   */
  if (!order.customer?.passwordHash) return 0;

  // Don't pay twice for the same order.
  const already = await prisma.loyaltyTransaction.findFirst({
    where: { orderId: order.id, type: "EARNED" },
    select: { id: true },
  });
  if (already) return 0;

  const points = centsToPoints(order.subtotalCents, config);
  if (points <= 0) return 0;

  await prisma.$transaction([
    prisma.loyaltyTransaction.create({
      data: {
        customerId: order.customerId,
        points,
        type: "EARNED",
        note: "Order reward",
        orderId: order.id,
      },
    }),
    prisma.customer.update({
      where: { id: order.customerId },
      data: { pointsBalance: { increment: points } },
    }),
  ]);

  return points;
}


/**
 * Spend points on an order. Returns the points actually debited.
 *
 * The balance is read and debited inside one transaction, and the debit is
 * conditional on the balance still being sufficient. Reading first and
 * debiting afterwards let two checkouts started together both see the same
 * balance and each spend it, taking the account negative.
 *
 * A caller that receives less than it asked for must price the order on the
 * returned figure, not on what it requested.
 */
export async function redeemPointsForOrder(
  customerId: string,
  orderId: string,
  points: number,
): Promise<number> {
  if (points <= 0) return 0;

  try {
    return await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { pointsBalance: true },
      });
      const spend = Math.min(points, customer?.pointsBalance ?? 0);
      if (spend <= 0) return 0;

      /*
       * Conditional debit: the row only changes while it still holds enough.
       * A competing transaction that got there first leaves this one matching
       * nothing, and it reports zero rather than overdrawing.
       */
      const { count } = await tx.customer.updateMany({
        where: { id: customerId, pointsBalance: { gte: spend } },
        data: { pointsBalance: { decrement: spend } },
      });
      if (count !== 1) return 0;

      await tx.loyaltyTransaction.create({
        data: {
          customerId,
          points: -spend,
          type: "REDEEMED",
          note: "Redeemed at checkout",
          orderId,
        },
      });

      return spend;
    });
  } catch {
    // A serialisation failure means someone else won; spending nothing is the
    // safe outcome, and the order is then priced without a discount.
    return 0;
  }
}

/** Give points back when an order is cancelled or refunded. */
export async function restoreRedeemedPoints(orderId: string): Promise<number> {
  const redeemed = await prisma.loyaltyTransaction.findFirst({
    where: { orderId, type: "REDEEMED" },
  });
  if (!redeemed) return 0;

  const alreadyBack = await prisma.loyaltyTransaction.findFirst({
    where: { orderId, type: "ADJUSTED", note: "Redeemed points restored" },
  });
  if (alreadyBack) return 0;

  const points = Math.abs(redeemed.points);
  await prisma.$transaction([
    prisma.loyaltyTransaction.create({
      data: {
        customerId: redeemed.customerId,
        points,
        type: "ADJUSTED",
        note: "Redeemed points restored",
        orderId,
      },
    }),
    prisma.customer.update({
      where: { id: redeemed.customerId },
      data: { pointsBalance: { increment: points } },
    }),
  ]);
  return points;
}

/**
 * Pay the referrer once the referred customer's order is confirmed paid.
 * Rewarding on payment rather than on signup is what stops the scheme being
 * farmed with throwaway accounts.
 */
export async function rewardReferralForOrder(orderId: string): Promise<number> {
  const config = await getLoyaltyConfig();
  if (!config.enabled || config.referralPoints <= 0) return 0;

  const event = await prisma.referralEvent.findFirst({
    where: { orderId, status: "PENDING" },
  });
  if (!event) return 0;

  // A guest record (no account) never collects points - as a referrer either.
  const referrer = await prisma.customer.findUnique({
    where: { id: event.referrerId },
    select: { passwordHash: true },
  });
  if (!referrer?.passwordHash) return 0;

  await prisma.$transaction([
    prisma.loyaltyTransaction.create({
      data: {
        customerId: event.referrerId,
        points: config.referralPoints,
        type: "EARNED",
        note: `Referral reward (${event.referredEmail})`,
        orderId,
      },
    }),
    prisma.customer.update({
      where: { id: event.referrerId },
      data: { pointsBalance: { increment: config.referralPoints } },
    }),
    prisma.referralEvent.update({
      where: { id: event.id },
      data: {
        status: "REWARDED",
        rewardCents: Math.round((config.referralPoints / config.redeemRate) * 100),
      },
    }),
  ]);

  return config.referralPoints;
}


/**
 * A customer earns the right to share their code once they've actually spent
 * the threshold. Without this the scheme is just free money for new signups.
 */
export async function hasUnlockedReferralCode(customerId: string): Promise<boolean> {
  const config = await getLoyaltyConfig();
  if (config.referralMinSpendCents <= 0) return true;

  const spent = await prisma.order.aggregate({
    _sum: { totalCents: true },
    where: {
      customerId,
      status: { in: ["PAYMENT_RECEIVED", "PROCESSING", "SHIPPED", "DELIVERED"] },
    },
  });
  return (spent._sum.totalCents ?? 0) >= config.referralMinSpendCents;
}

/** How much a friend's qualifying order gets off. */
export function referralDiscountFor(
  subtotalCents: number,
  config: LoyaltyConfig,
): { discountCents: number; error: string | null } {
  if (config.referralFriendDiscountCents <= 0) {
    return { discountCents: 0, error: null };
  }
  if (subtotalCents < config.referralMinSpendCents) {
    return { discountCents: 0, error: "MIN_SPEND" };
  }
  return {
    discountCents: Math.min(config.referralFriendDiscountCents, subtotalCents),
    error: null,
  };
}
