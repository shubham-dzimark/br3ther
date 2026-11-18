/**
 * The "Gift Card" product: type GIFT_CARD, three face values.
 *
 * Idempotent - run it again and it changes nothing that is already there,
 * so it is safe on every deploy. Name, picture and description stay
 * editable in the admin afterwards; this only creates what is missing.
 *
 *   node scripts/seed-gift-card-product.mjs
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString =
  process.env.DATABASE_URL ??
  (readFileSync(new URL("../.env", import.meta.url), "utf8").match(
    /^DATABASE_URL="?([^"\n]+)"?/m,
  ) ?? [])[1];
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const AMOUNTS = [5000, 10000, 20000];

try {
  let product = await prisma.product.findUnique({ where: { slug: "gift-card" } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        slug: "gift-card",
        name: "Gift Card",
        type: "GIFT_CARD",
        shortDescription: "Send a Br3thr gift card to a friend — delivered by email, no expiry.",
        description:
          "<p>Choose an amount, tell us who it is for, and we email them a gift card code once your payment arrives. Prefer to hand it over yourself? Send it to your own inbox instead.</p><p>Gift cards never expire, and any amount left after an order stays on the card for next time.</p>",
        status: "PUBLISHED",
        publishedAt: new Date(),
        minPriceCents: AMOUNTS[0],
        // Ships with the site in public/; replace it in the admin any time.
        coverImageUrl: "/gift-card.webp",
      },
    });
    console.log("created product gift-card");
  } else if (product.type !== "GIFT_CARD") {
    throw new Error(`A product with slug "gift-card" exists but is type ${product.type}; not touching it.`);
  } else if (!product.coverImageUrl) {
    // Only fills a missing picture - one chosen in the admin is left alone.
    await prisma.product.update({ where: { id: product.id }, data: { coverImageUrl: "/gift-card.webp" } });
    console.log("set gift card picture");
  }

  for (const [i, cents] of AMOUNTS.entries()) {
    const sku = `GIFTCARD-${cents / 100}`;
    const existing = await prisma.productVariant.findUnique({ where: { sku } });
    if (existing) continue;
    await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: `$${cents / 100}`,
        sku,
        priceCents: cents,
        manageStock: false,
        stockStatus: "IN_STOCK",
        isDefault: i === 0,
        sortOrder: i,
      },
    });
    console.log(`created variant ${sku}`);
  }
} finally {
  await prisma.$disconnect();
}
