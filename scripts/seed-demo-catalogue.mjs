#!/usr/bin/env node
/*
 * Seeds a demo catalogue: categories, products (with a default variant and
 * images), approved reviews and hero banners.
 *
 *   node scripts/seed-demo-catalogue.mjs          # insert, skip what exists
 *   node scripts/seed-demo-catalogue.mjs --reset  # delete demo rows first
 *
 * Every row it writes is tagged, so --reset removes exactly what this script
 * created and never touches a real product someone added by hand:
 *   - products and categories by slug prefix (see DEMO_MARK)
 *   - hero banners by their alt text
 *   - reviews by the products they hang off
 *
 * Uses pg directly rather than Prisma so it runs without a generated client.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

const DEMO_MARK = "demo-";
const RESET = process.argv.includes("--reset");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const now = new Date();
const id = () => randomUUID();
const money = (d) => Math.round(d * 100);

/* ------------------------------------------------------------------ data */

const CATEGORIES = [
  ["Vitamins & Supplements", "vitamins-supplements", "Daily vitamins, minerals and multivitamin blends."],
  ["Medical Devices", "medical-devices", "Monitors, nebulisers, thermometers and diagnostic kit."],
  ["Personal Care", "personal-care", "Everyday hygiene, oral care and body essentials."],
  ["First Aid", "first-aid", "Dressings, antiseptics and ready-made kits."],
  ["Diabetic Care", "diabetic-care", "Glucometers, test strips and lancets."],
  ["Herbal & Natural", "herbal-natural", "Plant-based remedies and traditional formulations."],
  ["Baby Care", "baby-care", "Infant nutrition, skincare and feeding."],
  ["Fitness & Nutrition", "fitness-nutrition", "Protein, recovery and performance nutrition."],
  ["Skin & Hair", "skin-hair", "Dermocosmetics, cleansers and treatments."],
  ["Elderly Care", "elderly-care", "Mobility, comfort and daily-living support."],
];

/* Sub-categories: [parentSlug, [[childName, childSlug], ...]]
   Only some parents get them, so the menu shows both shapes - a category that
   expands and one that just navigates. */
const SUBCATEGORIES = [
  ["vitamins-supplements", [
    ["Multivitamins", "multivitamins"],
    ["Vitamin D", "vitamin-d"],
    ["Omega & Fish Oil", "omega-fish-oil"],
  ]],
  ["medical-devices", [
    ["Blood Pressure", "blood-pressure"],
    ["Thermometers", "thermometers"],
    ["Oximeters", "oximeters"],
  ]],
  ["personal-care", [
    ["Oral Care", "oral-care"],
    ["Hand & Body", "hand-body"],
  ]],
];

/* Which products move down into a child. Anything not listed stays on its
   parent, so a parent keeps products of its own as well as children. */
const PRODUCT_SUBCATEGORY = {
  "daily-multivitamin-complex": "multivitamins",
  "vitamin-d3-2000-iu-softgels": "vitamin-d",
  "omega-3-fish-oil-1000mg": "omega-fish-oil",
  "digital-blood-pressure-monitor": "blood-pressure",
  "infrared-forehead-thermometer": "thermometers",
  "fingertip-pulse-oximeter": "oximeters",
  "fluoride-toothpaste-twin-pack": "oral-care",
  "antibacterial-hand-gel-500ml": "hand-body",
};

