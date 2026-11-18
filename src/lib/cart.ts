import "server-only";
import { applyQuantityTiers, sanitizeTiers } from "@/lib/quantity-tiers";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { giftLinesFor, reconcileCartGifts } from "@/lib/gifts";
import type { CartItem } from "@/generated/prisma";
import { effectivePrice } from "@/lib/pricing";
import { parseGiftCardDetails, type GiftCardDetails } from "@/lib/gift-card-core";
import { upsellDiscountOff } from "@/lib/checkout-upsell";
import { pickLineOffer } from "@/lib/line-offer";
import { knownShopperEmail } from "@/lib/shopper-email";
import { canSell, managesStock, takesBackorders } from "@/lib/stock";
import { loadAnchorRules, planBundleSavings } from "@/lib/bundles";

const CART_COOKIE = "nl_cart";
const CART_DAYS = 30;

export type CartLine = {
  id: string;
  variantId: string | null;
  productSlug: string | null;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  /**
   * The most of this option the shopper may have, or null for no limit.
   *
   * Null is the normal answer for an option that does not count its stock or
   * takes backorders. Reading the raw count instead told someone with a
   * perfectly orderable item "Only 0 in stock" and refused them checkout.
   */
  stock: number | null;
  /** Free-gift lines are priced at zero and not editable by the customer. */
  isGift: boolean;
  /** The offer that granted a gift line, so the cart can offer to swap it. */
  giftRuleId: string | null;
  /** Added from the checkout upsell block, and the offer that showed it. */
  fromUpsell: boolean;
  upsellOfferId: string | null;
  productId: string | null;
  /** "Frequently bought together" discount on this line; see lib/bundles. */
  bundleSavingsCents: number;
  bundlePercent: number;
  /** Units at the bundle price - fewer than quantity when the deal is capped. */
  bundleUnits: number;
  /** One unit at the bundle price; unitPriceCents when not on a deal. */
  bundleUnitPriceCents: number;
  /** The line at the usual price, shown struck through beside a bundle price. */
  listTotalCents: number;
  /** One unit before Bundle & Save, for the struck-through price. */
  regularUnitPriceCents: number;
  /** Bundle & Save tier percent on this line, 0 when none. */
  tierPercent: number;
  tierSavingsCents: number;
  /** Checkout Upsell offer discount on this line, 0 when none. */
  upsellPercent: number;
  upsellSavingsCents: number;
  /** A gift card line: face value, no offers, kept out of subtotalCents. */
  isGiftCard: boolean;
  /** Who the card is for; null on product lines. */
  giftCardDetails: GiftCardDetails | null;
};

export type CartView = {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  /**
   * What the goods cost, bundle prices included - the figure shipping, payment
   * limits, points and the order are worked out from.
   */
  subtotalCents: number;
  /** How much of that the bundle deals saved, for the "you save" note. */
  bundleSavingsCents: number;
  /** How much Bundle & Save quantity tiers saved. */
  tierSavingsCents: number;
  /**
   * Face value of the gift cards in the cart. Deliberately NOT in
   * subtotalCents: discounts, shipping, tax, points and offers all work from
   * the subtotal and must never touch a gift card. Grand totals add it back.
   */
  giftCardCents: number;
};

export const EMPTY_CART: CartView = {
  id: null,
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  bundleSavingsCents: 0,
  tierSavingsCents: 0,
  giftCardCents: 0,
};

/**
 * A converted cart belongs to the order it became. It is never shown or
 * written to again: its token is retired and the shopper gets a fresh cart.
 * ABANDONED is not closed - it only means a reminder went out, and the
 * shopper is still using that basket.
 */
function isClosed(cart: { status: string }): boolean {
  return cart.status === "CONVERTED";
}

/** Read the cart token without creating one. */
async function readToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Returns the current cart token, creating the cookie if needed.
 * Only call from a server action or route handler - cookies are read-only
 * while rendering a page.
 */
export async function ensureCartToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_COOKIE)?.value;
  if (existing) return existing;

  const token = randomBytes(24).toString("hex");
  await setCartCookie(token);
  return token;
}

/*
 * A session cookie, with no expiry: a cart built without signing in dies
 * with the browser. On a shared computer the next person should not find
 * someone else's basket waiting for them.
 *
 * Signing in swaps this for a dated cookie - see adoptCartOnLogin - because
 * a customer who took the trouble to have an account should find their cart
 * where they left it.
 */
async function setCartCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

/** Re-issues the cart cookie so it survives the browser closing. */
async function keepCartToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + CART_DAYS * 864e5),
  });
}

