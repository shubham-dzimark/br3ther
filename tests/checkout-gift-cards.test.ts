import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { giftCardSummary } from "@/lib/checkout-gift-cards";
import { formatGiftCardCode, generateGiftCardCode, normalizeGiftCardCode } from "@/lib/gift-card-core";

const TAG = "test-checkout-gc@localhost.test";

after(async () => {
  await prisma.giftCard.deleteMany({ where: { buyerEmail: TAG } });
  await prisma.$disconnect();
});

async function card(balanceCents: number, status: "ACTIVE" | "PENDING" | "VOID" = "ACTIVE") {
  return prisma.giftCard.create({
    data: {
      code: normalizeGiftCardCode(generateGiftCardCode()),
      initialCents: Math.max(balanceCents, 5000),
      balanceCents,
      status,
      buyerEmail: TAG,
      senderName: "Al",
      recipientName: "Sam",
      deliverTo: "BUYER",
    },
  });
}

test("a card pays toward the order and the rest stays on it", async () => {
  const c = await card(10000);
  const s = await giftCardSummary({ code: c.code.toLowerCase(), merchTotalCents: 6000, giftCardCents: 0 });
  assert.deepEqual(s, { code: formatGiftCardCode(c.code), appliedCents: 6000, leftCents: 4000, error: null });
});

test("a card never pays for gift cards in the same order", async () => {
  const c = await card(20000);
  const s = await giftCardSummary({ code: c.code, merchTotalCents: 3000, giftCardCents: 5000 });
  assert.equal(s.appliedCents, 3000);
  assert.equal(s.leftCents, 17000);
});

test("a code that cannot be used says why", async () => {
  assert.equal((await giftCardSummary({ code: "GDFR-ZZZZ-ZZZZ", merchTotalCents: 5000, giftCardCents: 0 })).error, "We couldn't find that gift card.");
  const pending = await card(0, "PENDING");
  assert.equal((await giftCardSummary({ code: pending.code, merchTotalCents: 5000, giftCardCents: 0 })).error, "This gift card isn't active yet.");
  const empty = await card(0);
  assert.equal((await giftCardSummary({ code: empty.code, merchTotalCents: 5000, giftCardCents: 0 })).error, "This gift card has no balance left.");
  const voided = await card(3000, "VOID");
  assert.equal((await giftCardSummary({ code: voided.code, merchTotalCents: 5000, giftCardCents: 0 })).error, "This gift card can no longer be used.");
});

test("no code means nothing applied and no error", async () => {
  assert.deepEqual(await giftCardSummary({ code: "  ", merchTotalCents: 5000, giftCardCents: 0 }), {
    code: null,
    appliedCents: 0,
    leftCents: 0,
    error: null,
  });
});

test("the balance check tells the shopper what is left, or why it can't be used", async () => {
  const { giftCardBalanceMessage } = await import("@/lib/checkout-gift-cards");
  const live = await card(4000);
  assert.deepEqual(await giftCardBalanceMessage(live.code.toLowerCase()), {
    ok: true,
    message: `$40.00 left on ${formatGiftCardCode(live.code)}.`,
  });
  assert.deepEqual(await giftCardBalanceMessage("GDFR-ZZZZ-ZZZZ"), { ok: false, message: "We couldn't find that gift card." });
  const pending = await card(0, "PENDING");
  assert.deepEqual(await giftCardBalanceMessage(pending.code), {
    ok: false,
    message: "This gift card isn't active yet — it starts working once the payment for it is confirmed.",
  });
  assert.deepEqual(await giftCardBalanceMessage(""), { ok: false, message: "Enter your gift card code." });
});
