import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  findGiftCard,
  createPendingCards,
  holdRedemption,
  issueCardsForOrder,
  reverseGiftCardsForOrder,
  adjustGiftCard,
} from "@/lib/gift-cards";
import { generateGiftCardCode, normalizeGiftCardCode, type GiftCardDetails } from "@/lib/gift-card-core";

/*
 * Runs against the local database. Every row it makes is tagged with this
 * buyer email or an order number starting TEST-GC-, and removed at the end.
 */
const TAG = "test-giftcards@localhost.test";
const orderIds: string[] = [];

after(async () => {
  await prisma.giftCard.deleteMany({ where: { buyerEmail: TAG } });
  // confirmOrderPaid notifies staff about these throwaway orders.
  await prisma.adminNotification.deleteMany({
    where: { href: { in: orderIds.map((id) => `/admin/orders/${id}`) } },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.$disconnect();
});

async function makeOrder(status: "AWAITING_PAYMENT" | "CANCELLED" = "AWAITING_PAYMENT") {
  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-GC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

const DETAILS: GiftCardDetails = {
  deliverTo: "RECIPIENT",
  recipientName: "Sam",
  recipientEmail: "sam@example.com",
  senderName: "Al",
  message: "Happy birthday",
};

test("a typed code finds its card whatever the case or dashes", async () => {
  const card = await activeCard(5000);
  const typed = `${card.code.slice(0, 4)}-${card.code.slice(4, 8)}-${card.code.slice(8)}`.toLowerCase();
  assert.equal((await findGiftCard(typed))?.id, card.id);
  assert.equal(await findGiftCard("GDFR-NONE-NONE"), null);
});

test("a redemption holds the amount, and a second one beyond the balance is refused", async () => {
  const card = await activeCard(5000);
  const o1 = await makeOrder();
  const o2 = await makeOrder();
  assert.deepEqual(await holdRedemption(card.code, o1.id, 3000), { ok: true, cardId: card.id });
  assert.deepEqual(await holdRedemption(card.code, o2.id, 3000), { ok: false, error: "insufficient" });
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balanceCents, 2000);
});

test("two orders racing for the same card never spend more than its balance", async () => {
  const card = await activeCard(5000);
  const [a, b] = [await makeOrder(), await makeOrder()];
  const results = await Promise.all([
    holdRedemption(card.code, a.id, 4000),
    holdRedemption(card.code, b.id, 4000),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balanceCents, 1000);
});

test("cards bought on an order are issued once, however often payment is confirmed", async () => {
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 10000, quantity: 1, lineTotalCents: 10000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 10000, details: DETAILS }], TAG);

  const first = await issueCardsForOrder(order.id);
  assert.equal(first.length, 1);
  assert.equal(first[0].status, "ACTIVE");
  assert.equal(first[0].balanceCents, 10000);
  assert.deepEqual(await issueCardsForOrder(order.id), []);
  assert.equal(await prisma.giftCardTransaction.count({ where: { giftCardId: first[0].id, kind: "ISSUE" } }), 1);
});

test("a cancelled order never issues its cards", async () => {
  const order = await makeOrder("CANCELLED");
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 5000, quantity: 1, lineTotalCents: 5000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 5000, details: DETAILS }], TAG);
  assert.deepEqual(await issueCardsForOrder(order.id), []);
  const card = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(card.status, "PENDING");
});

test("cancelling an order that used a card gives the amount back exactly once", async () => {
  const card = await activeCard(5000);
  const order = await makeOrder();
  await holdRedemption(card.code, order.id, 3000);
  await reverseGiftCardsForOrder(order.id);
  await reverseGiftCardsForOrder(order.id);
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balanceCents, 5000);
});

test("cancelling the order that bought a partly spent card voids what is left and reports it", async () => {
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 10000, quantity: 1, lineTotalCents: 10000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 10000, details: DETAILS }], TAG);
  const [card] = await issueCardsForOrder(order.id);
  await holdRedemption(card.code, (await makeOrder()).id, 2500);

  const result = await reverseGiftCardsForOrder(order.id);
  const after_ = await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
  assert.equal(after_.status, "VOID");
  assert.equal(after_.balanceCents, 0);
  assert.deepEqual(result.partlySpent, [card.code]);
  assert.equal(result.voided, 1);
});

test("an admin adjustment changes the balance and is recorded with its note", async () => {
  const card = await activeCard(5000);
  await adjustGiftCard(card.id, 500, "Goodwill", "admin-test");
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balanceCents, 5500);
  const row = await prisma.giftCardTransaction.findFirstOrThrow({ where: { giftCardId: card.id, kind: "ADJUST" } });
  assert.equal(row.amountCents, 500);
  assert.equal(row.note, "Goodwill");
  assert.equal(row.adminId, "admin-test");
});

test("confirming payment activates the order's cards, and confirming again changes nothing", async () => {
  const { confirmOrderPaid } = await import("@/lib/order-payment");
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 5000, quantity: 1, lineTotalCents: 5000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 5000, details: DETAILS }], TAG);

  await confirmOrderPaid(order.id, { note: "test" });
  await confirmOrderPaid(order.id, { note: "test again" });

  const card = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(card.status, "ACTIVE");
  assert.equal(card.balanceCents, 5000);
  assert.equal(await prisma.giftCardTransaction.count({ where: { giftCardId: card.id, kind: "ISSUE" } }), 1);
});

test("cancelling an order voids the cards it bought and returns what a card paid toward it", async () => {
  const { confirmOrderPaid, reverseOrderPayment } = await import("@/lib/order-payment");
  const spend = await activeCard(4000);
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 5000, quantity: 1, lineTotalCents: 5000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 5000, details: DETAILS }], TAG);
  await holdRedemption(spend.code, order.id, 1500);
  await confirmOrderPaid(order.id, { note: "test" });

  assert.equal(await reverseOrderPayment(order.id), true);
  const bought = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  assert.equal(bought.status, "VOID");
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: spend.id } })).balanceCents, 4000);
});

test("cancelling the order that bought a card already partly spent leaves a note for staff", async () => {
  const { confirmOrderPaid, reverseOrderPayment } = await import("@/lib/order-payment");
  const order = await makeOrder();
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, nameSnapshot: "Gift Card", unitPriceCents: 5000, quantity: 1, lineTotalCents: 5000, isGiftCard: true },
  });
  await createPendingCards(order.id, [{ orderItemId: item.id, initialCents: 5000, details: DETAILS }], TAG);
  await confirmOrderPaid(order.id, { note: "test" });
  const card = await prisma.giftCard.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
  await holdRedemption(card.code, (await makeOrder()).id, 1000);

  await reverseOrderPayment(order.id);
  const after_ = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.match(after_.staffNote ?? "", /partly used/i);
  assert.match(after_.staffNote ?? "", new RegExp(card.code.slice(4, 8)));
});
