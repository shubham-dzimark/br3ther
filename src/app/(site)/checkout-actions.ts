"use server";

import { revalidatePath } from "next/cache";
import { orderNo } from "@/lib/order-display";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { markFollowUpsConverted } from "@/lib/cart-follow-ups";
import { ensureCartToken, getCart, getOrCreateCart, refreshCartTotals, releaseCartAfterOrder } from "@/lib/cart";
import { computeTotals } from "@/lib/totals";
import { giftCardLinesValid, giftCardSummary, giftCardUsable, paidInFullByGiftCard } from "@/lib/checkout-gift-cards";
import { createPendingCards, holdRedemption } from "@/lib/gift-cards";
import { GIFT_CARD_COOKIE, parseGiftCardDetails } from "@/lib/gift-card-core";
import { confirmOrderPaid } from "@/lib/order-payment";
import { notifyAdmins } from "@/lib/notifications";
import { getEmtConfig, answerForOrder } from "@/lib/emt";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getCurrentCustomer, generateReferralCode } from "@/lib/customer-auth";
import { redeemPointsForOrder } from "@/lib/loyalty";
import { queuePortalPush } from "@/lib/portal";
import { queueOrderMail, sendOrderPlacedEmails } from "@/lib/order-mail";
import { claimGift, giftLinesFor, reconcileCartGifts } from "@/lib/gifts";
import { issueReceiptToken, receiptPath } from "@/lib/receipt";
import { canSell, sellableQuantity } from "@/lib/stock";
import { getSessionUser } from "@/lib/auth";
import { checkoutGateways } from "@/lib/payment-gateways";
import { issueNextOrderCoupon } from "@/lib/upsell-campaigns";
import {
  CRYPTO_KEY,
  cryptoPayPath,
  getCryptoConfig,
  newPaymentKey,
  queueCryptoSync,
  transactionPayload,
  upsertTransaction,
} from "@/lib/crypto-pay";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

/**
 * Sequential and zero-padded: 0001, 0002... shown as #0001.
 *
 * Derived from the highest number issued, not from a row count - counting
 * meant deleting any order handed its number to the next one and collided
 * with the unique index. Legacy "NL-2026-0001" numbers are excluded from the
 * lookup so they cannot skew the sequence while any remain.
 */
async function nextOrderNumber(): Promise<string> {
  /*
   * The numeric maximum over order numbers that are purely digits, worked out
   * in SQL. Sorting the text instead broke on any number that was not digits:
   * "C1789039942536" sorts above "0001", parses as nothing, and the next
   * number came out as 0001 again - a unique-constraint failure on every
   * checkout from then on.
   */
  const rows = await prisma.$queryRaw<{ max: bigint | number | null }[]>`
    SELECT MAX(CAST("orderNumber" AS BIGINT)) AS max
    FROM "Order"
    WHERE "orderNumber" ~ '^[0-9]+$'
  `;
  const current = Number(rows[0]?.max ?? 0);
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  return String(next).padStart(4, "0");
}

/** A unique-constraint clash on the order number, which is worth retrying. */
function isOrderNumberClash(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown }; message?: string };
  if (e?.code !== "P2002") return false;
  const target = JSON.stringify(e.meta?.target ?? "") + String(e.message ?? "");
  return /orderNumber|Order_orderNumber_key/.test(target);
}

