/*
 * Regressions for the verification review of 10 September 2026 (PARTIAL PASS).
 *
 *   cd /var/www/br3thr && set -a && . ./.env && set +a
 *   npx tsx --conditions=react-server tests/lifecycle-regressions.ts
 *
 * Exercises the real order-payment lifecycle against PostgreSQL. Every row is
 * synthetic and removed at the end.
 */
import { prisma } from "../src/lib/prisma";
import { confirmOrderPaid, reverseOrderPayment } from "../src/lib/order-payment";
import { checkReceiptAccess } from "../src/lib/receipt";

let pass = 0, fail = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
};
if (!/br3thr_audit/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing to run: DATABASE_URL is not the audit database.");
}

(async () => {
  const stamp = Date.now();
  const cat = await prisma.category.create({ data: { name: `LC${stamp}`, slug: `lc-${stamp}` } });
  const product = await prisma.product.create({
    data: { name: "LC Item", slug: `lc-${stamp}`, status: "PUBLISHED", categoryId: cat.id },
  });
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, name: "Default", sku: `LC-${stamp}`, priceCents: 1000, stock: 100 },
  });
  const ship = { shipName: "S", shipLine1: "1", shipCity: "T", shipRegion: "BC", shipPostalCode: "V0V0V0", shipCountry: "CA" };
  const mk = (n: string) => prisma.order.create({
    data: {
      orderNumber: n, email: `lc-${stamp}@example.test`, ...ship,
      subtotalCents: 3000, totalCents: 3000, currency: "CAD",
      items: { create: [{ nameSnapshot: "LC Item", variantId: variant.id, unitPriceCents: 1000, quantity: 3, lineTotalCents: 3000 }] },
    },
  });
  const stock = async () => (await prisma.productVariant.findUnique({ where: { id: variant.id } }))!.stock;

  console.log("\n-- review finding 2: cancel, reopen, cancel must not inflate stock --");
  const o = await mk(`LC2-${stamp}`);
  check("start", await stock(), 100);
  await confirmOrderPaid(o.id, { status: "PAYMENT_RECEIVED" });
  check("confirm takes 3", await stock(), 97);
  await reverseOrderPayment(o.id, "CANCELLED");
  check("cancel gives 3 back", await stock(), 100);
  await confirmOrderPaid(o.id, { status: "PROCESSING" });
  check("reopening takes them again", await stock(), 97);
  check("order really is reopened", (await prisma.order.findUnique({ where: { id: o.id } }))!.status, "PROCESSING");
  await reverseOrderPayment(o.id, "CANCELLED");
  check("cancelling again gives back only what was held", await stock(), 100);
  await reverseOrderPayment(o.id, "CANCELLED");
  check("a repeat cancel is still a no-op", await stock(), 100);

  console.log("\n-- fulfilment of a paid order still never re-takes stock --");
  const o2 = await mk(`LC2b-${stamp}`);
  await confirmOrderPaid(o2.id, { status: "PAYMENT_RECEIVED" });
  check("confirmed", await stock(), 97);
  for (const st of ["PROCESSING", "SHIPPED", "DELIVERED"] as const) {
    await confirmOrderPaid(o2.id, { status: st });
  }
  check("three fulfilment moves, stock unchanged", await stock(), 97);
  check("final status", (await prisma.order.findUnique({ where: { id: o2.id } }))!.status, "DELIVERED");
  await reverseOrderPayment(o2.id, "REFUNDED");
  check("refund restores", await stock(), 100);

  console.log("\n-- review finding 3: portal-style call order restores stock --");
  const o3 = await mk(`LC3-${stamp}`);
  await confirmOrderPaid(o3.id, { status: "PAYMENT_RECEIVED" });
  check("confirmed", await stock(), 97);
  // The portal writes metadata but must NOT pre-write CANCELLED.
  await prisma.order.update({ where: { id: o3.id }, data: { portalStatus: "callback:reversed" } });
  check("reversal reports success", await reverseOrderPayment(o3.id, "CANCELLED"), true);
  check("stock restored through the portal path", await stock(), 100);

  console.log("\n-- review: receipt email fallback must not cross accounts --");
  const a = await prisma.customer.create({ data: { email: `shared-${stamp}@example.test`, name: "A" } });
  check("guest order, same email -> owner", checkReceiptAccess({
    orderCustomerId: null, orderEmail: a.email, receiptTokenHash: null,
    viewerCustomerId: a.id, viewerEmail: a.email, token: null }), "owner");
  check("order owned by SOMEONE ELSE, same email -> denied", checkReceiptAccess({
    orderCustomerId: "some-other-customer-id", orderEmail: a.email, receiptTokenHash: null,
    viewerCustomerId: a.id, viewerEmail: a.email, token: null }), "denied");

  await prisma.order.deleteMany({ where: { id: { in: [o.id, o2.id, o3.id] } } });
  await prisma.customer.delete({ where: { id: a.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.category.delete({ where: { id: cat.id } });
  console.log(`\n  ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
})();
