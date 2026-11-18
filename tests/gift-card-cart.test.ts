import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { priceCart } from "@/lib/cart";
import { giftLinesFor } from "@/lib/gifts";

/*
 * Prices real carts in the local database. Every cart it makes carries a
 * TEST-GC-CART- token and is removed at the end.
 */
const cartIds: string[] = [];
let productDiscountRestore: { id: string; discountActive: boolean; discountPercent: number } | null = null;

after(async () => {
  await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  if (productDiscountRestore) {
    await prisma.product.update({
      where: { id: productDiscountRestore.id },
      data: {
        discountActive: productDiscountRestore.discountActive,
        discountPercent: productDiscountRestore.discountPercent,
      },
    });
  }
  await prisma.$disconnect();
});

const variantBySku = (sku: string) => prisma.productVariant.findUniqueOrThrow({ where: { sku } });
const plainVariant = () =>
  prisma.productVariant.findFirstOrThrow({
    where: { product: { slug: "demo-vitamin-d3-2000-iu-softgels" }, isActive: true },
  });

async function cartWith(items: { variantId: string; unitPriceCents: number; quantity?: number; giftCardDetails?: object }[]) {
  const cart = await prisma.cart.create({
    data: {
      token: `TEST-GC-CART-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      items: {
        create: items.map((i) => ({
          variantId: i.variantId,
          nameSnapshot: "test",
          unitPriceCents: i.unitPriceCents,
          quantity: i.quantity ?? 1,
          giftCardDetails: i.giftCardDetails,
        })),
      },
    },
    include: { items: true },
  });
  cartIds.push(cart.id);
  return cart;
}

const FRIEND = {
  deliverTo: "RECIPIENT",
  recipientName: "Sam",
  recipientEmail: "sam@example.com",
  senderName: "Al",
  message: null,
};

test("a gift card is priced at face value and kept out of the products subtotal", async () => {
  const card = await variantBySku("GIFTCARD-100");
  const plain = await plainVariant();
  const cart = await cartWith([
    { variantId: card.id, unitPriceCents: 10000, giftCardDetails: FRIEND },
    { variantId: plain.id, unitPriceCents: plain.priceCents },
  ]);
  const view = await priceCart(cart);
  assert.equal(view.subtotalCents, plain.priceCents);
  assert.equal(view.giftCardCents, 10000);
  const line = view.lines.find((l) => l.variantId === card.id)!;
  assert.equal(line.isGiftCard, true);
  assert.equal(line.lineTotalCents, 10000);
  assert.deepEqual(line.giftCardDetails, FRIEND);
});

test("a products-only cart prices exactly as before, with no gift card value", async () => {
  const plain = await plainVariant();
  const cart = await cartWith([{ variantId: plain.id, unitPriceCents: plain.priceCents, quantity: 2 }]);
  const view = await priceCart(cart);
  assert.equal(view.subtotalCents, plain.priceCents * 2);
  assert.equal(view.giftCardCents, 0);
  assert.equal(view.lines[0].isGiftCard, false);
});

test("a sale on the gift card product never discounts the card", async () => {
  const product = await prisma.product.findUniqueOrThrow({ where: { slug: "gift-card" } });
  productDiscountRestore = { id: product.id, discountActive: product.discountActive, discountPercent: product.discountPercent };
  await prisma.product.update({ where: { id: product.id }, data: { discountActive: true, discountPercent: 20 } });

  const card = await variantBySku("GIFTCARD-100");
  const view = await priceCart(await cartWith([{ variantId: card.id, unitPriceCents: 10000, giftCardDetails: FRIEND }]));
  assert.equal(view.giftCardCents, 10000);
  assert.equal(view.lines[0].unitPriceCents, 10000);
});

test("free-gift offers never count a gift card toward a spend threshold", async () => {
  const card = await variantBySku("GIFTCARD-200");
  const view = await priceCart(await cartWith([{ variantId: card.id, unitPriceCents: 20000, giftCardDetails: FRIEND }]));
  assert.deepEqual(await giftLinesFor(view.lines), []);
});