/**
 * Called on sign-in. Ties the basket to the account and makes it persistent.
 *
 * Three cases, and all three have bitten real shops:
 *  - shopped as a guest, nothing saved      -> claim the guest cart
 *  - signed in with a saved cart, basket empty -> restore the saved one
 *  - both                                   -> merge, so neither is lost
 */
export async function adoptCartOnLogin(customerId: string): Promise<void> {
  const store = await cookies();
  const guestToken = store.get(CART_COOKIE)?.value ?? null;

  const [guestRow, savedCart, account] = await Promise.all([
    guestToken
      ? prisma.cart.findUnique({ where: { token: guestToken }, include: { items: true } })
      : null,
    prisma.cart.findFirst({
      where: { customerId, status: "ACTIVE" },
      orderBy: { lastActivityAt: "desc" },
      include: { items: true },
    }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { email: true } }),
  ]);
  // The account's address goes on the cart, so a basket left behind can be
  // followed up. Without it the recovery sweep skips the cart as unreachable.
  const email = account?.email ?? null;

  /*
   * A cookie still naming a converted cart is not a basket to claim: that row
   * is the record of an earlier order, possibly someone else's on a shared
   * browser. Drop the cookie so the next add starts a fresh cart.
   */
  const guestCart = guestRow && !isClosed(guestRow) ? guestRow : null;
  if (guestRow && !guestCart) store.delete(CART_COOKIE);

  const guestLines = guestCart?.items.filter((i) => !i.isGift) ?? [];

  // Nothing saved: the basket in hand becomes theirs.
  if (!savedCart || savedCart.id === guestCart?.id) {
    if (guestCart) {
      await prisma.cart.update({
        where: { id: guestCart.id },
        data: { customerId, email },
      });
      await keepCartToken(guestCart.token);
    }
    return;
  }

  // Merge anything carried in as a guest into the saved cart.
  for (const line of guestLines) {
    // A gift card line is its own card for its own person - never merged.
    const existing = line.giftCardDetails
      ? undefined
      : savedCart.items.find(
          (i) => i.variantId === line.variantId && !i.isGift && !i.giftCardDetails,
        );
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + line.quantity },
      });
    } else {
      const { id: _drop, cartId: _drop2, giftCardDetails, ...rest } = line;
      await prisma.cartItem.create({
        data: { ...rest, giftCardDetails: giftCardDetails ?? undefined, cartId: savedCart.id },
      });
    }
  }

  // The guest cart has been absorbed; leaving it would resurface as an
  // abandoned-cart reminder for a basket the customer already has.
  if (guestCart && guestCart.id !== savedCart.id) {
    await prisma.cart.delete({ where: { id: guestCart.id } }).catch(() => undefined);
  }

  await prisma.cart.update({
    where: { id: savedCart.id },
    data: { customerId, email, lastActivityAt: new Date() },
  });
  await refreshCartTotals(savedCart.id);
  await keepCartToken(savedCart.token);
}

/**
 * Called on sign-out. Drops the cookie only - the cart row stays with the
 * account, so signing back in restores it, while the next person on this
 * browser starts empty.
 */
export async function releaseCartOnLogout(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}

/**
 * Called once an order has converted the cart. The cookie still names that
 * cart, and anything added through it would land in the order's record, be
 * missed by abandoned-cart reporting and overwrite recoveredOrderId on the
 * next order. The next add issues a new token and a new ACTIVE cart.
 */
export async function releaseCartAfterOrder(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}

async function loadCart(token: string) {
  return prisma.cart.findUnique({
    where: { token },
    include: { items: true },
  });
}

/**
 * A line from the caller's own cart, or null.
 *
 * Cart actions are handed a CartItem id by the browser, and an id is not a
 * secret: without this check anyone holding another shopper's line id could
 * change or remove it. A converted cart counts as no cart, as in getCart.
 */
export async function findOwnCartItem(itemId: string) {
  const token = await readToken();
  if (!token || !itemId) return null;

  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true, status: true },
  });
  if (!cart || isClosed(cart)) return null;

  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  return item && item.cartId === cart.id ? item : null;
}

/** Cart contents for rendering. Never writes, so it is safe during render. */
export async function getCart(): Promise<CartView> {
  const token = await readToken();
  if (!token) return EMPTY_CART;

  const cart = await loadCart(token);
  // A converted token reads as no cart at all, so nothing downstream (gift
  // choices, checkout) is handed an id it could write to.
  if (!cart || isClosed(cart)) return EMPTY_CART;
  return priceCart(cart);
}