/* [name, categorySlug, price, compareAt, blurb] */
const PRODUCTS = [
  ["Vitamin D3 2000 IU Softgels", "vitamins-supplements", 24.99, 32.0, "Ninety softgels of high-strength D3 in cold-pressed olive oil."],
  ["Omega-3 Fish Oil 1000mg", "vitamins-supplements", 29.5, 38.0, "Molecularly distilled, 660mg combined EPA and DHA per serving."],
  ["Daily Multivitamin Complex", "vitamins-supplements", 21.0, null, "Twenty-three vitamins and minerals in a single morning tablet."],
  ["Magnesium Glycinate 400mg", "vitamins-supplements", 26.75, 31.0, "A chelated form chosen for absorption and a gentler stomach."],
  ["Digital Blood Pressure Monitor", "medical-devices", 79.0, 99.0, "Upper-arm cuff with irregular-heartbeat detection and two-user memory."],
  ["Portable Mesh Nebuliser", "medical-devices", 64.5, null, "Silent mesh atomiser, USB rechargeable, under 110 grams."],
  ["Infrared Forehead Thermometer", "medical-devices", 34.0, 45.0, "One-second contactless reading with fever backlight."],
  ["Fingertip Pulse Oximeter", "medical-devices", 27.9, 36.0, "SpO2 and pulse rate on a rotating OLED display."],
  ["Gentle Foaming Face Wash", "personal-care", 14.25, null, "A sulphate-free daily cleanser for sensitive skin."],
  ["Fluoride Toothpaste Twin Pack", "personal-care", 9.99, 12.5, "Everyday cavity protection in a low-abrasion formula."],
  ["Antibacterial Hand Gel 500ml", "personal-care", 11.4, null, "Seventy percent alcohol with glycerin to stop the drying."],
  ["Home First Aid Kit — 90 piece", "first-aid", 39.0, 52.0, "Wall-mountable case covering cuts, burns, sprains and splinters."],
  ["Sterile Gauze & Tape Set", "first-aid", 12.8, null, "Twenty sterile pads with hypoallergenic fixing tape."],
  ["Antiseptic Wound Spray", "first-aid", 10.5, 14.0, "Alcohol-free, stings less, safe on children."],
  ["Blood Glucose Meter Starter Kit", "diabetic-care", 44.0, 59.0, "Meter, lancing device, twenty-five strips and a carry case."],
  ["Glucose Test Strips — 50 ct", "diabetic-care", 32.0, null, "Five-second reading from a 0.5 microlitre sample."],
  ["Ashwagandha Root Extract", "herbal-natural", 23.4, 28.0, "KSM-66 standardised to five percent withanolides."],
  ["Turmeric & Black Pepper Caps", "herbal-natural", 19.9, null, "Curcumin paired with piperine for uptake."],
  ["Infant Vitamin D Drops", "baby-care", 16.2, null, "Four hundred IU per drop, unflavoured, no additives."],
  ["Baby Barrier Cream 150ml", "baby-care", 13.75, 17.0, "Zinc-based, fragrance-free, for nappy-area irritation."],
  ["Whey Protein Isolate 2lb", "fitness-nutrition", 62.0, 78.0, "Twenty-seven grams of protein per scoop, low lactose."],
  ["Electrolyte Hydration Sticks", "fitness-nutrition", 24.5, null, "Thirty sachets, no added sugar, sodium-forward blend."],
  ["Niacinamide 10% Serum", "skin-hair", 22.0, 27.5, "For visible pores and uneven tone, fragrance-free."],
  ["Adjustable Walking Cane", "elderly-care", 41.0, 49.0, "Aluminium, nine height settings, moulded soft grip."],
];

const REVIEW_BITS = [
  [5, "Exactly as described", "Arrived quickly and does the job. Second time ordering."],
  [5, "Very happy", "Good value for the size. Packaging was sealed properly."],
  [4, "Works well", "Does what it says. Took a couple of weeks to notice a difference."],
  [5, "Would buy again", "No complaints at all. Delivery was faster than the estimate."],
  [4, "Good but pricey", "Quality is there, though I have seen it cheaper elsewhere."],
  [5, "Recommended", "My pharmacist suggested this brand and it has been fine."],
  [3, "Does the job", "Nothing wrong with it, nothing remarkable either."],
  [5, "Great quality", "Feels well made and the instructions were clear."],
  [4, "Solid", "Easy to use straight out of the box."],
  [5, "Very pleased", "Repeat purchase. Consistent every time."],
];

const NAMES = ["A. Mercier", "J. Whitfield", "R. Osei", "M. Laurent", "K. Novak", "T. Abara",
  "S. Ferreira", "D. Kaur", "P. Lindqvist", "N. Haddad", "C. Bianchi", "L. Okonkwo"];

const HEROES = [
  ["/uploads/hero-1.svg", "demo hero 1", "Everyday health, delivered", "Monitors, supplements and daily care — dispatched the same day.", "Shop all", "/shop", "left"],
  ["/uploads/hero-2.svg", "demo hero 2", "Supplements that keep up", "Third-party tested, honestly dosed, no filler blends.", "Browse supplements", "/shop?category=vitamins-supplements", "left"],
  ["/uploads/hero-3.svg", "demo hero 3", "Monitors and devices", "Clinic-grade readings without the clinic waiting room.", "See devices", "/shop?category=medical-devices", "left"],
];

/* --------------------------------------------------------------- helpers */

const q = (text, values) => client.query(text, values);

async function reset() {
  const { rows: prods } = await q(
    `SELECT id FROM "Product" WHERE slug LIKE $1`, [`${DEMO_MARK}%`]);
  const ids = prods.map((r) => r.id);
  if (ids.length) {
    await q(`DELETE FROM "Review" WHERE "productId" = ANY($1)`, [ids]);
    await q(`DELETE FROM "ProductImage" WHERE "productId" = ANY($1)`, [ids]);
    await q(`DELETE FROM "ProductVariant" WHERE "productId" = ANY($1)`, [ids]);
    await q(`DELETE FROM "_ProductCategories" WHERE "B" = ANY($1)`, [ids]).catch(() => {});
    await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [ids]);
  }
  await q(`DELETE FROM "Category" WHERE slug LIKE $1`, [`${DEMO_MARK}%`]);
  await q(`DELETE FROM "HeroBanner" WHERE alt LIKE 'demo hero%'`);
  console.log(`reset: removed ${ids.length} demo products and their categories/banners`);
}

/* ------------------------------------------------------------------ main */

if (RESET) await reset();

