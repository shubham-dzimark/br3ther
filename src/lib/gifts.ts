import "server-only";
import { prisma } from "@/lib/prisma";
import { canSell, sellableQuantity } from "@/lib/stock";
import type { GiftRule, GiftRuleProduct, ProductVariant } from "@/generated/prisma";

/**
 * Free gifts.
 *
 * Rules are evaluated against the priced cart - what the shopper actually pays
 * after sales, Bundle & Save and bundle deals - and the gift lines in the cart
 * are reconciled to match. Add enough to qualify and the gift appears; remove
 * an item and it goes again, with no stale free product surviving to checkout.
 *
 * Shoppers never choose a gift. An offer that lists several gift products adds
 * the first one that is in stock; the rest are backups for when it runs out.
 * Gifts are typically "gift-only" products, which the storefront never shows.
 *
 * An offer can be limited to several products or categories: only those count
 * toward a Buy X quantity or a Spend amount, and "cheapest item free" takes the
 * cheapest of them. With no limit set, every product counts.
 *
 * The same evaluation feeds the cart page, the checkout page, the order and
 * the totals, so what is shown and what is charged can never disagree. Gift
 * lines are priced at zero and never count toward what earns a gift.
 */

export type GiftLineInput = {
  variantId: string | null;
  unitPriceCents: number;
  quantity: number;
  isGift: boolean;
  /** What the line actually costs after sales, Bundle & Save and bundle deals. */
  lineTotalCents?: number;
  /** Product and categories of the variant, for offers limited to some products. */
  productId?: string | null;
  categoryIds?: string[];
};

export type GiftOption = GiftRuleProduct & {
  variant: ProductVariant & {
    product: {
      name: string;
      slug: string;
      coverImageUrl: string | null;
      status: string;
      isGiftOnly: boolean;
    };
  };
};

export type RuleWithGifts = GiftRule & { gifts: GiftOption[] };

export async function activeGiftRules(): Promise<RuleWithGifts[]> {
  return prisma.giftRule.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      gifts: {
        // The order the admin listed them in: the first in stock is given.
        orderBy: { id: "asc" },
        include: {
          variant: {
            include: {
              product: {
                select: { name: true, slug: true, coverImageUrl: true, status: true, isGiftOnly: true },
              },
            },
          },
        },
      },
    },
  });
}

const lineTotal = (l: GiftLineInput) => l.lineTotalCents ?? l.unitPriceCents * l.quantity;

/** What the paid lines cost - the figure a "spend $X" offer is measured against. */
export function paidSubtotalCents(lines: GiftLineInput[]): number {
  return lines.filter((l) => !l.isGift).reduce((n, l) => n + lineTotal(l), 0);
}

/**
 * The products and categories an offer is limited to: the lists, or the single
 * product/category an older offer kept. Both empty means every product.
 */
export function triggerScope(rule: GiftRule): { productIds: string[]; categoryIds: string[] } {
  const productIds = rule.triggerProductIds?.length
    ? rule.triggerProductIds
    : rule.triggerProductId
      ? [rule.triggerProductId]
      : [];
  const categoryIds = rule.triggerCategoryIds?.length
    ? rule.triggerCategoryIds
    : rule.triggerCategoryId
      ? [rule.triggerCategoryId]
      : [];
  return { productIds, categoryIds };
}

/** Does this line count toward the offer? A code offer takes any line. */
function matchesTrigger(rule: GiftRule, l: GiftLineInput): boolean {
  if (rule.trigger === "COUPON") return true;
  const { productIds, categoryIds } = triggerScope(rule);
  if (productIds.length) return Boolean(l.productId) && productIds.includes(l.productId as string);
  if (categoryIds.length) return (l.categoryIds ?? []).some((c) => categoryIds.includes(c));
  return true;
}

/**
 * How many times a rule is satisfied.
 *
 * 0 means not eligible. Above 1 only happens on a repeating BUY_X_GET_Y -
 * everything else caps at one, because "spend $50, get a gift" should not
 * hand out three gifts for a $150 order unless that was asked for.
 */