/**
 * Price a cart's items against current data. Shared by getCart (the shopper's
 * own cart, from the cookie) and refreshCartTotals (by id), so the gift engine
 * works from exactly the lines and prices the shopper sees.
 */
export async function priceCart(cart: { id: string; items: CartItem[] }): Promise<CartView> {
  if (cart.items.length === 0) {
    return { ...EMPTY_CART, id: cart.id };
  }

  // Re-price against current data rather than trusting what was stored, so a
  // price change or an expired sale is reflected before checkout.
  const variantIds = cart.items
    .map((i) => i.variantId)
    .filter((v): v is string => Boolean(v));

  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        include: {
          product: {
            select: {
              slug: true,
              name: true,
              coverImageUrl: true,
              discountActive: true,
              discountPercent: true,
              discountStartsAt: true,
              discountEndsAt: true,
              quantityTiers: true,
              isGiftOnly: true,
              type: true,
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
            },
          },
        },
      })
    : [];

  /*
   * An offer's discount is worked out here, not stored on the line: the line
   * is re-priced from current data on every read, so a price stored at add
   * time would be overwritten - exactly as bundle and tier prices are.
   */
  const upsellOfferIds = [
    ...new Set(
      cart.items
        .filter((i) => i.fromUpsell && i.upsellOfferId)
        .map((i) => i.upsellOfferId as string),
    ),
  ];
  const upsellOffers = new Map(
    (upsellOfferIds.length
      ? await prisma.checkoutUpsellOffer.findMany({
          where: { id: { in: upsellOfferIds } },
          select: { id: true, discountRule: true },
        })
      : []
    ).map((o) => [o.id, o]),
  );

  /*
   * What limits this line: a counted option with no backorders is capped at
   * its count, an option that cannot be sold at all is capped at zero, and
   * everything else is uncapped.
   */
  const cartLimit = (v: { stock: number; stockStatus?: string | null; manageStock?: boolean | null; backorders?: string | null }) => {
    if (!canSell(v)) return 0;
    if (managesStock(v) && !takesBackorders(v)) return v.stock;
    return null;
  };

  const byId = new Map(variants.map((v) => [v.id, v]));

  const offerOffByLine = new Map<string, number>();
  const lines: CartLine[] = cart.items.map((item) => {
    const v = item.variantId ? byId.get(item.variantId) : undefined;
    // A gift card is worth exactly its face value - no sale ever touches it.
    const isGiftCard = v?.product.type === "GIFT_CARD";
    const list = item.isGift
      ? 0
      : isGiftCard && v
        ? v.priceCents
        : v
          ? effectivePrice(v, v.product).priceCents
          : item.unitPriceCents;

    const offer = item.upsellOfferId ? upsellOffers.get(item.upsellOfferId) : undefined;
    const upsellOff = item.isGift || !item.fromUpsell || !offer ? 0 : upsellDiscountOff(list, offer);
    // Held aside, not applied: it is one of three candidates below, and they
    // are all compared against the list price.
    offerOffByLine.set(item.id, upsellOff);
    const unit = list;

    return {
      id: item.id,
      variantId: item.variantId,
      // A gift-only product has no page, so its line links nowhere.
      productSlug: v && !v.product.isGiftOnly ? v.product.slug : null,
      name: v?.product.name ?? item.nameSnapshot,
      variantName: v?.name ?? item.variantSnapshot,
      imageUrl:
        v?.imageUrl ?? v?.product.coverImageUrl ?? v?.product.images[0]?.url ?? null,
      unitPriceCents: unit,
      quantity: item.quantity,
      // A gift is free whatever the product costs today.
      lineTotalCents: item.isGift ? 0 : unit * item.quantity,
      stock: v ? cartLimit(v) : null,
      isGift: item.isGift,
      giftRuleId: item.giftRuleId,
      fromUpsell: item.fromUpsell,
      upsellOfferId: item.upsellOfferId,
      productId: v?.productId ?? null,
      bundleSavingsCents: 0,
      bundlePercent: 0,
      bundleUnits: 0,
      bundleUnitPriceCents: unit,
      listTotalCents: item.isGift ? 0 : list * item.quantity,
      regularUnitPriceCents: list,
      tierPercent: 0,
      tierSavingsCents: 0,
      upsellPercent: 0,
      upsellSavingsCents: 0,
      isGiftCard,
      giftCardDetails: isGiftCard ? parseGiftCardDetails(item.giftCardDetails) : null,
    };
  });

  /*
   * One offer per line, never two.
   *
   * A line can qualify for three at once: a quantity tier ("Bundle & Save"),
   * a companion deal from the product it was bought alongside, and the offer
   * it was added under from the checkout block. Applying them one after the
   * other stacked discounts on a single item - two tags and a price that
   * neither of them explained - so only the largest saving is kept and the
   * other two are cleared.
   *
   * Every candidate is measured from the list price, so they are compared on
   * the same footing instead of each discounting the one before it.
   */
  const tierPlan = applyQuantityTiers(
    lines,
    new Map(variants.map((v) => [v.productId, sanitizeTiers(v.product.quantityTiers)])),
  );
  const bundlePlan = planBundleSavings(
    lines,
    await loadAnchorRules(lines.map((l) => l.productId).filter((id): id is string => Boolean(id))),
  );

  let bundleSavingsTotal = 0;

  for (const line of lines) {
    // Gifts are free and gift cards are face value: no offer applies to either.
    if (line.isGift || line.isGiftCard) continue;

    const chosen = pickLineOffer({
      listCents: line.regularUnitPriceCents,
      quantity: line.quantity,
      offerOffCents: offerOffByLine.get(line.id) ?? 0,
      tier: tierPlan.get(line.id) ?? null,
      deal: bundlePlan.byLine[line.id] ?? null,
    });

    line.unitPriceCents = chosen.unitPriceCents;
    line.bundleUnitPriceCents = chosen.discountedUnitCents;
    line.lineTotalCents = chosen.lineTotalCents;

    if (chosen.kind === "offer") {
      line.upsellPercent = chosen.percent;
      line.upsellSavingsCents = chosen.savingCents;
    } else if (chosen.kind === "tier") {
      line.tierPercent = chosen.percent;
      line.tierSavingsCents = chosen.savingCents;
    } else if (chosen.kind === "bundle") {
      line.bundlePercent = chosen.percent;
      line.bundleUnits = chosen.units;
      line.bundleSavingsCents = chosen.savingCents;
      bundleSavingsTotal += chosen.savingCents;
    }
  }

  return {
    id: cart.id,
    lines,
    bundleSavingsCents: bundleSavingsTotal,
    tierSavingsCents: lines.reduce((n, l) => n + l.tierSavingsCents, 0),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    // Gifts are already zero-priced, but summing lineTotalCents keeps this
    // correct even if a gift line ever carries a price by accident. Gift cards
    // are counted apart, in giftCardCents.
    subtotalCents: lines
      .filter((l) => !l.isGift && !l.isGiftCard)
      .reduce((n, l) => n + l.lineTotalCents, 0),
    giftCardCents: lines
      .filter((l) => l.isGiftCard)
      .reduce((n, l) => n + l.lineTotalCents, 0),
  };
}

