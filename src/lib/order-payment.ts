import "server-only";
import { orderNo } from "@/lib/order-display";
import { prisma } from "@/lib/prisma";
import { issueCardsForOrder, reverseGiftCardsForOrder, sendGiftCardEmails } from "@/lib/gift-cards";
import { formatGiftCardCode } from "@/lib/gift-card-core";
import { notifyAdmins } from "@/lib/notifications";
import {
  awardOrderPoints,
  restoreRedeemedPoints,
  rewardReferralForOrder,
} from "@/lib/loyalty";
import { queueOrderMail, sendPaymentReceivedEmail } from "@/lib/order-mail";
import { kickSortlySync, recordSortlyChanges } from "@/lib/sortly/outbox";
import { activateNextOrderCoupon } from "@/lib/upsell-campaigns";

/**
 * The single place an order becomes "paid".
 *
 * There used to be three routes to a paid status - the Confirm payment button,
 * the status dropdown, and the portal callback - and only two of them awarded
 * points or decremented stock. An order moved to PAYMENT_RECEIVED from the
 * dropdown silently skipped the customer's reward. Everything now funnels
 * through here so the side effects cannot drift apart again.
 *
 * Idempotent: safe to call on an order that is already confirmed.
 */

/** Statuses that mean the money is in. */
/** Cancelled and refunded orders hold no stock, whatever their history. */
export const TERMINAL = ["CANCELLED", "REFUNDED", "FAILED"] as const;

export const PAID_STATUSES = [
  "PAYMENT_RECEIVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

export type PaidStatus = (typeof PAID_STATUSES)[number];

export function isPaidStatus(status: string): status is PaidStatus {
  return (PAID_STATUSES as readonly string[]).includes(status);
}

export type ConfirmResult = {
  changed: boolean;
  pointsAwarded: number;
  referralPoints: number;
  reason?: string;
};

export async function confirmOrderPaid(
  orderId: string,
  options: {
    status?: PaidStatus;
    adminId?: string | null;
    emtSenderEmail?: string | null;
    emtReference?: string | null;
    note?: string | null;
  } = {},
): Promise<ConfirmResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { variantId: true, quantity: true } } },
  });
  if (!order) return { changed: false, pointsAwarded: 0, referralPoints: 0, reason: "not_found" };


  const status = options.status ?? "PROCESSING";

  /*
   * paymentConfirmedAt - not the status - is the record of "we already did the
   * side effects", so re-confirming or moving PAYMENT_RECEIVED -> SHIPPED can
   * never decrement stock a second time.
   *
   * Which request performs those side effects is decided by a conditional
   * update inside the transaction, not by the read above. Two confirmations
   * arriving together (an admin clicking while the payment portal calls back,
   * say) both saw paymentConfirmedAt as null under the old code and both
   * decremented stock. Now exactly one update matches `paymentConfirmedAt:
   * null` and the other is told the work was already done.
   */
  /*
   * Whether this order is currently holding stock.
   *
   * paymentConfirmedAt alone is not that answer, and treating it as one was a
   * real defect: cancelling gives the stock back but keeps the timestamp, so a
   * cancelled-then-reopened order looked "already confirmed", never re-took
   * its stock, and gave the same units back again on the next cancel - 100 to
   * 103 across one lifecycle.
   *
   * Stock is held exactly when payment has been confirmed AND the order has
   * not been cancelled or refunded since.
   */
  const alreadyConfirmed = order.paymentConfirmedAt !== null;
  // A cancelled or refunded order being brought back to life.
  const reopening = (TERMINAL as readonly string[]).includes(order.status);
  const holdsStock =
    alreadyConfirmed && !(TERMINAL as readonly string[]).includes(order.status);
  let claimedByThisCall = false;
  let sortlyVariantIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    /*
     * The claim covers the stock movement and the confirmation stamp. It
     * deliberately does not carry the status: folding the two together meant
     * an already-paid order could never be moved on to SHIPPED, because the
     * claim no longer matched and the status write was skipped with it.
     *
     * The precondition is "not currently holding stock", so reopening a
     * cancelled order takes its stock back rather than silently skipping.
     */
    if (!holdsStock) {
      const { count } = await tx.order.updateMany({
        where: {
          id: orderId,
          OR: [{ paymentConfirmedAt: null }, { status: { in: [...TERMINAL] } }],
        },
        data: {
          paymentConfirmedAt: order.paymentConfirmedAt ?? new Date(),
          paymentConfirmedBy:
            order.paymentConfirmedBy ?? options.adminId ?? null,
        },
      });
      claimedByThisCall = count === 1;
    }

    // The requested status always applies. Writing it twice is harmless; not
    // writing it at all strands the order.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        emtSenderEmail: options.emtSenderEmail?.trim() || order.emtSenderEmail,
        emtReference: options.emtReference?.trim() || order.emtReference,
        staffNote: options.note
          ? [order.staffNote, options.note].filter(Boolean).join("\n")
          : order.staffNote,
      },
    });

    if (claimedByThisCall) {
      // Deliberately not done at checkout: unpaid orders must not hold stock.
      const byVariant = new Map<string, number>();
      for (const item of order.items) {
        if (!item.variantId) continue;
        byVariant.set(item.variantId, (byVariant.get(item.variantId) ?? 0) + item.quantity);
      }
      /*
       * Only options that actually count their stock. Decrementing an
       * untracked option drove its count negative for no reason, and the
       * inventory screen then read it as a deficit.
       */
      const counted = await tx.productVariant.findMany({
        where: { id: { in: [...byVariant.keys()] }, manageStock: true },
        select: { id: true },
      });
      for (const { id } of counted) {
        await tx.productVariant.update({
          where: { id },
          data: { stock: { decrement: byVariant.get(id) ?? 0 } },
        });
      }
      // The same sale, queued for linked Sortly items in this transaction.
      sortlyVariantIds = await recordSortlyChanges(
        tx,
        new Map(counted.map(({ id }) => [id, -(byVariant.get(id) ?? 0)])),
        "order paid",
        orderId,
      );
    }
  });
  kickSortlySync(sortlyVariantIds);

  if (!claimedByThisCall) {
    return { changed: false, pointsAwarded: 0, referralPoints: 0, reason: "already_confirmed" };
  }

  /*
   * Past the alreadyConfirmed guard, so the customer is told once however the
   * payment was confirmed - the button, the status dropdown, or a row action
   * on the list - and never twice for a later SHIPPED move.
   */
  queueOrderMail(sendPaymentReceivedEmail, orderId);

  /*
   * Reopened after a cancel that returned a gift card's amount to the card:
   * the card can be spent again, so that money is now owed. Staff are told,
   * plainly, rather than the order shipping half-paid.
   */
  if (reopening && order.giftCardRedeemedCents > 0) {
    const card = order.giftCardRedeemedId
      ? await prisma.giftCard.findUnique({ where: { id: order.giftCardRedeemedId }, select: { code: true } })
      : null;
    const amount = `$${(order.giftCardRedeemedCents / 100).toFixed(2)}`;
    const note = `Reopened after a cancel: the ${amount} this order took from gift card ${
      card ? formatGiftCardCode(card.code) : ""
    } went back to the card when it was cancelled. Collect ${amount} from the customer before shipping.`;
    const current = await prisma.order.findUnique({ where: { id: orderId }, select: { staffNote: true } });
    await prisma.order.update({
      where: { id: orderId },
      data: { staffNote: [current?.staffNote, note].filter(Boolean).join("\n") },
    });
  }

  /*
   * Gift cards bought on this order become spendable now, and go out by
   * email. Issuing is idempotent and only returns cards this call activated,
   * so each card is emailed once. A mail failure must not undo a payment.
   */
  const issued = await issueCardsForOrder(orderId);
  if (issued.length) {
    await sendGiftCardEmails(issued).catch((err) =>
      console.error(`[giftcards] email for order ${orderId} failed:`, err),
    );
  }

  // Rewards are earned on confirmed money. Both are individually idempotent.
  await notifyAdmins({
    type: "PAYMENT_CONFIRMED",
    title: `Payment received for ${orderNo(order.orderNumber)}`,
    body: order.shipName,
    href: `/admin/orders/${orderId}`,
  });

  const pointsAwarded = await awardOrderPoints(orderId);
  const referralPoints = await rewardReferralForOrder(orderId);
  // A next-order coupon this order earned becomes usable now it is paid.
  await activateNextOrderCoupon(orderId);

  return { changed: true, pointsAwarded, referralPoints };
}

