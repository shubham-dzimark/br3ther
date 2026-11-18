/**
 * Demo products with attributes and variations, for checking how the
 * storefront draws swatches, chip rows, price ranges and a sold-out option.
 *
 * Everything it creates is prefixed `demo-var-` (products) or starts with
 * "Demo " (attributes), so `node scripts/seed-variant-demo.mjs --remove`
 * takes all of it away again and nothing else.
 *
 *   DATABASE_URL=... node scripts/seed-variant-demo.mjs
 *   DATABASE_URL=... node scripts/seed-variant-demo.mjs --remove
 */
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

/* Prisma 7 talks to Postgres through a driver adapter, the same way
   src/lib/prisma.ts does. DATABASE_URL comes from the environment, or from
   the .env beside this repo when run without one. */
const connectionString =
  process.env.DATABASE_URL ??
  (readFileSync(new URL("../.env", import.meta.url), "utf8").match(
    /^DATABASE_URL="?([^"\n]+)"?/m,
  ) ?? [])[1];
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const remove = process.argv.includes("--remove");

const SLUGS = ["demo-var-hydration-multipack", "demo-var-compression-sleeve"];
const ATTRS = ["Demo Flavour", "Demo Size", "Demo Colour"];

async function clean() {
  const n = await prisma.product.deleteMany({ where: { slug: { in: SLUGS } } });
  // Variants and their values cascade from the product.
  const a = await prisma.attribute.deleteMany({ where: { name: { in: ATTRS } } });
  console.log(`removed ${n.count} product(s) and ${a.count} attribute(s)`);
}

/** Create the attribute and its values, and hand back a value-id lookup. */
async function attribute(name, slug, display, values) {
  await prisma.attribute.deleteMany({ where: { name } });
  const attr = await prisma.attribute.create({
    data: {
      name,
      slug,
      display,
      sortOrder: 0,
      values: {
        create: values.map((v, i) => ({
          value: v.value,
          colour: v.colour ?? null,
          sortOrder: i,
        })),
      },
    },
    include: { values: true },
  });
  return Object.fromEntries(attr.values.map((v) => [v.value, v.id]));
}

async function main() {
  if (remove) return clean();
  await clean();

  const category = await prisma.category.findFirst({ select: { id: true } });

  const flavour = await attribute("Demo Flavour", "demo-flavour", "TEXT", [
    { value: "Lemon" },
    { value: "Berry" },
    { value: "Mango" },
  ]);
  const size = await attribute("Demo Size", "demo-size", "TEXT", [
    { value: "10 pack" },
    { value: "30 pack" },
  ]);
  const colour = await attribute("Demo Colour", "demo-colour", "COLOUR", [
    { value: "Black", colour: "#101014" },
    { value: "Purple", colour: "#50119D" },
    { value: "Sand", colour: "#E3D5C8" },
  ]);
  const sleeveSize = await attribute("Demo Sleeve Size", "demo-sleeve-size", "TEXT", [
    { value: "S" },
    { value: "M" },
    { value: "L" },
  ]);

  /* ---- Two text attributes: six options, a price range, one sold out ---- */
  const multipack = [];
  for (const [fi, f] of ["Lemon", "Berry", "Mango"].entries()) {
    for (const [si, s] of ["10 pack", "30 pack"].entries()) {
      const price = s === "10 pack" ? 1450 + fi * 100 : 3650 + fi * 200;
      const soldOut = f === "Mango" && s === "30 pack";
      multipack.push({
        name: `${f} · ${s}`,
        sku: `DEMO-VAR-HM-${fi}${si}`,
        priceCents: price,
        compareAtCents: s === "30 pack" ? price + 800 : null,
        stock: soldOut ? 0 : 40,
        stockStatus: soldOut ? "OUT_OF_STOCK" : "IN_STOCK",
        isDefault: fi === 0 && si === 0,
        sortOrder: fi * 2 + si,
        values: { create: [{ attributeValueId: flavour[f] }, { attributeValueId: size[s] }] },
      });
    }
  }

  await prisma.product.create({
    data: {
      slug: SLUGS[0],
      name: "Demo — Hydration Sticks Multipack",
      shortDescription: "Two attributes, six options: a flavour and a pack size.",
      description:
        "<p>A demo product for checking how option chips, price ranges and a sold-out option are drawn. Safe to delete.</p>",
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 86400000),
      categoryId: category?.id ?? null,
      minPriceCents: Math.min(...multipack.map((v) => v.priceCents)),
      onSale: true,
      ratingAverage: 4.5,
      ratingCount: 2,
      variants: { create: multipack },
    },
  });

  /* ---- A colour swatch crossed with a size: nine options ---- */
  const sleeve = [];
  for (const [ci, c] of ["Black", "Purple", "Sand"].entries()) {
    for (const [si, s] of ["S", "M", "L"].entries()) {
      sleeve.push({
        name: `${c} · ${s}`,
        sku: `DEMO-VAR-CS-${ci}${si}`,
        priceCents: 2200 + si * 300,
        compareAtCents: null,
        stock: c === "Sand" && s === "L" ? 0 : 25,
        stockStatus: c === "Sand" && s === "L" ? "OUT_OF_STOCK" : "IN_STOCK",
        isDefault: ci === 0 && si === 0,
        sortOrder: ci * 3 + si,
        values: {
          create: [{ attributeValueId: colour[c] }, { attributeValueId: sleeveSize[s] }],
        },
      });
    }
  }

  await prisma.product.create({
    data: {
      slug: SLUGS[1],
      name: "Demo — Compression Sleeve",
      shortDescription: "A colour swatch crossed with a size: nine options.",
      description:
        "<p>A demo product for checking colour swatches beside a text chip row. Safe to delete.</p>",
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 172800000),
      categoryId: category?.id ?? null,
      minPriceCents: 2200,
      ratingAverage: 4,
      ratingCount: 1,
      variants: { create: sleeve },
    },
  });

  console.log("created:", SLUGS.join(", "));
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
