import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { planBuyAgain } from "@/lib/buy-again";
import { createPendingCards, holdRedemption, reverseGiftCardsForOrder } from "@/lib/gift-cards";
import {
  giftCardLinesValid,
  giftCardUsable,
  paidInFullByGiftCard,
} from "@/lib/checkout-gift-cards";
import { clientIpFrom } from "@/lib/client-ip";
import { generateGiftCardCode, normalizeGiftCardCode, type GiftCardDetails } from "@/lib/gift-card-core";

/* Regression tests for the final review's findings. Local DB only; every row
   is tagged and removed at the end. */
const TAG = "test-review-fixes@localhost.test";
const orderIds: string[] = [];

after(async () => {
  await prisma.giftCard.deleteMany({ where: { buyerEmail: TAG } });
  await prisma.adminNotification.deleteMany({ where: { href: { in: orderIds.map((id) => `/admin/orders/${id}`) } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.$disconnect();
});

async function makeOrder(status: "AWAITING_PAYMENT" | "CANCELLED" = "AWAITING_PAYMENT") {
  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-RF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status,
      email: TAG,
      shipName: "Test",
      shipLine1: "Digital delivery",
      shipCity: "-",
      shipRegion: "-",
      shipPostalCode: "-",
      subtotalCents: 0,
      totalCents: 0,
    },
  });
  orderIds.push(order.id);
  return order;
}

const DETAILS: GiftCardDetails = {
  deliverTo: "RECIPIENT",
  recipientName: "Sam",
  recipientEmail: "sam@example.com",
  senderName: "Al",
  message: null,
};

async function orderWithCard(cents = 5000) {
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: cents, quantity: 1, lineTotalCents: cents, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: cents, details: DETAILS }], TAG);
  return order;
}

async function activeCard(cents: number) {
  return prisma.giftCard.create({
    data: {
      code: normalizeGiftCardCode(generateGiftCardCode()),
      initialCents: cents,
      balanceCents: cents,
      status: "ACTIVE",
      buyerEmail: TAG,
      senderName: "Al",
      recipientName: "Sam",
      deliverTo: "BUYER",
    },
  });
}

// C-1: "Buy again" must never re-add a gift card - it would have no recipient.
test("buy again skips gift cards", () => {
  const product = {
    name: "Gift Card",
    status: "PUBLISHED",
    isGiftOnly: false,
    type: "GIFT_CARD",
    soldIndividually: false,
    discountActive: false,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
  };
  const variant = {
    id: "v1",
    name: "$100",
    priceCents: 10000,
    compareAtCents: null,
    stock: 0,
    stockStatus: "IN_STOCK",
    manageStock: false,
    backorders: "NO",
    product,
  };
  const plan = planBuyAgain([{ variantId: "v1", quantity: 1, isGift: false }], [variant as never]);
  assert.equal(plan.lines.length, 0);
  assert.equal(plan.skipped, 1);
});

// C-1: a gift card line without a recipient, or bumped to quantity 2, is refused at checkout.
test("checkout refuses gift card lines that don't describe exactly one card for one person", () => {
  assert.equal(giftCardLinesValid([{ isGiftCard: true, quantity: 1, giftCardDetails: DETAILS }]), true);
  assert.equal(giftCardLinesValid([{ isGiftCard: true, quantity: 2, giftCardDetails: DETAILS }]), false);
  assert.equal(giftCardLinesValid([{ isGiftCard: true, quantity: 1, giftCardDetails: null }]), false);
  assert.equal(giftCardLinesValid([{ isGiftCard: false, quantity: 3, giftCardDetails: null }]), true);
});

// C-2: an unpaid order auto-cancelled, then paid late, still gets its card.
test("a cancelled-then-paid gift card order still issues its card", async () => {
  const { confirmOrderPaid, reverseOrderPayment } = await import("@/lib/order-payment");
  const order = await orderWithCard();
  await reverseOrderPayment(order.id);
  const pendingAfterCancel = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(pendingAfterCancel.status, "PENDING");

  await confirmOrderPaid(order.id, { note: "late transfer" });
  const issued = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(issued.status, "ACTIVE");
  assert.equal(issued.balanceCents, 5000);
});

// C-2: reopening an order whose card amount was returned on cancel warns staff.
test("reopening an order a card paid toward warns staff the card amount was returned", async () => {
  const { confirmOrderPaid, reverseOrderPayment } = await import("@/lib/order-payment");
  const card = await activeCard(3000);
  const order = await makeOrder();
  await holdRedemption(card.code, order.id, 2000);
  await prisma.order.update({ where: { id: order.id }, data: { giftCardRedeemedCents: 2000, giftCardRedeemedId: card.id } });
  await reverseOrderPayment(order.id);
  await confirmOrderPaid(order.id, { note: "reopened" });
  const after_ = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.match(after_.staffNote ?? "", /gift card/i);
  assert.match(after_.staffNote ?? "", /collect/i);
});

// I-1: deleting an old order must not delete the live cards it bought.
test("deleting an order keeps the gift cards it bought", async () => {
  const { confirmOrderPaid } = await import("@/lib/order-payment");
  const order = await orderWithCard();
  await confirmOrderPaid(order.id, { note: "paid" });
  const card = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  const survivor = await prisma.giftCard.findUnique({ where: { id: card.id } });
  assert.ok(survivor);
  assert.equal(survivor!.status, "ACTIVE");
  assert.equal(survivor!.purchaseOrderId, null);
  // A pending card of a withdrawn order is still cleaned up explicitly elsewhere.
  await reverseGiftCardsForOrder(order.id);
});

// I-2: the rate limiter keys on the address the proxy saw, not one the client typed.
test("client address ignores a spoofed X-Forwarded-For prefix", () => {
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" })), "198.51.100.7");
  assert.equal(clientIpFrom(new Headers()), null);
});

// I-3: a $0 order covered by points or a coupon is not "paid by gift card".
test("only an order a card actually paid counts as paid by gift card", () => {
  assert.equal(paidInFullByGiftCard({ amountDueCents: 0, appliedCents: 0 }), false);
  assert.equal(paidInFullByGiftCard({ amountDueCents: 0, appliedCents: 2500 }), true);
  assert.equal(paidInFullByGiftCard({ amountDueCents: 100, appliedCents: 2500 }), false);
});

// I-4: whether a card will be spent is known before totals, so no e-Transfer
// discount is worked out on money a card pays.
test("a card is usable only when active with something left on it", async () => {
  const live = await activeCard(1000);
  const empty = await activeCard(0);
  assert.equal(await giftCardUsable(live.code), true);
  assert.equal(await giftCardUsable(empty.code), false);
  assert.equal(await giftCardUsable("GDFR-NONE-NONE"), false);
  assert.equal(await giftCardUsable(null), false);
});