/** Cancelling or refunding hands any spent points back. */
/**
 * Cancel or refund an order and undo what confirming it did.
 *
 * Performs the status transition itself, so the reversal and the state change
 * cannot come apart. The transition is conditional on the order not already
 * being cancelled or refunded, which makes the whole thing idempotent: a
 * second cancel matches no row and restores nothing twice.
 *
 * Stock is restored only when the order had actually been confirmed - an
 * unpaid order never held any. Points are handled by restoreRedeemedPoints,
 * which carries its own already-restored guard.
 *
 * Returns whether this call performed the reversal.
 */
export async function reverseOrderPayment(
  orderId: string,
  status: "CANCELLED" | "REFUNDED" | "FAILED" = "CANCELLED",
): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      paymentConfirmedAt: true,
      status: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
  if (!order) return false;

  // Same invariant as confirmOrderPaid: stock is held only while a confirmed
  // order has not been cancelled or refunded.
  const holdsStock =
    order.paymentConfirmedAt !== null &&
    !(TERMINAL as readonly string[]).includes(order.status);

  let sortlyVariantIds: string[] = [];
  const reversed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: { notIn: [...TERMINAL] } },
      data: { status },
    });
    if (count !== 1) return false;

    if (holdsStock) {
      const byVariant = new Map<string, number>();
      for (const item of order.items) {
        if (!item.variantId) continue;
        byVariant.set(item.variantId, (byVariant.get(item.variantId) ?? 0) + item.quantity);
      }
      for (const [variantId, quantity] of byVariant) {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { stock: { increment: quantity } },
        });
      }
      sortlyVariantIds = await recordSortlyChanges(
        tx,
        byVariant,
        status === "REFUNDED" ? "order refunded" : status === "FAILED" ? "order failed" : "order cancelled",
        orderId,
      );
    }
    return true;
  });

  if (reversed) kickSortlySync(sortlyVariantIds);
  if (reversed) await restoreRedeemedPoints(orderId);
  if (reversed) {
    // Give back what a card paid toward this order; void the cards it bought.
    const cards = await reverseGiftCardsForOrder(orderId);
    if (cards.partlySpent.length) {
      const note = `Gift card(s) bought on this order were already partly used before it was cancelled: ${cards.partlySpent
        .map(formatGiftCardCode)
        .join(", ")}. The unused balance was voided.`;
      const current = await prisma.order.findUnique({ where: { id: orderId }, select: { staffNote: true } });
      await prisma.order.update({
        where: { id: orderId },
        data: { staffNote: [current?.staffNote, note].filter(Boolean).join("\n") },
      });
    }
  }
  return reversed;
}
