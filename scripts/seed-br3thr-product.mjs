/**
 * The single demo product the one-page Br3thr site sells:
 * "No.3 Daily Blend", three flavours x two sizes, as six variants.
 *
 * Idempotent: re-running updates prices and names in place.
 *   node scripts/seed-br3thr-product.mjs            create or update
 *   node scripts/seed-br3thr-product.mjs --remove   delete it again
 *
 * The site looks the product up by SLUG (src/lib/site-product.ts).
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString =
  process.env.DATABASE_URL ??
  (readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m) ?? [])[1];
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SLUG = "no-3-daily-blend";
const FLAVOURS = [
  ["UNF", "Unflavoured"],
  ["CHR", "Black cherry"],
  ["CIT", "Citrus salt"],
];
const SIZES = [
  ["300", "300 g", 4900, 300],
  ["600", "600 g", 8900, 600],
];

if (process.argv.includes("--remove")) {
  const n = await prisma.product.deleteMany({ where: { slug: SLUG } });
  console.log(`removed ${n.count} product(s)`);
  await prisma.$disconnect();
  process.exit(0);
}

const data = {
  name: "No.3 Daily Blend",
  shortDescription: "One scoop, every day. A demo product for the Br3thr shop.",
  description:
    "No.3 Daily Blend is the demo product for the Br3thr one-page shop. Replace this text, the variants and the prices with the real product before launch.",
  type: "VARIABLE",
  status: "PUBLISHED",
  featured: true,
};

const product = await prisma.product.upsert({
  where: { slug: SLUG },
  update: data,
  create: { slug: SLUG, ...data },
});

let order = 0;
for (const [fCode, flavour] of FLAVOURS) {
  for (const [sCode, size, price, grams] of SIZES) {
    const sku = `BR3-NO3-${fCode}-${sCode}`;
    const v = {
      name: `${flavour} · ${size}`,
      priceCents: price,
      stock: 120,
      manageStock: true,
      weightGrams: grams + 90,
      isDefault: fCode === "UNF" && sCode === "300",
      isActive: true,
      sortOrder: order++,
    };
    await prisma.productVariant.upsert({
      where: { sku },
      update: v,
      create: { productId: product.id, sku, ...v },
    });
  }
}
console.log(`product ${product.slug} ready with ${order} variants`);
await prisma.$disconnect();
