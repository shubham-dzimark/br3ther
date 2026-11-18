/*
 * Regressions for the five findings in the independent QA report of
 * 10 September 2026. Run against the isolated `br3thr_audit` database:
 *
 *   cd /var/www/br3thr && set -a && . ./.env && set +a
 *   npx tsx --conditions=react-server tests/qa-regressions.ts
 *
 * Every row it creates is synthetic and removed at the end.
 */
import { prisma } from "../src/lib/prisma";
import { confirmOrderPaid, reverseOrderPayment } from "../src/lib/order-payment";
import { createClaimToken, peekClaimToken, consumeClaimToken } from "../src/lib/customer-verify";
import { can } from "../src/lib/capabilities";

let pass = 0, fail = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
};

const guard = () => {
  if (!/br3thr_audit/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing to run: DATABASE_URL is not the audit database.");
  }
};

(async () => {
  guard();
  const stamp = Date.now();
  const cat = await prisma.category.create({ data: { name: `QA${stamp}`, slug: `qa-${stamp}` } });
  const product = await prisma.product.create({
    data: { name: "QA Item", slug: `qa-${stamp}`, status: "PUBLISHED", categoryId: cat.id },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, name: "Default", sku: `QA-${stamp}`, priceCents: 1000, stock: 100 },
  });
  const ship = { shipName: "S", shipLine1: "1", shipCity: "T", shipRegion: "BC", shipPostalCode: "V0V0V0", shipCountry: "CA" };
  const mkOrder = (n: string) => prisma.order.create({
    data: {
      orderNumber: n, email: `qa-${stamp}@example.test`, ...ship,
      subtotalCents: 3000, totalCents: 3000, currency: "CAD",
      items: { create: [{ nameSnapshot: "QA Item", variantId: variant.id, unitPriceCents: 1000, quantity: 3, lineTotalCents: 3000 }] },
    },
  });

  console.log("\n-- QA finding 2: a paid order must still advance through fulfilment --");
  const o1 = await mkOrder(`QA2-${stamp}`);
  await confirmOrderPaid(o1.id, { status: "PAYMENT_RECEIVED" });
  for (const next of ["PROCESSING", "SHIPPED", "DELIVERED"] as const) {
    await confirmOrderPaid(o1.id, { status: next });
    const row = await prisma.order.findUnique({ where: { id: o1.id } });
    check(`already-paid order advances to ${next}`, row!.status, next);
  }
  const stockAfterAdvance = await prisma.productVariant.findUnique({ where: { id: variant.id } });
  check("advancing never decrements stock again (100 - 3)", stockAfterAdvance!.stock, 97);

  console.log("\n-- QA finding 4: cancelling restores stock, once --");
  const o2 = await mkOrder(`QA4-${stamp}`);
  await confirmOrderPaid(o2.id, { status: "PAYMENT_RECEIVED" });
  check("stock after confirming second order", (await prisma.productVariant.findUnique({ where: { id: variant.id } }))!.stock, 94);
  check("first cancel reverses", await reverseOrderPayment(o2.id, "CANCELLED"), true);
  check("stock restored to 97", (await prisma.productVariant.findUnique({ where: { id: variant.id } }))!.stock, 97);
  check("order is cancelled", (await prisma.order.findUnique({ where: { id: o2.id } }))!.status, "CANCELLED");
  check("second cancel is a no-op", await reverseOrderPayment(o2.id, "CANCELLED"), false);
  check("stock unchanged after repeat cancel", (await prisma.productVariant.findUnique({ where: { id: variant.id } }))!.stock, 97);

  console.log("\n-- QA finding 4b: cancelling an unpaid order must not invent stock --");
  const o3 = await mkOrder(`QA4b-${stamp}`);
  check("unpaid cancel reverses", await reverseOrderPayment(o3.id, "CANCELLED"), true);
  check("stock untouched for an unpaid order", (await prisma.productVariant.findUnique({ where: { id: variant.id } }))!.stock, 97);

  console.log("\n-- QA finding 3: fulfilment roles keep fulfilment --");
  check("STORE_MANAGER has orders", can("STORE_MANAGER", "orders"), true);
  check("STORE_MANAGER has no order_payments", can("STORE_MANAGER", "order_payments"), false);
  const paidOrder = await prisma.order.findUnique({ where: { id: o1.id }, select: { paymentConfirmedAt: true } });
  check("a paid order needs no money capability to ship", paidOrder!.paymentConfirmedAt !== null, true);
  const unpaidCount = await prisma.order.count({ where: { id: { in: [o3.id] }, paymentConfirmedAt: null } });
  check("an unpaid order is detected as needing it", unpaidCount, 1);

  console.log("\n-- QA finding 1: the claim link is not spent by being looked at --");
  const guest = await prisma.customer.create({ data: { email: `qa1-${stamp}@example.test`, name: "QA Guest" } });
  const token = await createClaimToken({ customerId: guest.id, pendingPasswordHash: "$2a$12$qa" });
  check("peek reports valid", await peekClaimToken(token), "valid");
  check("peek does not consume it", await peekClaimToken(token), "valid");
  check("password still unset after peeking", (await prisma.customer.findUnique({ where: { id: guest.id } }))!.passwordHash, null);
  check("consuming works", (await consumeClaimToken(token)).ok, true);
  check("peek now reports spent", await peekClaimToken(token), "used_or_expired");

  await prisma.order.deleteMany({ where: { id: { in: [o1.id, o2.id, o3.id] } } });
  await prisma.customer.deleteMany({ where: { id: guest.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.category.delete({ where: { id: cat.id } });

  console.log(`\n  ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
})();