// categories -------------------------------------------------------------
const catId = new Map();
let order = 0;
for (const [name, slug, description] of CATEGORIES) {
  const s = DEMO_MARK + slug;
  const { rows } = await q(
    `INSERT INTO "Category" (id, name, slug, description, "imageUrl", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "imageUrl" = EXCLUDED."imageUrl",
       description = EXCLUDED.description, "updatedAt" = EXCLUDED."updatedAt"
     RETURNING id`,
    [id(), name, s, description, `/uploads/cat-${slug}.svg`, order++, now],
  );
  catId.set(slug, rows[0].id);
}
// sub-categories ---------------------------------------------------------
let subCount = 0;
for (const [parentSlug, kids] of SUBCATEGORIES) {
  const parentId = catId.get(parentSlug);
  if (!parentId) continue;
  let kidOrder = 0;
  for (const [name, slug] of kids) {
    const s = DEMO_MARK + slug;
    const { rows } = await q(
      `INSERT INTO "Category" (id, name, slug, description, "imageUrl", "sortOrder", "parentId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "parentId" = EXCLUDED."parentId",
         "updatedAt" = EXCLUDED."updatedAt"
       RETURNING id`,
      [id(), name, s, `${name} within ${parentSlug.replace(/-/g, " ")}.`,
       `/uploads/cat-${parentSlug}.svg`, kidOrder++, parentId, now],
    );
    catId.set(slug, rows[0].id);
    subCount++;
  }
}
console.log(`categories: ${catId.size - subCount} top level, ${subCount} sub-categories`);

// products ---------------------------------------------------------------
let made = 0, reviewCount = 0;
for (let i = 0; i < PRODUCTS.length; i++) {
  const [name, cat, price, compareAt, blurb] = PRODUCTS[i];
  const n = i + 1;
  const bare = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = DEMO_MARK + bare;
  // A product filed under a child belongs to the child; the parent still owns
  // it through the tree, so nothing disappears from the parent's page.
  const homeCategory = PRODUCT_SUBCATEGORY[bare] ?? cat;
  const cover = `/uploads/prod-${n}.svg`;

  const { rows } = await q(
    `INSERT INTO "Product"
       (id, slug, name, "shortDescription", description, status, featured,
        "coverImageUrl", "categoryId", "minPriceCents", stock, "stockStatus",
        sku, "publishedAt", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,'PUBLISHED',$6,$7,$8,$9,$10,'IN_STOCK',$11,$12,$12,$12)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"
     RETURNING id`,
    [id(), slug, name, blurb, `<p>${blurb}</p>`, i % 5 === 0, cover,
     catId.get(homeCategory) ?? catId.get(cat), money(price), 40 + ((i * 7) % 90), `DEMO-${String(n).padStart(3, "0")}`, now],
  );
  const pid = rows[0].id;

  await q(
    `INSERT INTO "ProductVariant"
       (id, "productId", name, sku, "priceCents", "compareAtCents", stock,
        "stockStatus", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1,$2,'Single unit',$3,$4,$5,$6,'IN_STOCK',true,true,0,$7,$7)
     ON CONFLICT (sku) DO NOTHING`,
    [id(), pid, `DEMO-${String(n).padStart(3, "0")}-V1`, money(price),
     compareAt ? money(compareAt) : null, 40 + ((i * 7) % 90), now],
  );

  await q(
    `INSERT INTO "ProductImage" (id, "productId", url, alt, "sortOrder")
     VALUES ($1,$2,$3,$4,0) ON CONFLICT DO NOTHING`,
    [id(), pid, cover, name],
  );

  // 1-2 approved reviews each, so the star ratings on the grid are not blank
  const howMany = i % 3 === 0 ? 2 : 1;
  for (let k = 0; k < howMany; k++) {
    const [rating, title, body] = REVIEW_BITS[(i + k) % REVIEW_BITS.length];
    const who = NAMES[(i * 2 + k) % NAMES.length];
    await q(
      `INSERT INTO "Review"
         (id, "productId", "authorName", "authorEmail", rating, title, body,
          status, "isVerifiedPurchase", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',true,$8,$8)`,
      [id(), pid, who,
       `${who.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
       rating, title, body,
       new Date(now.getTime() - (i * 36 + k * 11) * 3600_000)],
    );
    reviewCount++;
  }
  made++;
}
console.log(`products: ${made}   reviews: ${reviewCount}`);

// hero banners -----------------------------------------------------------
let heroN = 0;
for (const [imageUrl, alt, heading, subheading, ctaLabel, ctaHref, textPosition] of HEROES) {
  const { rowCount } = await q(`SELECT 1 FROM "HeroBanner" WHERE alt = $1`, [alt]);
  if (rowCount) continue;
  await q(
    `INSERT INTO "HeroBanner"
       (id, "imageUrl", alt, heading, subheading, "ctaLabel", "ctaHref",
        "textPosition", "isActive", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$10)`,
    [id(), imageUrl, alt, heading, subheading, ctaLabel, ctaHref, textPosition, heroN, now],
  );
  heroN++;
}
console.log(`hero banners: ${heroN} added (slider needs 2+ to autoplay)`);

await client.end();
console.log("done.");
