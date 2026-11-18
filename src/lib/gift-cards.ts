import "server-only";
import { prisma } from "@/lib/prisma";
import type { GiftCard, Prisma } from "@/generated/prisma";
import {
  formatGiftCardCode,
  generateGiftCardCode,
  normalizeGiftCardCode,
  type GiftCardDetails,
} from "@/lib/gift-card-core";
import { getMailConfig, sendMail } from "@/lib/mail";
import { giftCardEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Gift card balances.
 *
 * Every change to a balance is a GiftCardTransaction row written in the same
 * database transaction as the balance itself. The (card, kind, order) unique
 * key on those rows is what makes confirming a payment twice, or cancelling
 * an order twice, change nothing the second time: the second insert clashes,
 * the whole transaction rolls back, and the clash is treated as "already done".
 */

type Tx = Prisma.TransactionClient;

function isUniqueClash(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

/** Run fn in the caller's transaction, or in a fresh one. */
function inTx<T>(tx: Tx | undefined, fn: (t: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

export async function findGiftCard(code: string, tx?: Tx): Promise<GiftCard | null> {
  const normalized = normalizeGiftCardCode(code);
  if (!normalized) return null;
  return (tx ?? prisma).giftCard.findUnique({ where: { code: normalized } });
}

/** One PENDING card per gift card line of a newly placed order. */
export async function createPendingCards(
  orderId: string,
  items: { orderItemId: string; initialCents: number; details: GiftCardDetails }[],
  buyerEmail: string,
  tx?: Tx,
): Promise<GiftCard[]> {
  const db = tx ?? prisma;
  const created: GiftCard[] = [];
  for (const item of items) {
    // A fresh code clashing with an old one is vanishingly rare; try again.
    for (let attempt = 0; ; attempt++) {
      try {
        created.push(
          await db.giftCard.create({
            data: {
              code: normalizeGiftCardCode(generateGiftCardCode()),
              initialCents: item.initialCents,
              purchaseOrderId: orderId,
              purchaseOrderItemId: item.orderItemId,
              buyerEmail,
              senderName: item.details.senderName,
              recipientName: item.details.recipientName,
              recipientEmail: item.details.recipientEmail,
              message: item.details.message,
              deliverTo: item.details.deliverTo,
            },
          }),
        );
        break;
      } catch (err) {
        if (!isUniqueClash(err) || attempt >= 4 || tx) throw err;
      }
    }
  }
  return created;
}

export type HoldResult =
  | { ok: true; cardId: string }
  | { ok: false; error: "not_found" | "inactive" | "insufficient" };

/**
 * Take `cents` off a card for an order. The decrement only matches while the
 * card is active and still holds enough, so two orders racing for the same
 * balance cannot both win.
 */
export async function holdRedemption(
  code: string,
  orderId: string,
  cents: number,
  tx?: Tx,
): Promise<HoldResult> {
  const card = await findGiftCard(code, tx);
  if (!card) return { ok: false, error: "not_found" };
  if (card.status !== "ACTIVE") return { ok: false, error: "inactive" };
  if (cents <= 0) return { ok: true, cardId: card.id };

  try {
    return await inTx(tx, async (t) => {
      const taken = await t.giftCard.updateMany({
        where: { id: card.id, status: "ACTIVE", balanceCents: { gte: cents } },
        data: { balanceCents: { decrement: cents } },
      });
      if (taken.count === 0) throw new InsufficientBalance();
      await t.giftCardTransaction.create({
        data: { giftCardId: card.id, kind: "REDEEM", amountCents: -cents, orderId },
      });
      return { ok: true as const, cardId: card.id };
    });
  } catch (err) {
    if (err instanceof InsufficientBalance) return { ok: false, error: "insufficient" };
    throw err;
  }
}

class InsufficientBalance extends Error {}

/**
 * Payment confirmed: activate the order's pending cards. Returns only the
 * cards this call activated, so the caller emails each exactly once.
 */
export async function issueCardsForOrder(orderId: string): Promise<GiftCard[]> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order || order.status === "CANCELLED" || order.status === "REFUNDED") return [];

  const pending = await prisma.giftCard.findMany({
    where: { purchaseOrderId: orderId, status: "PENDING" },
  });
  const issued: GiftCard[] = [];
  for (const card of pending) {
    try {
      issued.push(
        await prisma.$transaction(async (t) => {
          await t.giftCardTransaction.create({
            data: { giftCardId: card.id, kind: "ISSUE", amountCents: card.initialCents, orderId },
          });
          return t.giftCard.update({
            where: { id: card.id },
            data: { status: "ACTIVE", balanceCents: card.initialCents, issuedAt: new Date() },
          });
        }),
      );
    } catch (err) {
      if (!isUniqueClash(err)) throw err;
    }
  }
  return issued;
}

/**
 * Order cancelled or refunded: give back what a card paid toward it, and void
 * the cards it bought. Cards bought here and already partly spent elsewhere
 * are voided for what is left and reported, so staff can follow up.
 */
export async function reverseGiftCardsForOrder(
  orderId: string,
): Promise<{ restoredCents: number; voided: number; partlySpent: string[] }> {
  let restoredCents = 0;
  let voided = 0;
  const partlySpent: string[] = [];

  const redemptions = await prisma.giftCardTransaction.findMany({
    where: { orderId, kind: "REDEEM" },
  });
  for (const r of redemptions) {
    const back = -r.amountCents;
    try {
      await prisma.$transaction(async (t) => {
        await t.giftCardTransaction.create({
          data: { giftCardId: r.giftCardId, kind: "RESTORE", amountCents: back, orderId },
        });
        await t.giftCard.update({
          where: { id: r.giftCardId },
          data: { balanceCents: { increment: back } },
        });
      });
      restoredCents += back;
    } catch (err) {
      if (!isUniqueClash(err)) throw err;
    }
  }

  /*
   * Only ACTIVE cards are voided. A PENDING card holds no value, and leaving
   * it pending means an order cancelled for non-payment and then paid late
   * (reopened) still issues the card the buyer paid for.
   */
  const bought = await prisma.giftCard.findMany({
    where: { purchaseOrderId: orderId, status: "ACTIVE" },
  });
  for (const card of bought) {
    try {
      await prisma.$transaction(async (t) => {
        await t.giftCardTransaction.create({
          data: { giftCardId: card.id, kind: "VOID", amountCents: -card.balanceCents, orderId },
        });
        await t.giftCard.update({
          where: { id: card.id },
          data: { status: "VOID", balanceCents: 0 },
        });
      });
      voided += 1;
      if (card.status === "ACTIVE" && card.balanceCents < card.initialCents) partlySpent.push(card.code);
    } catch (err) {
      if (!isUniqueClash(err)) throw err;
    }
  }

  return { restoredCents, voided, partlySpent };
}

/** A manual correction, signed, with a reason. Never takes a card below zero. */
export async function adjustGiftCard(
  cardId: string,
  amountCents: number,
  note: string,
  adminId: string,
): Promise<boolean> {
  if (!Number.isInteger(amountCents) || amountCents === 0 || !note.trim()) return false;
  try {
    await prisma.$transaction(async (t) => {
      const changed = await t.giftCard.updateMany({
        where: {
          id: cardId,
          status: { not: "VOID" },
          ...(amountCents < 0 ? { balanceCents: { gte: -amountCents } } : {}),
        },
        data: { balanceCents: { increment: amountCents } },
      });
      if (changed.count === 0) throw new InsufficientBalance();
      await t.giftCardTransaction.create({
        data: { giftCardId: cardId, kind: "ADJUST", amountCents, adminId, note: note.trim() },
      });
    });
    return true;
  } catch (err) {
    if (err instanceof InsufficientBalance) return false;
    throw err;
  }
}

/** Stop a card working, whatever is left on it. */
export async function voidGiftCard(cardId: string, adminId: string, note: string): Promise<void> {
  await prisma.$transaction(async (t) => {
    const card = await t.giftCard.findUnique({ where: { id: cardId } });
    if (!card || card.status === "VOID") return;
    await t.giftCardTransaction.create({
      data: { giftCardId: cardId, kind: "VOID", amountCents: -card.balanceCents, adminId, note: note.trim() || null },
    });
    await t.giftCard.update({ where: { id: cardId }, data: { status: "VOID", balanceCents: 0 } });
  });
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");

/** $100, or $12.50 - a gift card amount reads better without the currency code. */
function giftAmount(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/**
 * Email a card: to the friend with a copy to the buyer, or to the buyer alone
 * to hand over. Returns whether the main email went out.
 */
async function emailCard(card: GiftCard): Promise<boolean> {
  const config = await getMailConfig();
  if (!config.enabled) return false;
  const settings = await getSettings();
  const base = {
    amount: giftAmount(card.initialCents),
    code: formatGiftCardCode(card.code),
    recipientName: card.recipientName,
    senderName: card.senderName,
    message: card.message,
    storeName: settings[SETTING_KEYS.storeName] || "Br3thr",
    storeUrl: SITE_URL,
  };

  if (card.deliverTo === "RECIPIENT" && card.recipientEmail) {
    const sent = await sendMail({ to: card.recipientEmail, ...giftCardEmail({ ...base, mode: "recipient" }) }, config);
    await sendMail({ to: card.buyerEmail, ...giftCardEmail({ ...base, mode: "buyer-copy" }) }, config);
    return sent.ok;
  }
  const sent = await sendMail({ to: card.buyerEmail, ...giftCardEmail({ ...base, mode: "buyer-to-give" }) }, config);
  return sent.ok;
}

/** Email newly issued cards, stamping each one that went out. */
export async function sendGiftCardEmails(cards: GiftCard[]): Promise<void> {
  for (const card of cards) {
    if (await emailCard(card)) {
      await prisma.giftCard.update({ where: { id: card.id }, data: { emailedAt: new Date() } });
    }
  }
}

/** The admin's "Resend email" - only for a card that is live. */
export async function resendGiftCardEmail(cardId: string): Promise<boolean> {
  const card = await prisma.giftCard.findUnique({ where: { id: cardId } });
  if (!card || card.status !== "ACTIVE") return false;
  const ok = await emailCard(card);
  if (ok) await prisma.giftCard.update({ where: { id: card.id }, data: { emailedAt: new Date() } });
  return ok;
}