export async function placeOrder(fd: FormData): Promise<void> {
  const cart = await getCart();
  if (cart.lines.length === 0) redirect("/#buy");

  const email = text(fd, "email").toLowerCase();
  const shipName = text(fd, "shipName");
  /*
   * Gift cards are delivered by email: a cart of nothing else has no address
   * to ship to, so the required address columns get "digital" placeholders.
   */
  const hasProducts = cart.lines.some((l) => !l.isGiftCard);
  // One card for one named person per line, or the buyer pays for a card
  // that can never be created.
  if (!giftCardLinesValid(cart.lines)) redirect("/?error=giftcard_line#buy");
  const shipLine1 = hasProducts ? text(fd, "shipLine1") : "Digital delivery";
  const shipCity = hasProducts ? text(fd, "shipCity") : "-";
  const shipRegion = hasProducts ? text(fd, "shipRegion") : "-";
  const shipPostalCode = hasProducts ? text(fd, "shipPostalCode") : "-";

  if (!email || !shipName || !shipLine1 || !shipCity || !shipRegion || !shipPostalCode) {
    redirect("/?error=missing#buy");
  }

  // Points can only be spent by a signed-in customer with a real balance.
  const current = await getCurrentCustomer();
  const requestedPoints = Math.max(0, Math.floor(Number(text(fd, "redeemPoints")) || 0));
  const balance = current
    ? ((await prisma.customer.findUnique({
        where: { id: current.id },
        select: { pointsBalance: true },
      }))?.pointsBalance ?? 0)
    : 0;

  /*
   * Gifts, settled on the priced basket before anything is priced for the
   * order. A code-unlocked gift is only known here: the code the checkout
   * accepts is worked out first, the cart is reconciled with it (adding what it
   * unlocks, dropping what no longer applies), and any gift picked on the
   * checkout form is claimed - each claim re-checked against the cart.
   */
  const giftCode = cart.id
    ? (
        await computeTotals(cart.subtotalCents, {
          couponCode: text(fd, "couponCode"),
          giftLines: await giftLinesFor(cart.lines),
          signedIn: Boolean(current),
          customerId: current?.id ?? null,
          // The email on this order, so a per-customer coupon limit holds for guests too.
          email,
        })
      ).couponCode
    : null;
  if (cart.id) {
    await reconcileCartGifts(cart.id, giftCode, await giftLinesFor(cart.lines));
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("giftChoice_") || typeof value !== "string" || !value) continue;
      const ruleId = key.slice("giftChoice_".length).replace(/_\d+$/, "");
      const now = await getCart();
      await claimGift(cart.id, ruleId, value, giftCode, await giftLinesFor(now.lines));
    }
  }
  const cartAfterGifts = await getCart();
  const giftLines = await giftLinesFor(cartAfterGifts.lines);

  /*
   * The gateway the customer picked, re-checked here: a switched-off gateway,
   * or crypto in test mode for someone who is not an admin, must not take an
   * order however the form was posted.
   */
  const admin = await getSessionUser().catch(() => null);
  const offered = await checkoutGateways({
    // Everything being paid for, gift cards included (as the page shows it).
    subtotalCents: cartAfterGifts.subtotalCents + cartAfterGifts.giftCardCents,
    isAdmin: Boolean(admin),
  });
  const postedGateway =
    offered.find((g) => g.key === text(fd, "paymentMethodKey")) ??
    (offered.length === 1 ? offered[0] : undefined);
  const giftCardCode = text(fd, "giftCardCode") || null;
  const cardUsable = await giftCardUsable(giftCardCode);

  const [emt, settings, totals] = await Promise.all([
    getEmtConfig(),
    getSettings(),
    computeTotals(cartAfterGifts.subtotalCents, {
      // A card being spent: no e-Transfer discount/surcharge on any of it -
      // the same rule the page uses, so the two always agree.
      paymentMethodKey: cardUsable ? "giftcard" : (postedGateway?.key ?? null),
      // The method the customer picked, and the basket it applies to.
      shippingMethodId: text(fd, "shippingMethodId") || null,
      variantIds: cartAfterGifts.lines
        .map((l) => l.variantId)
        .filter((id): id is string => Boolean(id)),
      giftLines,
      couponCode: text(fd, "couponCode"),
      redeemPoints: current ? requestedPoints : 0,
      pointsBalance: balance,
      referralCode: text(fd, "referralCode"),
      ownReferralCode: current?.referralCode ?? null,
      // Same rule the page enforces, re-checked here: a hand-posted form can't
      // claim a referral without an account, and can't stack three discounts.
      signedIn: Boolean(current),
      customerId: current?.id ?? null,
      // The email on this order, so a per-customer coupon limit holds for guests too.
      email,
    }),
  ]);


  /*
   * Gift cards: what a card being spent covers (products, shipping, tax -
   * never the gift cards bought alongside), and what is left to pay.
   */
  const merchTotalCents = hasProducts ? totals.totalCents : 0;
  const giftCard = await giftCardSummary({
    code: giftCardCode,
    merchTotalCents,
    giftCardCents: cartAfterGifts.giftCardCents,
  });
  if (giftCard.error) redirect("/?error=giftcard#buy");
  const amountDueCents = merchTotalCents + cartAfterGifts.giftCardCents - giftCard.appliedCents;
  // A normal $0 order (points or a coupon covering it) is not "paid by gift card".
  const paidByGiftCard = paidInFullByGiftCard({ amountDueCents, appliedCents: giftCard.appliedCents });

  // Something is left to pay: the gateway must be a real, available one.
  const gateway = paidByGiftCard ? null : postedGateway;
  if (!paidByGiftCard) {
    if (!gateway) redirect("/?error=payment#buy");
    if (!gateway.available) {
      redirect(gateway.key === "emt" ? "/?error=limits#buy" : "/?error=payment#buy");
    }
  }

  // Re-check stock at the moment of ordering; the cart may be minutes old.
  const variantIds = cartAfterGifts.lines
    .map((l) => l.variantId)
    .filter((v): v is string => Boolean(v));
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      stock: true,
      isActive: true,
      stockStatus: true,
      manageStock: true,
      backorders: true,
    },
  });
  const stockById = new Map(variants.map((v) => [v.id, v]));
  /*
   * Counted per option, not per line: a paid line and a free gift of the same
   * option both leave the shelf, so two lines must not each pass on their own
   * and oversell it together.
   */
  const wantedByVariant = new Map<string, number>();
  for (const line of cartAfterGifts.lines) {
    if (!line.variantId) redirect("/?error=stock#buy");
    wantedByVariant.set(line.variantId, (wantedByVariant.get(line.variantId) ?? 0) + line.quantity);
  }
  for (const [variantId, wanted] of wantedByVariant) {
    const v = stockById.get(variantId);
    /*
     * Ask the stock rules, not the raw count. Comparing against `stock` alone
     * refused every order for an option that does not count its stock - it
     * sits at zero by definition - and ignored backorders entirely.
     */
    if (!v || !v.isActive || !canSell(v) || sellableQuantity(v) < wanted) {
      redirect("/?error=stock#buy");
    }
  }

  // ---- Customer record (guest checkout still creates one for order history) ----
  let customer = current
    ? await prisma.customer.findUnique({ where: { id: current.id } })
    : await prisma.customer.findUnique({ where: { email } });

  const referredByCode = totals.referralCode;

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        email,
        name: shipName,
        phone: text(fd, "phone") || null,
        referralCode: generateReferralCode(shipName),
        referredByCode,
      },
    });
  } else {
    /*
     * Backfill from checkout, but never clobber. The account name is only
     * replaced when it is blank or is exactly the first word of the shipping
     * name - so "Leo" becomes "Leo Messi", while an order shipped to someone
     * else entirely leaves the account alone. Phone fills in only when unset.
     */
    const stored = (customer.name ?? "").trim();
    const shouldAdoptName =
      shipName.length > 0 &&
      stored !== shipName &&
      (stored === "" || shipName.split(/\s+/)[0] === stored);
    const phone = text(fd, "phone");
    const shouldAdoptPhone = phone.length > 0 && !customer.phone;

    if (
      (referredByCode && !customer.referredByCode) ||
      shouldAdoptName ||
      shouldAdoptPhone
    ) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(referredByCode && !customer.referredByCode ? { referredByCode } : {}),
          ...(shouldAdoptName ? { name: shipName } : {}),
          ...(shouldAdoptPhone ? { phone } : {}),
        },
      });
    }
  }

  const isCrypto = gateway?.key === CRYPTO_KEY;
  // The security answer is e-Transfer's; a crypto order has none.
  const securityAnswer = isCrypto ? null : answerForOrder(emt);
  const paymentKey = isCrypto ? newPaymentKey() : null;
  const cryptoConfig = isCrypto ? await getCryptoConfig() : null;

  /*
   * Issue a number and create the order, retrying if another checkout took the
   * same number in the same instant. Every attempt gets a fresh number.
   */
  let orderNumber = "";
  let createdOrder: Awaited<ReturnType<typeof prisma.order.create>> | null = null;
  for (let attempt = 0; attempt < 5 && !createdOrder; attempt++) {
  orderNumber = await nextOrderNumber();

  /*
   * Crypto: create the transaction on the portal FIRST, as the plugin does. If
   * the portal cannot be reached, the payment page would later have nothing to
   * show ("Transaction not found"), so the customer stays on checkout and
   * nothing is created, debited or emailed. On a number clash it is sent again
   * under the new number.
   */
  if (isCrypto && cryptoConfig) {
    const init = await upsertTransaction(
      cryptoConfig,
      await transactionPayload(
        {
          orderNumber,
          paymentKey,
          shipName,
          email,
          totalCents: amountDueCents,
          status: "AWAITING_PAYMENT",
          createdAt: new Date(),
        },
        cryptoConfig,
        "on-hold",
      ),
    );
    if (!init.ok) {
      console.error(
        `[crypto] upsert_transaction failed for order ${orderNumber}: ${init.error || "unknown"}`,
      );
      redirect("/?error=crypto_init#buy");
    }
  }

  try {
  createdOrder = await prisma.order.create({
    data: {
      orderNumber,
      status: "AWAITING_PAYMENT",
      customerId: customer.id,
      email,
      phone: text(fd, "phone") || null,
      shipName,
      shipLine1,
      shipLine2: text(fd, "shipLine2") || null,
      shipCity,
      shipRegion,
      shipPostalCode,
      shipCountry: text(fd, "shipCountry") || "CA",
      // Products only; gift cards bought are in giftCardCents.
      subtotalCents: totals.subtotalCents,
      shippingCents: hasProducts ? totals.shippingCents : 0,
      // The name as the customer saw it, so a receipt cannot contradict it.
      shippingMethod: hasProducts ? totals.shippingName : "Email delivery",
      taxCents: hasProducts ? totals.taxCents : 0,
      // The EMT adjustment is folded into the discount line so the stored
      // figures always add up to the total the customer agreed to.
      discountCents: hasProducts
        ? totals.giftDiscountCents +
          totals.discountCents +
          totals.emtAdjustmentCents +
          totals.pointsDiscountCents +
          totals.referralDiscountCents
        : 0,
      couponCode: hasProducts ? totals.couponCode : null,
      // What is left to pay after any gift card spent on this order.
      totalCents: amountDueCents,
      giftCardCents: cartAfterGifts.giftCardCents,
      giftCardRedeemedCents: giftCard.appliedCents,
      currency: settings[SETTING_KEYS.storeCurrency] || "CAD",
      paymentMethodKey: gateway?.key ?? "giftcard",
      paymentKey,
      emtSecurityAnswer: securityAnswer,
      customerNote: text(fd, "customerNote") || null,
      items: {
        /*
         * Bundle prices are stored as the price paid. A line only partly on a
         * deal (two companions, one anchor) becomes two items - the units at the
         * bundle price and the rest at the usual price - so every receipt,
         * invoice and email still reads unit x quantity = line total.
         */
        create: cartAfterGifts.lines.flatMap((l) => {
          const base = {
            variantId: l.variantId,
            nameSnapshot: l.name,
            variantSnapshot: l.variantName,
            isGift: l.isGift,
            // Carried from the cart so the upsell report can count this sale.
            fromUpsell: l.fromUpsell,
            upsellOfferId: l.upsellOfferId,
            isGiftCard: l.isGiftCard,
            giftCardDetails: l.giftCardDetails ?? undefined,
          };
          const onDeal =
            l.bundleUnits > 0
              ? [
                  {
                    ...base,
                    unitPriceCents: l.bundleUnitPriceCents,
                    quantity: l.bundleUnits,
                    lineTotalCents: l.bundleUnitPriceCents * l.bundleUnits,
                  },
                ]
              : [];
          const rest = l.quantity - l.bundleUnits;
          return rest > 0
            ? [
                ...onDeal,
                {
                  ...base,
                  unitPriceCents: l.unitPriceCents,
                  quantity: rest,
                  lineTotalCents: l.isGift ? 0 : l.unitPriceCents * rest,
                },
              ]
            : onDeal;
        }),
      },
    },
  });

  } catch (err) {
    if (isOrderNumberClash(err) && attempt < 4) continue;
    throw err;
  }
  }
  // A const from here on, so every use below stays narrowed to a real order.
  const order = createdOrder;
  if (!order) redirect("/?error=missing#buy");

  /*
   * "Save this address for future orders": the shipping address goes into the
   * signed-in customer's address book as the default, unless it is already
   * there. Best effort - a failure here never costs the order.
   */
  if (current && hasProducts && fd.get("saveAddress") === "on") {
    await (async () => {
      const same = await prisma.address.findFirst({
        where: { customerId: current.id, line1: order.shipLine1, postalCode: order.shipPostalCode },
        select: { id: true },
      });
      const target =
        same ??
        (await prisma.address.create({
          data: {
            customerId: current.id,
            fullName: order.shipName,
            line1: order.shipLine1,
            line2: order.shipLine2,
            city: order.shipCity,
            region: order.shipRegion,
            postalCode: order.shipPostalCode,
            country: order.shipCountry,
            phone: order.phone,
          },
          select: { id: true },
        }));
      await prisma.$transaction([
        prisma.address.updateMany({ where: { customerId: current.id }, data: { isDefault: false } }),
        prisma.address.update({ where: { id: target.id }, data: { isDefault: true } }),
      ]);
    })().catch(() => undefined);
  }

  /*
   * Gift cards bought: one PENDING card per line, activated when the payment
   * is confirmed. A card being spent: its amount is held now. If the card no
   * longer covers it (spent in another tab a moment ago), the order is
   * withdrawn - its cards go with it - and the shopper is told.
   */
  const giftCardItems = await prisma.orderItem.findMany({
    where: { orderId: order.id, isGiftCard: true },
    select: { id: true, unitPriceCents: true, giftCardDetails: true },
  });
  if (giftCardItems.length) {
    await createPendingCards(
      order.id,
      giftCardItems.flatMap((i) => {
        const details = parseGiftCardDetails(i.giftCardDetails);
        return details ? [{ orderItemId: i.id, initialCents: i.unitPriceCents, details }] : [];
      }),
      email,
    );
  }
  if (giftCard.code && giftCard.appliedCents > 0) {
    const held = await holdRedemption(giftCard.code, order.id, giftCard.appliedCents);
    if (!held.ok) {
      // Cards outlive deleted orders (SetNull), so this withdrawn order's
      // never-paid cards are removed by hand.
      await prisma.giftCard.deleteMany({ where: { purchaseOrderId: order.id, status: "PENDING" } });
      await prisma.order.delete({ where: { id: order.id } });
      redirect("/?error=giftcard#buy");
    }
    await prisma.order.update({ where: { id: order.id }, data: { giftCardRedeemedId: held.cardId } });
  }

  // Link order items back to products where we can, for reporting.
  if (variantIds.length) {
    const withProduct = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    await Promise.all(
      withProduct.map((v) =>
        prisma.orderItem.updateMany({
          where: { orderId: order.id, variantId: v.id },
          data: { productId: v.productId },
        }),
      ),
    );
  }

  /*
   * Debit the points only after the order exists, so a failure can't burn them.
   *
   * The debit is conditional on the balance still being sufficient, so it can
   * come back short - two checkouts started together, or a balance spent in
   * another tab. The order was priced on the requested figure, so any
   * shortfall is put back on the bill rather than being given away: previously
   * the return value was ignored and the customer kept a discount they had not
   * paid for in points.
   */
  if (current && totals.pointsRedeemed > 0) {
    const debited = await redeemPointsForOrder(customer.id, order.id, totals.pointsRedeemed);
    const shortfall = totals.pointsRedeemed - debited;

    if (shortfall > 0) {
      const lostDiscount = Math.round(
        (totals.pointsDiscountCents * shortfall) / totals.pointsRedeemed,
      );
      if (lostDiscount > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            discountCents: { decrement: lostDiscount },
            totalCents: { increment: lostDiscount },
          },
        });
      }
    }
  }

  if (totals.couponCode && totals.discountCents > 0) {
    // Only a code that took money off counts as redeemed. updateMany, because a
    // code that exists only to unlock a gift has no coupon row, and update()
    // would throw after the order was already created.
    await prisma.coupon.updateMany({
      where: { code: totals.couponCode },
      data: { timesRedeemed: { increment: 1 } },
    });
  }

  // Record the referral so it can be rewarded once the order is paid.
  if (referredByCode) {
    const referrer = await prisma.customer.findUnique({
      where: { referralCode: referredByCode },
    });
    if (referrer && referrer.id !== customer.id) {
      await prisma.referralEvent.create({
        data: {
          code: referredByCode,
          referrerId: referrer.id,
          referredEmail: email,
          orderId: order.id,
        },
      });
    }
  }

  // Mark the cart converted rather than deleting it, so abandoned-cart
  // reporting can tell the difference between "left" and "bought".
  if (cart.id) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { status: "CONVERTED", recoveredOrderId: order.id, itemCount: 0, subtotalCents: 0 },
    });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    // Credit the follow-up that brought them back, if one did.
    await markFollowUpsConverted(cart.id, order.id, totals.totalCents);
    await releaseCartAfterOrder();
  }

  if (emt.debugLog) {
    const h = await headers();
    console.log(
      `[emt] order ${orderNumber} placed for ${email} (${totals.totalCents}c) from ${
        h.get("x-forwarded-for") ?? "unknown"
      }`,
    );
  }

  // Fire-and-forget: the customer must never wait on the portal.
  await notifyAdmins({
    type: "ORDER_PLACED",
    title: `New order ${orderNo(order.orderNumber)}`,
    body: `${order.shipName} · ${(order.totalCents / 100).toFixed(2)} ${order.currency}`,
    href: `/admin/orders/${order.id}`,
  });

  queuePortalPush(order.id);
  // Brings the portal's copy up to date if the points debit changed the total.
  queueCryptoSync(order.id);

  // Confirmation to the buyer (with the e-Transfer details) and the copy to
  // staff. Not awaited: a refused SMTP login must not turn a placed order
  // into an error page for someone who has already paid attention to us.
  /*
   * The receipt is not readable from its order number alone - those are
   * sequential - so the buyer leaves checkout holding a capability token.
   * Issued before the mail is queued so the email carries this same link,
   * rather than a second token that would revoke the one in the browser.
   */
  const receiptToken = await issueReceiptToken(order.id);
  // A Next Order Coupon campaign's reward, issued before the email so it can
  // carry the code. Inactive until the order is paid (see confirmOrderPaid).
  await issueNextOrderCoupon(order.id);
  // The card code has done its job; don't carry it into the next order.
  if (giftCardCode) (await cookies()).delete(GIFT_CARD_COOKIE);

  /*
   * Paid in full by a gift card: there is no transfer to wait for, so the
   * order is confirmed now - the same path staff use, which reserves stock,
   * awards points and issues any gift cards bought. Re-read first: a points
   * shortfall above can have put something back on the bill.
   */
  if (paidByGiftCard) {
    const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { totalCents: true } });
    if (fresh?.totalCents === 0) {
      await confirmOrderPaid(order.id, { note: "Paid in full by gift card" });
    }
  }

  queueOrderMail(sendOrderPlacedEmails, order.id, receiptToken);

  revalidatePath("/", "layout");
  // Crypto orders go straight to their payment page, as the plugin redirects.
  redirect(
    isCrypto ? cryptoPayPath(orderNumber, receiptToken) : receiptPath(orderNumber, receiptToken),
  );
}

/**
 * The one-page site's buy button: one product, chosen flavour/size and a
 * quantity, then straight to the order. The cart is still the record placeOrder
 * reads (it re-prices, checks stock and converts it), so the chosen line
 * replaces whatever the cart held and the shared checkout logic runs unchanged.
 */
export async function buyNow(fd: FormData): Promise<void> {
  const variantId = text(fd, "variantId");
  const quantity = Math.min(10, Math.max(1, Math.floor(Number(text(fd, "quantity")) || 1)));

  const variant = variantId
    ? await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { select: { name: true, status: true } } },
      })
    : null;
  if (!variant || !variant.isActive || variant.product.status !== "PUBLISHED") {
    redirect("/?error=stock#buy");
  }

  const cart = await getOrCreateCart(await ensureCartToken());
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      variantId: variant.id,
      nameSnapshot: variant.product.name,
      variantSnapshot: variant.name,
      unitPriceCents: variant.priceCents,
      quantity,
    },
  });
  await refreshCartTotals(cart.id);

  await placeOrder(fd);
}