export function timesEarned(
  rule: GiftRule,
  lines: GiftLineInput[],
  couponCode: string | null,
): number {
  // Gift lines never count toward earning further gifts.
  const paid = lines.filter((l) => !l.isGift && l.quantity > 0 && matchesTrigger(rule, l));

  switch (rule.trigger) {
    case "CART_TOTAL": {
      if (rule.minSubtotalCents <= 0) return 0;
      return paidSubtotalCents(paid) >= rule.minSubtotalCents ? 1 : 0;
    }

    case "BUY_X_GET_Y": {
      const need = Math.max(1, rule.triggerQuantity);
      const have = paid.reduce((n, l) => n + l.quantity, 0);
      if (have < need) return 0;
      return rule.repeats ? Math.floor(have / need) : 1;
    }

    case "COUPON": {
      const wanted = (rule.couponCode ?? "").trim().toUpperCase();
      if (!wanted) return 0;
      return (couponCode ?? "").trim().toUpperCase() === wanted ? 1 : 0;
    }

    default:
      return 0;
  }
}

/** How far off a CART_TOTAL rule is, for the "spend $x more" nudge. */
export function shortfallCents(rule: GiftRule, lines: GiftLineInput[]): number | null {
  if (rule.trigger !== "CART_TOTAL" || rule.minSubtotalCents <= 0) return null;
  const counted = lines.filter((l) => !l.isGift && matchesTrigger(rule, l));
  const gap = rule.minSubtotalCents - paidSubtotalCents(counted);
  return gap > 0 ? gap : 0;
}

export type EarnedGift = {
  rule: RuleWithGifts;
  times: number;
  /** How many gift units the cart is entitled to in total. */
  allowance: number;
};

export function earnedGifts(
  rules: RuleWithGifts[],
  lines: GiftLineInput[],
  couponCode: string | null,
): EarnedGift[] {
  const out: EarnedGift[] = [];
  for (const rule of rules) {
    const times = timesEarned(rule, lines, couponCode);
    if (times > 0) {
      out.push({ rule, times, allowance: Math.max(1, rule.maxGifts) * times });
    }
  }
  return out;
}

/** True when any earned rule waives shipping. */
export function giftsWaiveShipping(earned: EarnedGift[]): boolean {
  return earned.some((e) => e.rule.reward === "FREE_SHIPPING");
}

/**
 * "Cheapest item free": the cheapest paid unit(s) cost nothing - one per time
 * the offer is earned, taken from the lines the offer counts (its products or
 * categories, otherwise the whole cart). At least one unit always stays paid,
 * so the offer can never make a whole order free.
 */
export function cheapestItemDiscount(
  earned: EarnedGift[],
  lines: GiftLineInput[],
): { cents: number; label: string } {
  const units = lines.flatMap((line) =>
    line.isGift || line.quantity <= 0
      ? []
      : Array.from({ length: line.quantity }, () => ({
          line,
          cents: Math.round(lineTotal(line) / line.quantity),
        })),
  );

  const freed = new Set<number>();
  const names: string[] = [];
  let cents = 0;

  for (const e of earned) {
    if (e.rule.reward !== "CHEAPEST_IN_CART") continue;
    const eligible = units
      .map((unit, index) => ({ unit, index }))
      .filter(({ unit, index }) => !freed.has(index) && matchesTrigger(e.rule, unit.line));
    const free = Math.min(e.times, eligible.length - 1);
    if (free <= 0) continue;

    eligible
      .sort((a, b) => a.unit.cents - b.unit.cents)
      .slice(0, free)
      .forEach(({ unit, index }) => {
        freed.add(index);
        cents += unit.cents;
      });
    names.push(e.rule.name);
  }

  return { cents, label: names.join(", ") };
}

/**
 * Priced cart lines as gift inputs, with each line's product and categories so
 * offers limited to some products or categories can match.
 */
