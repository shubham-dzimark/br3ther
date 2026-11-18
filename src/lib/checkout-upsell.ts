import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePrice } from "@/lib/pricing";
import { canSell } from "@/lib/stock";
import { companionOffers, type BundleLine, type RawCompanionOffer } from "@/lib/bundles";

/*
 * The checkout upsell block.
 *
 * Two sources feed it:
 *  - a product's own companions, set on the product screen under "Checkout
 *    Upsell Product" - these carry that product's bundle discount;
 *  - offers built on /admin/promotions/checkout-upsell, which show chosen
 *    products to every basket, to baskets holding a given product or
 *    category, and/or once the basket reaches an amount.
 *
 * Companions win when both would show the same product, because they can carry
 * a discount. What a shopper adds from here is marked on the cart line, so the
 * admin can report what the block actually sells.
 */

export const UPSELL_TITLE_FALLBACK = "Frequently bought together";

/** Where a campaign runs. Product placements show offers; NEXT_ORDER issues a coupon. */
export const PLACEMENTS = ["CHECKOUT", "CART", "THANK_YOU", "NEXT_ORDER"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABELS: Record<Placement, string> = {
  CHECKOUT: "Checkout Upsells",
  CART: "Cart Upsells",
  THANK_YOU: "Thank You Page Upsells",
  NEXT_ORDER: "Next Order Coupons",
};
export function asPlacement(v: unknown): Placement {
  return PLACEMENTS.includes(v as Placement) ? (v as Placement) : "CHECKOUT";
}

/** An offer's discount, as stored in its single `discountRule` column. */
export type UpsellDiscount = { kind: "percent" | "fixed"; value: number } | null;

/** "PERCENT:20" / "FIXED:500" / "" - anything unreadable means no discount. */
export function parseUpsellDiscount(rule: string | null | undefined): UpsellDiscount {
  const [kind, raw] = String(rule ?? "").split(":");
  const value = Math.max(0, Math.round(Number(raw) || 0));
  if (value < 1) return null;
  if (kind === "PERCENT") return { kind: "percent", value: Math.min(90, value) };
  if (kind === "FIXED") return { kind: "fixed", value };
  return null;
}

/** Written back into that column. */
export function formatUpsellDiscount(d: UpsellDiscount): string {
  if (!d) return "";
  return d.kind === "percent" ? `PERCENT:${d.value}` : `FIXED:${d.value}`;
}

/**
 * What an offer takes off one unit: a percentage of the price, or a fixed
 * amount, never below zero and never more than the price itself.
 */
export function upsellDiscountOff(
  priceCents: number,
  offer: { discountRule: string | null },
): number {
  const d = parseUpsellDiscount(offer.discountRule);
  if (!d) return 0;
  const off = d.kind === "percent" ? Math.round((priceCents * d.value) / 100) : d.value;
  return Math.max(0, Math.min(priceCents, off));
}

export type UpsellOffer = RawCompanionOffer & {
  /** Set when this came from an offer rather than a product's companions. */
  offerId?: string;
};

/**
 * Campaigns whose targeting matches this basket (or order), highest priority
 * first. `placements` picks where they run; the checkout keeps its old
 * behaviour by asking for CHECKOUT only.
 */
export async function matchingUpsellOffers(
  productIds: string[],
  subtotalCents: number,
  now = new Date(),
  placements: Placement[] = ["CHECKOUT"],
) {
  return prisma.checkoutUpsellOffer.findMany({
    where: {
      isActive: true,
      placement: { in: placements },
      minSubtotalCents: { lte: Math.max(0, subtotalCents) },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        {
          OR: [
            { allCarts: true },
            ...(productIds.length
              ? [
                  { triggerProducts: { some: { id: { in: productIds } } } },
                  {
                    triggerCategories: {
                      some: {
                        OR: [
                          { products: { some: { id: { in: productIds } } } },
                          { taggedProducts: { some: { id: { in: productIds } } } },
                        ],
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    },
    orderBy: [{ priority: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      placement: true,
      discountRule: true,
      couponValidDays: true,
      couponMinSpendCents: true,
      products: {
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
          variants: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] },
        },
      },
    },
  });
}

/**
 * What the checkout block shows: companions first (they can carry a discount),
 * then offer products that are not already covered or in the basket.
 */
export async function checkoutUpsellOffers(
  lines: BundleLine[],
  subtotalCents: number,
  limit = 4,
): Promise<UpsellOffer[]> {
  const companions: UpsellOffer[] = await companionOffers(lines, limit);
  if (companions.length >= limit) return companions.slice(0, limit);
  return [...companions, ...(await campaignOffers("CHECKOUT", lines, subtotalCents, limit - companions.length, companions))];
}

/** The cart page's and slide cart's block: Cart Upsell campaigns only. */
export async function cartUpsellOffers(lines: BundleLine[], subtotalCents: number, limit = 4): Promise<UpsellOffer[]> {
  return campaignOffers("CART", lines, subtotalCents, limit, []);
}

/** The thank-you page's block, matched against what was just ordered. */
export async function thankYouUpsellOffers(lines: BundleLine[], subtotalCents: number, limit = 3): Promise<UpsellOffer[]> {
  return campaignOffers("THANK_YOU", lines, subtotalCents, limit, []);
}

/** The shape the shared upsell block (CheckoutCompanions) draws, with prices formatted. */
export function formatUpsellOffers(offers: UpsellOffer[], fmt: (cents: number) => string) {
  return offers.map((o) => ({
    ...o,
    variants: o.variants.map((v) => ({
      id: v.id,
      name: v.name,
      price: fmt(v.priceCents),
      offer: fmt(v.offerCents),
      saving: v.offerCents < v.priceCents ? fmt(v.priceCents - v.offerCents) : null,
    })),
  }));
}

/** Counts a showing of each campaign that put a product on screen. Never throws. */
export async function recordUpsellViews(offers: { offerId?: string }[]): Promise<void> {
  const ids = [...new Set(offers.map((o) => o.offerId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  await prisma.checkoutUpsellOffer.updateMany({ where: { id: { in: ids } }, data: { views: { increment: 1 } } }).catch(() => undefined);
}

async function campaignOffers(
  placement: Placement,
  lines: BundleLine[],
  subtotalCents: number,
  limit: number,
  skip: UpsellOffer[],
): Promise<UpsellOffer[]> {
  if (limit <= 0) return [];
  const companions = skip;

  const inBasket = new Set(
    lines.filter((l) => !l.isGift && l.productId).map((l) => l.productId as string),
  );
  const already = new Set(companions.map((c) => c.productId));

  const offers = await matchingUpsellOffers([...inBasket], subtotalCents, new Date(), [placement]);
  const picked: UpsellOffer[] = [];

  for (const offer of offers) {
    for (const p of offer.products) {
      if (inBasket.has(p.id) || already.has(p.id)) continue;
      const variants = p.variants
        .filter((v) => canSell(v))
        .slice(0, 6)
        .map((v) => {
          const cents = effectivePrice(v, p).priceCents;
          // An offer can take a percentage or a fixed amount off each item;
          // with neither set, the block simply shows the product's own price.
          return {
            id: v.id,
            name: v.name,
            priceCents: cents,
            offerCents: cents - upsellDiscountOff(cents, offer),
          };
        });
      if (variants.length === 0) continue;

      /*
       * The badge is one number for the whole product, so it quotes the
       * smallest saving of its options - a fixed amount is a different
       * percentage on each one, and overstating it would be a false claim.
       */
      const percent = Math.min(
        ...variants.map((v) =>
          v.priceCents > 0 ? Math.floor(((v.priceCents - v.offerCents) / v.priceCents) * 100) : 0,
        ),
      );

      already.add(p.id);
      picked.push({
        productId: p.id,
        name: p.name,
        imageUrl: p.coverImageUrl ?? p.images[0]?.url ?? null,
        anchorName: "",
        percent,
        variants,
        offerId: offer.id,
      });
      if (picked.length >= limit) return picked;
    }
  }

  return picked;
}

/** Can this variant be added from the block, and under which offer? */
export async function upsellOfferForVariant(
  productId: string,
  basketProductIds: string[],
  subtotalCents: number,
  placements: Placement[] = ["CHECKOUT", "CART"],
): Promise<string | null> {
  const offers = await matchingUpsellOffers(basketProductIds, subtotalCents, new Date(), placements);
  const match = offers.find((o) => o.products.some((p) => p.id === productId));
  return match?.id ?? null;
}