/**
 * Keeps the denormalised totals on Cart in step for abandoned-cart reporting,
 * and reconciles free gifts first.
 *
 * Every cart mutation already calls this, so hooking the gift engine in here
 * is what makes gifts appear and disappear on their own - there is no other
 * place a gift could be missed. Coupon-triggered rules are settled at
 * checkout instead, where the code is actually known.
 */
export async function refreshCartTotals(cartId: string): Promise<void> {
  // Gifts are settled on the priced lines - what the shopper actually pays - so
  // "spend $75" means $75 after sales, Bundle & Save and bundle deals.
  const current = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: true } });
  if (!current) return;
  const priced = await priceCart(current);
  await reconcileCartGifts(cartId, null, await giftLinesFor(priced.lines));

  const items = await prisma.cartItem.findMany({ where: { cartId } });
  await prisma.cart.update({
    where: { id: cartId },
    data: {
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items
        .filter((i) => !i.isGift)
        .reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
      lastActivityAt: new Date(),
    },
  });
}

/**
 * The cart a server action may write to. Only call from a server action or
 * route handler: a converted token is replaced by a new one, which sets the
 * cookie.
 */
export async function getOrCreateCart(token: string) {
  const existing = await loadCart(token);
  if (existing && !isClosed(existing)) return existing;

  /*
   * A signed-in shopper's new cart is tied to the account from the start, so
   * signing in elsewhere restores it and the cookie survives the browser
   * closing, as adoptCartOnLogin arranges for a claimed cart.
   */
  const customer = await getCurrentCustomer();
  const freshToken = existing ? randomBytes(24).toString("hex") : token;

  const cart = await prisma.cart.create({
    // A guest who joined the newsletter in this browser can still get a
    // reminder about this cart - see lib/shopper-email.
    data: { token: freshToken, customerId: customer?.id ?? null, email: customer?.email ?? (await knownShopperEmail()) },
    include: { items: true },
  });

  if (customer) await keepCartToken(freshToken);
  else if (existing) await setCartCookie(freshToken);
  return cart;
}

export { CART_COOKIE };
