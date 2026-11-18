import "server-only";
import { prisma } from "@/lib/prisma";
import type { CartView } from "@/lib/cart";
import {
  activeGiftRules,
  earnedGifts,
  giftLinesFor,
  giftStock,
  shortfallCents,
  type GiftLineInput,
} from "@/lib/gifts";

/**
 * What the cart and checkout pages show about gifts. Shoppers never pick a
 * gift, so there are no choices: only a gift a code has unlocked that is not a
 * cart line yet (added when the order is placed), how far a "spend $X" offer
 * is, and an earned offer whose every gift is out of stock.
 */

export type GiftChoice = {
  ruleId: string;
  ruleName: string;
  remaining: number;
  options: { variantId: string; name: string; variantName: string; imageUrl: string | null }[];
};

export type GiftNudge = {
  ruleId: string;
  shortfallCents: number;
  notice: string | null;
};

/** A gift the cart has earned but does not hold yet (unlocked by a code). */
export type PendingGift = {
  ruleId: string;
  ruleName: string;
  name: string;
  variantName: string;
  imageUrl: string | null;
  quantity: number;
};

export type GiftState = {
  /** Always empty: kept so older callers still compile. */
  choices: GiftChoice[];
  nudges: GiftNudge[];
  pending: PendingGift[];
  /** Earned offers whose every gift is out of stock or unavailable. */
  unavailable: { ruleId: string; ruleName: string }[];
  /** Always empty: gifts are not swapped by shoppers. */
  swappableRuleIds: string[];
};

const empty = (): GiftState => ({ choices: [], nudges: [], pending: [], unavailable: [], swappableRuleIds: [] });

export async function giftStateForCart(
  cart: CartView,
  couponCode: string | null = null,
  priced?: GiftLineInput[],
): Promise<GiftState> {
  const rules = await activeGiftRules();
  if (rules.length === 0 || !cart.id) return empty();

  const lines = priced ?? (await giftLinesFor(cart.lines));
  const earned = earnedGifts(rules, lines, couponCode);

  const giftItems = await prisma.cartItem.findMany({
    where: { cartId: cart.id, isGift: true },
    select: { giftRuleId: true, quantity: true },
  });
  const takenByRule = new Map<string, number>();
  for (const i of giftItems) {
    if (!i.giftRuleId) continue;
    takenByRule.set(i.giftRuleId, (takenByRule.get(i.giftRuleId) ?? 0) + i.quantity);
  }

  // Every unit of an option already in the cart, paid or gift.
  const onHand = new Map<string, number>();
  for (const l of cart.lines) {
    if (l.variantId) onHand.set(l.variantId, (onHand.get(l.variantId) ?? 0) + l.quantity);
  }

  const state = empty();

  for (const e of earned) {
    if (e.rule.reward !== "PRODUCT" || e.rule.gifts.length === 0) continue;
    const remaining = e.allowance - (takenByRule.get(e.rule.id) ?? 0);
    if (remaining <= 0) continue;

    // The same pick the cart makes: the first listed gift that is in stock.
    const g = e.rule.gifts.find((o) => giftStock(o) - (onHand.get(o.variantId) ?? 0) > 0);
    if (!g) {
      state.unavailable.push({ ruleId: e.rule.id, ruleName: e.rule.name });
      continue;
    }
    state.pending.push({
      ruleId: e.rule.id,
      ruleName: e.rule.name,
      name: g.variant.product.name,
      variantName: g.variant.name,
      imageUrl: g.variant.imageUrl ?? g.variant.product.coverImageUrl,
      quantity: Math.min(remaining, giftStock(g) - (onHand.get(g.variantId) ?? 0)),
    });
  }

  const earnedIds = new Set(earned.map((e) => e.rule.id));
  state.nudges = rules
    .filter((r) => !earnedIds.has(r.id) && r.trigger === "CART_TOTAL")
    .map((r) => ({ ruleId: r.id, shortfallCents: shortfallCents(r, lines) ?? 0, notice: r.notice }))
    .filter((n) => n.shortfallCents > 0);

  return state;
}
