import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePrice } from "@/lib/pricing";
import { canSell } from "@/lib/stock";

/*
 * "Frequently bought together" pricing.
 *
 * A product's bundle discount comes off each of its companions that is in the
 * same basket as the product - however it got there: the product page's bundle
 * button, the checkout's Add button, or two separate adds. It is never taken
 * off the product itself, and one of that product's units pays for one
 * companion unit, so one tee cannot unlock the discount on ten companions.
 *
 * Worked out from the basket every time the cart is read, like every other
 * price, so the product page, cart, mini-cart, checkout and the placed order
 * can never disagree about it.
 */

/** Matches the admin field's ceiling. */
export const MAX_BUNDLE_PERCENT = 90;

export const clampBundlePercent = (n: number) =>
  Math.max(0, Math.min(MAX_BUNDLE_PERCENT, Math.round(Number(n) || 0)));

export type BundleLine = {
  id: string;
  productId: string | null;
  unitPriceCents: number;
  quantity: number;
  isGift: boolean;
};

/** A product in the basket, its bundle discount and the companions it covers. */
export type AnchorRule = {
  id: string;
  percent: number;
  companionIds: string[];
};

export type BundlePlan = {
  totalCents: number;
  /** Savings per cart line id. */
  byLine: Record<string, { cents: number; percent: number; units: number; unitOffCents: number }>;
  /** Companion product id -> the deal it is getting. */
  deals: Map<string, { percent: number; anchorId: string }>;
};

/**
 * Decide which basket items get a bundle discount. Pure, so it can be tested
 * without a database.
 *
 * Best percentage first. An item already on a deal cannot pass one on, and an
 * item paying for a deal cannot also receive one - otherwise two products that
 * list each other would both come off.
 */
export function planBundleSavings(lines: BundleLine[], rules: AnchorRule[]): BundlePlan {
  const qty = new Map<string, number>();
  for (const l of lines) {
    if (l.isGift || !l.productId || l.quantity < 1) continue;
    qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.quantity);
  }

  const edges: { companion: string; anchor: string; percent: number }[] = [];
  for (const rule of rules) {
    const percent = clampBundlePercent(rule.percent);
    if (percent <= 0 || !qty.has(rule.id)) continue;
    for (const companion of rule.companionIds) {
      if (companion !== rule.id && qty.has(companion)) {
        edges.push({ companion, anchor: rule.id, percent });
      }
    }
  }
  edges.sort((a, b) => b.percent - a.percent);

  const deals: BundlePlan["deals"] = new Map();
  const anchorsUsed = new Set<string>();
  for (const e of edges) {
    if (deals.has(e.companion) || anchorsUsed.has(e.companion) || deals.has(e.anchor)) continue;
    deals.set(e.companion, { percent: e.percent, anchorId: e.anchor });
    anchorsUsed.add(e.anchor);
  }

  // Units the anchor can still pay for, per companion product.
  const left = new Map<string, number>();
  for (const [companion, deal] of deals) left.set(companion, qty.get(deal.anchorId) ?? 0);

  const byLine: BundlePlan["byLine"] = {};
  let totalCents = 0;

  // Dearest lines first, so a capped deal lands where it saves the most.
  const discounted = lines
    .filter((l) => !l.isGift && l.productId && deals.has(l.productId))
    .sort((a, b) => b.unitPriceCents - a.unitPriceCents);

  for (const l of discounted) {
    const productId = l.productId as string;
    const deal = deals.get(productId)!;
    const units = Math.min(l.quantity, left.get(productId) ?? 0);
    if (units <= 0) continue;
    left.set(productId, (left.get(productId) ?? 0) - units);

    // Rounded per unit, as the product page and checkout show it, so a unit's
    // bundle price is always a whole number of cents.
    const unitOffCents = Math.round((l.unitPriceCents * deal.percent) / 100);
    const cents = unitOffCents * units;
    if (cents <= 0) continue;
    byLine[l.id] = { cents, percent: deal.percent, units, unitOffCents };
    totalCents += cents;
  }

  return { totalCents, byLine, deals };
}

/** The bundle rules of the given basket products that carry a discount. */
export async function loadAnchorRules(productIds: string[]): Promise<AnchorRule[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, status: "PUBLISHED", bundleDiscountPercent: { gt: 0 } },
    select: {
      id: true,
      bundleDiscountPercent: true,
      bundledWith: { where: { status: "PUBLISHED", isGiftOnly: false }, select: { id: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    percent: r.bundleDiscountPercent,
    companionIds: r.bundledWith.map((b) => b.id),
  }));
}

export type RawCompanionOffer = {
  productId: string;
  name: string;
  imageUrl: string | null;
  anchorName: string;
  percent: number;
  variants: { id: string; name: string | null; priceCents: number; offerCents: number }[];
};

/**
 * Companions of what is in the basket that are not in it yet, for the
 * checkout's block - with the price each option would cost once added.
 */
export async function companionOffers(lines: BundleLine[], limit = 4): Promise<RawCompanionOffer[]> {
  const inBasket = new Set(
    lines.filter((l) => !l.isGift && l.productId).map((l) => l.productId as string),
  );
  if (inBasket.size === 0) return [];

  const anchors = await prisma.product.findMany({
    where: { id: { in: [...inBasket] }, status: "PUBLISHED" },
    select: {
      id: true,
      name: true,
      bundleDiscountPercent: true,
      bundledWith: {
        where: { status: "PUBLISHED", isGiftOnly: false, type: { not: "EXTERNAL" } },
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
          discountActive: true,
          discountPercent: true,
          discountStartsAt: true,
          discountEndsAt: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          variants: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  });

  const plan = planBundleSavings(
    lines,
    anchors.map((a) => ({
      id: a.id,
      percent: a.bundleDiscountPercent,
      companionIds: a.bundledWith.map((b) => b.id),
    })),
  );

  const best = new Map<string, RawCompanionOffer>();
  for (const a of anchors) {
    // An item that is itself on a bundle deal cannot pass one on.
    const percent = plan.deals.has(a.id) ? 0 : clampBundlePercent(a.bundleDiscountPercent);

    for (const c of a.bundledWith) {
      if (inBasket.has(c.id)) continue;
      const current = best.get(c.id);
      if (current && current.percent >= percent) continue;

      const variants = c.variants
        .filter((v) => canSell(v))
        .slice(0, 40)
        .map((v) => {
          const priceCents = effectivePrice(v, c).priceCents;
          return {
            id: v.id,
            name: v.name,
            priceCents,
            offerCents: priceCents - Math.round((priceCents * percent) / 100),
          };
        });
      if (variants.length === 0) continue;

      best.set(c.id, {
        productId: c.id,
        name: c.name,
        imageUrl: c.coverImageUrl ?? c.images[0]?.url ?? null,
        anchorName: a.name,
        percent,
        variants,
      });
    }
  }

  return [...best.values()].sort((x, y) => y.percent - x.percent).slice(0, limit);
}