export async function giftLinesFor(
  lines: {
    variantId: string | null;
    unitPriceCents: number;
    lineTotalCents?: number;
    quantity: number;
    isGift: boolean;
    isGiftCard?: boolean;
  }[],
): Promise<GiftLineInput[]> {
  // A gift card is money, not goods: it never counts toward a gift offer.
  lines = lines.filter((l) => !l.isGiftCard);
  const ids = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v)))];
  const variants = ids.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          productId: true,
          product: { select: { categoryId: true, categories: { select: { id: true } } } },
        },
      })
    : [];
  const meta = new Map(variants.map((v) => [v.id, v]));

  return lines.map((l) => {
    const v = l.variantId ? meta.get(l.variantId) : undefined;
    return {
      variantId: l.variantId,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
      quantity: l.quantity,
      isGift: l.isGift,
      productId: v?.productId ?? null,
      categoryIds: [
        ...(v?.product.categoryId ? [v.product.categoryId] : []),
        ...(v?.product.categories.map((c) => c.id) ?? []),
      ],
    };
  });
}

/**
 * Mark gift products from the Free Gift offers - the only place gifts are set.
 *
 * A product is a gift exactly when one of its options is the gift in some
 * offer (live or switched off). Gifts are hidden from the whole storefront and
 * can't be bought; a product taken out of every offer, or whose offer is
 * deleted, becomes a normal product again. Run after any change to offers or
 * to variants (deleting a variant drops it from its offer).
 */
export async function syncGiftProducts(): Promise<void> {
  const rows = await prisma.giftRuleProduct.findMany({
    select: { variant: { select: { productId: true } } },
  });
  const ids = [...new Set(rows.map((r) => r.variant.productId))];
  await prisma.$transaction([
    prisma.product.updateMany({
      where: { isGiftOnly: true, id: { notIn: ids } },
      data: { isGiftOnly: false },
    }),
    prisma.product.updateMany({
      where: { isGiftOnly: false, id: { in: ids } },
      data: { isGiftOnly: true },
    }),
  ]);
}

/**
 * How many of a gift option could be handed over at all. A gift-only product
 * can be given as long as it is not archived; any other product has to be
 * published. The option must be active and sellable either way.
 */
export function giftStock(option: GiftOption): number {
  const v = option.variant;
  const p = v.product;
  const live = p.isGiftOnly ? p.status !== "ARCHIVED" : p.status === "PUBLISHED";
  if (!live || !v.isActive || !canSell(v)) return 0;
  return sellableQuantity(v);
}

/**
 * Reconcile the gift lines in a cart against what it has earned.
 *
 * A gift already in the cart is kept while it is still on the offer's list,
 * trimmed to the allowance and to the stock left after the paid lines. Then
 * each offer is topped up from its gifts in the order they were listed: the
 * first in stock is given, the next ones only when it has run out.
 *
 * `priced` are the priced cart lines (see giftLinesFor). Every caller passes
 * them; without them the stored line prices are used, which can be stale.
 */
