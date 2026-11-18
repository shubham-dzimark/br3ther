import "server-only";
import { findGiftCard } from "@/lib/gift-cards";
import { formatGiftCardCode, giftCardRedeemable, parseGiftCardDetails } from "@/lib/gift-card-core";

export type GiftCardSummary = {
  /** The card as shown, GDFR-XXXX-XXXX; null when none was entered. */
  code: string | null;
  appliedCents: number;
  /** What stays on the card after this order. */
  leftCents: number;
  error: string | null;
};

/**
 * What a gift card code does to an order: how much it pays and what is left.
 *
 * Shared by the checkout page (what the shopper is shown) and placeOrder
 * (what is charged), so the two can never disagree. A card pays toward the
 * products part of the order only - products, shipping, tax - never toward
 * gift cards being bought in the same order (`giftCardCents` is passed so
 * that rule is stated here rather than assumed by the caller).
 */
export async function giftCardSummary(args: {
  code: string | null;
  merchTotalCents: number;
  giftCardCents: number;
}): Promise<GiftCardSummary> {
  const typed = args.code?.trim() ?? "";
  if (!typed) return { code: null, appliedCents: 0, leftCents: 0, error: null };

  const card = await findGiftCard(typed);
  if (!card) return { code: null, appliedCents: 0, leftCents: 0, error: "We couldn't find that gift card." };

  const code = formatGiftCardCode(card.code);
  const fail = (error: string) => ({ code, appliedCents: 0, leftCents: card.balanceCents, error });
  if (card.status === "PENDING") return fail("This gift card isn't active yet.");
  if (card.status === "VOID") return fail("This gift card can no longer be used.");
  if (card.balanceCents <= 0) return fail("This gift card has no balance left.");

  const appliedCents = giftCardRedeemable({
    balanceCents: card.balanceCents,
    productDueCents: args.merchTotalCents,
  });
  return { code, appliedCents, leftCents: card.balanceCents - appliedCents, error: null };
}

/** The answer to "Check your balance" on the gift card page. */
export async function giftCardBalanceMessage(code: string): Promise<{ ok: boolean; message: string }> {
  const typed = code.trim();
  if (!typed) return { ok: false, message: "Enter your gift card code." };
  const card = await findGiftCard(typed);
  if (!card) return { ok: false, message: "We couldn't find that gift card." };
  if (card.status === "PENDING") {
    return {
      ok: false,
      message: "This gift card isn't active yet — it starts working once the payment for it is confirmed.",
    };
  }
  if (card.status === "VOID") return { ok: false, message: "This gift card can no longer be used." };
  return {
    ok: true,
    message: `$${(card.balanceCents / 100).toFixed(2)} left on ${formatGiftCardCode(card.code)}.`,
  };
}

/**
 * Every gift card line must be one card for one named person. "Buy again",
 * a bundle or a hand-made request could otherwise put a recipient-less or
 * doubled card in the cart - paid for, and never created.
 */
export function giftCardLinesValid(
  lines: { isGiftCard: boolean; quantity: number; giftCardDetails: unknown }[],
): boolean {
  return lines
    .filter((l) => l.isGiftCard)
    .every((l) => l.quantity === 1 && parseGiftCardDetails(l.giftCardDetails) !== null);
}

/** Paid in full by a card: nothing left to pay AND a card actually paid. */
export function paidInFullByGiftCard(args: { amountDueCents: number; appliedCents: number }): boolean {
  return args.amountDueCents === 0 && args.appliedCents > 0;
}

/**
 * Whether a typed code will pay something. Known before the totals are
 * worked out, so the e-Transfer discount/surcharge is never applied to an
 * order a card is paying toward.
 */
export async function giftCardUsable(code: string | null | undefined): Promise<boolean> {
  if (!code?.trim()) return false;
  const card = await findGiftCard(code);
  return Boolean(card && card.status === "ACTIVE" && card.balanceCents > 0);
}