export async function reconcileCartGifts(
  cartId: string,
  couponCode: string | null,
  priced?: GiftLineInput[],
): Promise<void> {
  const [items, rules] = await Promise.all([
    prisma.cartItem.findMany({ where: { cartId } }),
    activeGiftRules(),
  ]);
  const lines = priced ?? (await giftLinesFor(items));
  const giftItems = items.filter((i) => i.isGift);

  if (rules.length === 0) {
    // Nothing configured: clear anything a deleted rule left behind.
    if (giftItems.length) {
      await prisma.cartItem.deleteMany({ where: { id: { in: giftItems.map((o) => o.id) } } });
    }
    return;
  }

  const earned = earnedGifts(rules, lines, couponCode).filter((e) => e.rule.reward === "PRODUCT");
  const earnedById = new Map(earned.map((e) => [e.rule.id, e]));

  // Units of each option already spoken for - paid lines first, then gifts kept.
  const used = new Map<string, number>();
  for (const i of items) {
    if (!i.isGift && i.variantId) used.set(i.variantId, (used.get(i.variantId) ?? 0) + i.quantity);
  }
  const left = (o: GiftOption) => Math.max(0, giftStock(o) - (used.get(o.variantId) ?? 0));

  const kept = new Map<string, number>(); // ruleId -> gift units kept
  const keptLine = new Map<string, { id: string; quantity: number }>(); // rule:variant -> line
  const toDelete: string[] = [];
  const toResize: { id: string; quantity: number }[] = [];

  for (const item of giftItems) {
    const e = item.giftRuleId ? earnedById.get(item.giftRuleId) : undefined;
    const option = e && item.variantId ? e.rule.gifts.find((g) => g.variantId === item.variantId) : undefined;
    if (!e || !option) {
      toDelete.push(item.id);
      continue;
    }

    const quantity = Math.min(item.quantity, e.allowance - (kept.get(e.rule.id) ?? 0), left(option));
    if (quantity <= 0) {
      toDelete.push(item.id);
      continue;
    }
    if (quantity !== item.quantity) toResize.push({ id: item.id, quantity });

    kept.set(e.rule.id, (kept.get(e.rule.id) ?? 0) + quantity);
    used.set(option.variantId, (used.get(option.variantId) ?? 0) + quantity);
    keptLine.set(`${e.rule.id}:${option.variantId}`, { id: item.id, quantity });
  }

  if (toDelete.length) {
    await prisma.cartItem.deleteMany({ where: { id: { in: toDelete } } });
  }
  for (const r of toResize) {
    await prisma.cartItem.update({ where: { id: r.id }, data: { quantity: r.quantity } });
  }

  for (const e of earned) {
    let missing = e.allowance - (kept.get(e.rule.id) ?? 0);

    for (const option of e.rule.gifts) {
      if (missing <= 0) break;
      const add = Math.min(missing, left(option));
      if (add <= 0) continue;

      const key = `${e.rule.id}:${option.variantId}`;
      const existing = keptLine.get(key);
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + add },
        });
        keptLine.set(key, { id: existing.id, quantity: existing.quantity + add });
      } else {
        const created = await prisma.cartItem.create({
          data: {
            cartId,
            variantId: option.variantId,
            nameSnapshot: option.variant.product.name,
            variantSnapshot: option.variant.name,
            unitPriceCents: 0,
            quantity: add,
            isGift: true,
            giftRuleId: e.rule.id,
          },
        });
        keptLine.set(key, { id: created.id, quantity: add });
      }

      used.set(option.variantId, (used.get(option.variantId) ?? 0) + add);
      kept.set(e.rule.id, (kept.get(e.rule.id) ?? 0) + add);
      missing -= add;
    }
  }
}

export type ClaimResult = { ok: true } | { ok: false; error: string };

/**
 * Take one of the gifts a rule offers.
 *
 * Kept for server-side use; the storefront no longer lets shoppers pick. It
 * re-derives eligibility from the cart, so a stale request cannot add a gift
 * the cart no longer qualifies for, one not on the offer, one already claimed,
 * or one that is out of stock.
 */
export async function claimGift(
  cartId: string,
  ruleId: string,
  variantId: string,
  couponCode: string | null,
  lines: GiftLineInput[],
): Promise<ClaimResult> {
  const [items, rules] = await Promise.all([
    prisma.cartItem.findMany({ where: { cartId } }),
    activeGiftRules(),
  ]);

  const e = earnedGifts(rules, lines, couponCode).find(
    (x) => x.rule.id === ruleId && x.rule.reward === "PRODUCT",
  );
  if (!e) return { ok: false, error: "That offer no longer applies to your cart." };

  const option = e.rule.gifts.find((g) => g.variantId === variantId);
  if (!option) return { ok: false, error: "That gift isn't part of this offer." };

  const taken = items
    .filter((i) => i.isGift && i.giftRuleId === ruleId)
    .reduce((n, i) => n + i.quantity, 0);
  if (taken >= e.allowance) return { ok: false, error: "You've already claimed this offer." };

  const onHand = items.filter((i) => i.variantId === variantId).reduce((n, i) => n + i.quantity, 0);
  if (giftStock(option) - onHand < 1) {
    return { ok: false, error: "That gift is out of stock right now." };
  }

  const same = items.find((i) => i.isGift && i.giftRuleId === ruleId && i.variantId === variantId);
  if (same) {
    await prisma.cartItem.update({ where: { id: same.id }, data: { quantity: same.quantity + 1 } });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId,
        variantId,
        nameSnapshot: option.variant.product.name,
        variantSnapshot: option.variant.name,
        unitPriceCents: 0,
        quantity: 1,
        isGift: true,
        giftRuleId: ruleId,
      },
    });
  }
  return { ok: true };
}
