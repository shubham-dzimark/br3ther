"use server";

import { parseShoppersBase } from "@/lib/shopper-count";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { sanitizeRichText } from "@/lib/rich-text";
import { recomputeProductPricing } from "@/lib/product-pricing";
import { syncGiftProducts } from "@/lib/gifts";
import { pruneVariationsToAttributes } from "@/lib/variations";
import { parsePriceToCents } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { Prisma } from "@/generated/prisma";
import type { ProductStatus } from "@/generated/prisma";
import { assignBarcode, getBarcodeConfig } from "@/lib/barcode";
// Saving a product sends its new options to Sortly straight away.
import { kickSortlyProduct } from "@/lib/sortly/outbox";
import { parseSpecTable, serialiseSpecTable, specFormat } from "@/lib/spec-table";

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readStatus(value: FormDataEntryValue | null): ProductStatus {
  const v = String(value ?? "DRAFT");
  return (STATUSES as readonly string[]).includes(v)
    ? (v as ProductStatus)
    : "DRAFT";
}

/** Ensure the slug is unique, appending -2, -3 ... when it collides. */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || "product";
  let candidate = root;
  let n = 1;
  for (;;) {
    const clash = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}


/**
 * Categories a product belongs to. The first ticked box is stored as the
 * primary `categoryId` too, so the breadcrumb and related-products fallback -
 * which both read a single category - keep working unchanged.
 */
function categoryIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("categoryIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/** Woo's three backorder choices. */
function readBackorders(raw: FormDataEntryValue | null): "NO" | "NOTIFY" | "YES" {
  const v = String(raw ?? "");
  return v === "NOTIFY" || v === "YES" ? v : "NO";
}

/** A whole number, or null when the box is left empty. */
function readOptionalInt(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** In stock / out of stock / on backorder, defaulting to in stock. */
function readStockStatus(raw: FormDataEntryValue | null): "IN_STOCK" | "OUT_OF_STOCK" | "ON_BACKORDER" {
  const v = String(raw ?? "");
  return v === "OUT_OF_STOCK" || v === "ON_BACKORDER" ? v : "IN_STOCK";
}

/** The product type, and the link an external product points at. */
function readType(
  raw: FormDataEntryValue | null,
): "SIMPLE" | "VARIABLE" | "GROUPED" | "EXTERNAL" | "GIFT_CARD" {
  const v = String(raw ?? "");
  return v === "VARIABLE" || v === "GROUPED" || v === "EXTERNAL" || v === "GIFT_CARD" ? v : "SIMPLE";
}

/** Types whose options each carry their own price (a gift card's are its amounts). */
const hasOptionPrices = (t: string) => t === "VARIABLE" || t === "GIFT_CARD";

/** Only http(s), so the button cannot become a javascript: link. */
function readExternalUrl(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function createProduct(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/products/new?error=name");

  /*
   * A variable product has no price of its own - each option carries one - so
   * the single price is only required for the types that actually use it.
   * Demanding it here is what made "Create product" fail on a variable product
   * with nothing to type it into.
   */
  const newType = readType(formData.get("type"));
  const listCents = parsePriceToCents(String(formData.get("price") ?? ""));
  if (!hasOptionPrices(newType) && listCents === null) {
    redirect("/admin/products/new?error=price");
  }

  /*
   * "Sale price" is what the customer actually pays, so it becomes the
   * variant's price and the normal price moves to compareAt, which is what
   * the storefront strikes through. A sale price at or above the normal price
   * is ignored rather than saved - it would render a nonsense "was" line.
   */
  const saleRaw = String(formData.get("salePrice") ?? "").trim();
  const saleCents = saleRaw ? parsePriceToCents(saleRaw) : null;
  const onSale =
    listCents !== null && saleCents !== null && saleCents > 0 && saleCents < listCents;

  const priceCents = onSale ? saleCents : listCents;
  const compareAtCents = onSale ? listCents : null;

  const status = readStatus(formData.get("status"));
  const slug = await uniqueSlug(
    slugify(String(formData.get("slug") ?? "") || name),
  );

  const categoryIds = categoryIdsFrom(formData);
  const categoryId = categoryIds[0] ?? null;
  const sku =
    String(formData.get("sku") ?? "").trim() ||
    `${slug.toUpperCase().slice(0, 12)}-${Date.now().toString(36).toUpperCase()}`;

  /*
   * Options built in the browser on the create page, so a variable product can
   * be given its sizes and colours before it exists. Anything malformed is
   * ignored rather than failing the whole save - the product still gets made.
   */
  type BuiltRow = {
    label?: string;
    valueIds?: string[];
    price?: string;
    compareAt?: string;
    stock?: string;
    sku?: string;
    manageStock?: boolean;
    stockStatus?: string;
    backorders?: string;
    lowStock?: string;
  };
  let builtVariations: {
    name: string;
    sku: string;
    priceCents: number;
    compareAtCents: number | null;
    stock: number;
    stockStatus: "IN_STOCK" | "OUT_OF_STOCK" | "ON_BACKORDER";
    manageStock: boolean;
    backorders: "NO" | "NOTIFY" | "YES";
    lowStockAmount: number | null;
    isDefault: boolean;
    sortOrder: number;
    values?: { create: { attributeValueId: string }[] };
  }[] = [];

  if (hasOptionPrices(newType)) {
    let rows: BuiltRow[] = [];
    try {
      const raw = JSON.parse(String(formData.get("variations") ?? "[]"));
      if (Array.isArray(raw)) rows = raw as BuiltRow[];
    } catch {
      rows = [];
    }

    builtVariations = rows.flatMap((row, i) => {
      const rowPrice = parsePriceToCents(String(row.price ?? ""));
      if (rowPrice === null) return [];
      const rowCompare = parsePriceToCents(String(row.compareAt ?? ""));
      const valueIds = (row.valueIds ?? []).filter((v) => typeof v === "string");
      return [
        {
          name: String(row.label ?? "").trim() || `Option ${i + 1}`,
          sku:
            String(row.sku ?? "").trim() ||
            `${slug.toUpperCase().slice(0, 10)}-${i + 1}-${Date.now().toString(36).toUpperCase().slice(-4)}`,
          priceCents: rowPrice,
          compareAtCents: rowCompare !== null && rowCompare > rowPrice ? rowCompare : null,
          stock: Number(row.stock ?? 0) || 0,
          stockStatus: readStockStatus(row.stockStatus ?? null),
          manageStock: row.manageStock !== false,
          backorders: readBackorders(row.backorders ?? null),
          lowStockAmount: readOptionalInt(row.lowStock ?? null),
          isDefault: i === 0,
          sortOrder: i,
          ...(valueIds.length
            ? { values: { create: valueIds.map((attributeValueId) => ({ attributeValueId })) } }
            : {}),
        },
      ];
    });
  }

  const product = await prisma.product.create({
    data: {
      attributeValues: {
        create: formData
          .getAll("attributeValueIds")
          .map(String)
          .filter(Boolean)
          .map((attributeValueId) => ({ attributeValueId })),
      },
      type: newType,
      /*
       * No parent-level stock here any more. It was written on every save and
       * read by nothing - the shop, the cart and canSell() all read the
       * option - so a product set "out of stock" at this level carried on
       * selling. The option's stock is the only stock, and for a
       * single-option product saveSimplePricing copies it here so this row
       * can never disagree with it.
       */
      soldIndividually: formData.get("soldIndividually") === "on",
      // What it costs extra to post, or nothing in particular.
      shippingClassId: String(formData.get("shippingClassId") ?? "") || null,
      externalUrl: readExternalUrl(formData.get("externalUrl")),
      externalLabel: String(formData.get("externalLabel") ?? "").trim() || null,
      name,
      slug,
      status,
      categoryId,
      categories: { connect: categoryIds.map((id) => ({ id })) },
      /*
       * Sanitised here, not at render.
       *
       * The description is typed in a rich-text editor and injected into a
       * public product page, so this is the boundary between a pasted <script>
       * and stored XSS on the shop. Cleaning on the way in means what is in
       * the database is already safe, and no future reader has to remember.
       */
      // The same sanitiser as the full description now that it has the same
      // toolbar - a stricter one here silently deleted the formatting the
      // editor had just offered.
      shortDescription: sanitizeRichText(String(formData.get("shortDescription") ?? "")) || null,
      description: sanitizeRichText(String(formData.get("description") ?? "")) || null,
      /*
       * Both formats are stored whichever is selected. The editor keeps the
       * inactive one mounted so it still posts - switching to a table must not
       * throw away prose the shop may switch back to.
       */
      shortFormat: specFormat(String(formData.get("shortDescriptionFormat") ?? "")),
      shortTable: serialiseSpecTable(
        parseSpecTable(String(formData.get("shortDescriptionTable") ?? "")),
      ),
      descriptionFormat: specFormat(String(formData.get("descriptionFormat") ?? "")),
      descriptionTable: serialiseSpecTable(
        parseSpecTable(String(formData.get("descriptionTable") ?? "")),
      ),
      seoTitle: String(formData.get("seoTitle") ?? "") || null,
      seoDescription: String(formData.get("seoDescription") ?? "") || null,
      featured: formData.get("featured") === "on",
      // Gift status is set from Free Gift offers only, never from this form.
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      /*
       * Everything below used to be edit-only, which meant creating a product
       * always took two saves. None of it needs the product to exist first -
       * only the gallery and extra variants do, because those are rows keyed
       * on the product id.
       */
      coverImageUrl: String(formData.get("coverImageUrl") ?? "").trim() || null,
      videoUrl: String(formData.get("videoUrl") ?? "").trim() || null,
      discountTitle: String(formData.get("discountTitle") ?? "").trim() || null,
      discountPercent: Math.min(
        95,
        Math.max(0, Number(formData.get("discountPercent")) || 0),
      ),
      discountActive: formData.get("discountActive") === "on",
      discountStartsAt: parseDate(String(formData.get("discountStartsAt") ?? "")),
      discountEndsAt: parseDate(String(formData.get("discountEndsAt") ?? "")),
      bundledWith: {
        connect: formData
          .getAll("bundleIds")
          .map(String)
          .filter(Boolean)
          .map((bundleId) => ({ id: bundleId })),
      },
      // Bundle & Save rules are set in bulk on /admin/products/bundle-save.
      // Only when the form has the field, so another save can't reset it to 0.
      ...(formData.has("shoppersBase")
        ? { shoppersBase: parseShoppersBase(formData.get("shoppersBase")) }
        : {}),
      bundleDiscountPercent: Math.min(
        90,
        Math.max(0, Number(formData.get("bundleDiscountPercent")) || 0),
      ),
      variants: {
        create: builtVariations.length > 0
          ? builtVariations
          : {
              name: String(formData.get("variantName") ?? "").trim() || "Default",
              sku,
              priceCents: priceCents ?? 0,
              compareAtCents,
              stock: Number(formData.get("stock") ?? 0) || 0,
              isDefault: true,
            },
      },
    },
  });

  await recomputeProductPricing(product.id);

  /*
   * A barcode for the default variant, if barcodes are on and set to assign
   * automatically. Failure is swallowed: not getting a code is a nuisance,
   * losing the product you just created is not.
   */
  const barcodeConfig = await getBarcodeConfig();
  if (barcodeConfig.enabled && barcodeConfig.autoAssign) {
    const variant = await prisma.productVariant.findFirst({
      where: { productId: product.id },
      select: { id: true },
    });
    if (variant) {
      await assignBarcode(variant.id, barcodeConfig).catch(() => null);
    }
  }

  kickSortlyProduct(product.id);
  revalidatePath("/admin/products");
  redirect(`/admin/products/${product.id}?saved=1`);
}

export async function updateProduct(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/products");

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { status: true, publishedAt: true },
  });
  if (!existing) redirect("/admin/products");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/admin/products/${id}?error=name`);

  const status = readStatus(formData.get("status"));
  const slug = await uniqueSlug(
    slugify(String(formData.get("slug") ?? "") || name),
    id,
  );

  await prisma.product.update({
    where: { id },
    data: {
      type: readType(formData.get("type")),
      /*
       * No parent-level stock here any more. It was written on every save and
       * read by nothing - the shop, the cart and canSell() all read the
       * option - so a product set "out of stock" at this level carried on
       * selling. The option's stock is the only stock, and for a
       * single-option product saveSimplePricing copies it here so this row
       * can never disagree with it.
       */
      soldIndividually: formData.get("soldIndividually") === "on",
      // What it costs extra to post, or nothing in particular.
      shippingClassId: String(formData.get("shippingClassId") ?? "") || null,
      externalUrl: readExternalUrl(formData.get("externalUrl")),
      externalLabel: String(formData.get("externalLabel") ?? "").trim() || null,
      name,
      slug,
      status,
      categoryId: categoryIdsFrom(formData)[0] ?? null,
      // `set` replaces the whole list, so unticking a box actually removes it.
      categories: { set: categoryIdsFrom(formData).map((id) => ({ id })) },
      /*
       * Sanitised here, not at render.
       *
       * The description is typed in a rich-text editor and injected into a
       * public product page, so this is the boundary between a pasted <script>
       * and stored XSS on the shop. Cleaning on the way in means what is in
       * the database is already safe, and no future reader has to remember.
       */
      // The same sanitiser as the full description now that it has the same
      // toolbar - a stricter one here silently deleted the formatting the
      // editor had just offered.
      shortDescription: sanitizeRichText(String(formData.get("shortDescription") ?? "")) || null,
      description: sanitizeRichText(String(formData.get("description") ?? "")) || null,
      /*
       * Both formats are stored whichever is selected. The editor keeps the
       * inactive one mounted so it still posts - switching to a table must not
       * throw away prose the shop may switch back to.
       */
      shortFormat: specFormat(String(formData.get("shortDescriptionFormat") ?? "")),
      shortTable: serialiseSpecTable(
        parseSpecTable(String(formData.get("shortDescriptionTable") ?? "")),
      ),
      descriptionFormat: specFormat(String(formData.get("descriptionFormat") ?? "")),
      descriptionTable: serialiseSpecTable(
        parseSpecTable(String(formData.get("descriptionTable") ?? "")),
      ),
      seoTitle: String(formData.get("seoTitle") ?? "") || null,
      seoDescription: String(formData.get("seoDescription") ?? "") || null,
      featured: formData.get("featured") === "on",
      // Gift status is set from Free Gift offers only - saving here never changes it.
      // Checkout Upsell Product companions: replace the whole set rather than
      // diffing - a product never has more than a handful.
      bundledWith: {
        set: formData
          .getAll("bundleIds")
          .map(String)
          .filter((v) => v && v !== id)
          .map((bundleId) => ({ id: bundleId })),
      },
      // Bundle & Save rules are set in bulk on /admin/products/bundle-save.
      // Only when the form has the field, so another save can't reset it to 0.
      ...(formData.has("shoppersBase")
        ? { shoppersBase: parseShoppersBase(formData.get("shoppersBase")) }
        : {}),
      bundleDiscountPercent: Math.min(
        90,
        Math.max(0, Number(formData.get("bundleDiscountPercent")) || 0),
      ),
      discountTitle: String(formData.get("discountTitle") ?? "").trim() || null,
      discountPercent: Math.min(
        100,
        Math.max(0, Math.round(Number(formData.get("discountPercent")) || 0)),
      ),
      discountStartsAt: parseDate(String(formData.get("discountStartsAt") ?? "")),
      discountEndsAt: parseDate(String(formData.get("discountEndsAt") ?? "")),
      discountActive: formData.get("discountActive") === "on",
      // Stamp publishedAt the first time it goes live, then leave it alone.
      publishedAt:
        status === "PUBLISHED"
          ? (existing.publishedAt ?? new Date())
          : existing.publishedAt,
    },
  });

  /*
   * The Inventory tab's stock, saved by the same button as everything else.
   *
   * A simple, grouped or external product sells one option, so that tab edits
   * that option. The fields used to belong to the price form instead, so
   * "Save changes" - the button right beside them - submitted none of them:
   * you set a product out of stock, saved, and it came back in stock. They
   * arrive here now.
   *
   * A variable product has no single option to write to; its stock lives on
   * each option in the Variations tab, and the fields are not on screen, so
   * nothing arrives and nothing is touched.
   */
  if (formData.has("stockStatus") || formData.has("sku") || formData.has("regularPrice")) {
    const main = await prisma.productVariant.findFirst({
      where: { productId: id },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      select: { id: true, sku: true, priceCents: true },
    });

    /*
     * Price, on the same button as everything else.
     *
     * A "sale" at or above the normal price is not a sale; it is ignored
     * rather than printing a struck-through price lower than what is charged.
     */
    const regular = parsePriceToCents(String(formData.get("regularPrice") ?? ""));
    const rawSale = parsePriceToCents(String(formData.get("salePrice") ?? ""));
    const onSale = regular !== null && rawSale !== null && rawSale > 0 && rawSale < regular;
    const priceFields =
      regular === null
        ? {}
        : {
            priceCents: onSale ? (rawSale as number) : regular,
            compareAtCents: onSale ? regular : null,
          };

    if (main) {
      const typedSku = String(formData.get("sku") ?? "").trim();
      if (typedSku && typedSku !== main.sku) {
        const clash = await prisma.productVariant.findUnique({
          where: { sku: typedSku },
          select: { id: true },
        });
        if (clash && clash.id !== main.id) {
          redirect(`/admin/products/${id}?error=skutaken`);
        }
      }

      const stockStatus = readStockStatus(formData.get("stockStatus"));
      const manageStock = formData.get("manageStock") === "on";
      /*
       * Quantity, backorders and the threshold are only on screen while the
       * quantity is tracked, so they arrive missing rather than empty. Keep
       * what was stored rather than zeroing a count someone had merely
       * stopped tracking.
       */
      await prisma.productVariant.update({
        where: { id: main.id },
        data: {
          ...priceFields,
          // A price changed by hand becomes the baseline that "Restore
          // original prices" returns to.
          ...("priceCents" in priceFields && main.priceCents !== priceFields.priceCents
            ? { originalPriceCents: null }
            : {}),
          ...(formData.has("stockStatus") ? { stockStatus, manageStock } : {}),
          ...(formData.has("stock") ? { stock: Number(formData.get("stock") ?? 0) || 0 } : {}),
          ...(formData.has("backorders")
            ? { backorders: readBackorders(formData.get("backorders")) }
            : {}),
          ...(formData.has("lowStockAmount")
            ? { lowStockAmount: readOptionalInt(formData.get("lowStockAmount")) }
            : {}),
          ...(typedSku ? { sku: typedSku } : {}),
        },
      });

      /*
       * Keep the product row in step with the option it sells, so the row the
       * CSV export falls back to can never disagree with what is on sale.
       */
      if (formData.has("stockStatus")) {
        await prisma.product.update({
          where: { id },
          data: {
            stockStatus,
            manageStock,
            ...(formData.has("stock") ? { stock: Number(formData.get("stock") ?? 0) || 0 } : {}),
            ...(typedSku ? { sku: typedSku } : {}),
          },
        });
      }
    } else if (regular !== null) {
      // No option yet - a product saved before it had a price. Make the one it
      // sells, rather than dropping what was typed.
      await prisma.productVariant.create({
        data: {
          productId: id,
          name: "Default",
          sku:
            String(formData.get("sku") ?? "").trim() ||
            `SKU-${Date.now().toString(36).toUpperCase()}`,
          priceCents: onSale ? (rawSale as number) : regular,
          compareAtCents: onSale ? regular : null,
          ...(formData.has("stockStatus")
            ? {
                stockStatus: readStockStatus(formData.get("stockStatus")),
                manageStock: formData.get("manageStock") === "on",
              }
            : {}),
          ...(formData.has("stock") ? { stock: Number(formData.get("stock") ?? 0) || 0 } : {}),
          isDefault: true,
        },
      });
    }
  }

  await recomputeProductPricing(id);
  kickSortlyProduct(id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  redirect(`/admin/products/${id}?saved=1`);
}

/**
 * Copy a product, with its images, attribute values, categories and variants.
 *
 * Lands as a DRAFT called "… (copy)" and opens on the new product, so a near
 * duplicate is edited rather than retyped. Three things are deliberately NOT
 * carried over, because they are identity rather than content:
 *
 *   - reviews and their ratings, which belong to the product that earned them
 *   - SKUs and barcodes, which are unique in the database and would collide
 *   - the published date, since the copy has not been published
 *
 * Variant SKUs get a "-COPY", "-COPY-2" … suffix rather than being blanked:
 * the column is unique but not nullable, and a blank would fail on the second
 * copy of the same product.
 */
export async function duplicateProduct(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/products");

  const source = await prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      attributeValues: true,
      categories: { select: { id: true } },
    },
  });
  if (!source) redirect("/admin/products");

  // A slug is unique, so walk until a free one is found rather than assuming
  // "-copy" is available - duplicating twice is common.
  const base = `${source.slug}-copy`;
  let slug = base;
  for (let n = 2; await prisma.product.findUnique({ where: { slug }, select: { id: true } }); n++) {
    slug = `${base}-${n}`;
  }
  const suffix = slug.slice(source.slug.length); // "-copy" | "-copy-3"

  const {
    id: _id,
    slug: _slug,
    name: _name,
    createdAt: _c,
    updatedAt: _u,
    publishedAt: _p,
    sku: _sku,
    quantityTiers: _qt,
    images: _i,
    variants: _v,
    attributeValues: _a,
    categories: _cats,
    ...rest
  } = source;

  const copy = await prisma.product.create({
    data: {
      ...rest,
      slug,
      name: `${source.name} (copy)`,
      status: "DRAFT",
      publishedAt: null,
      sku: source.sku ? `${source.sku}${suffix.toUpperCase()}` : null,
      /*
       * Json columns are pulled out of the spread and set explicitly: Prisma
       * will not take a plain `null` for a nullable Json field, it wants
       * DbNull, and the value read back is typed JsonValue rather than the
       * narrower input type.
       */
      quantityTiers:
        source.quantityTiers === null
          ? Prisma.DbNull
          : (source.quantityTiers as Prisma.InputJsonValue),
      images: {
        create: source.images.map((im) => ({
          url: im.url,
          alt: im.alt,
          sortOrder: im.sortOrder,
        })),
      },
      attributeValues: {
        create: source.attributeValues.map((av) => ({
          attributeValueId: av.attributeValueId,
        })),
      },
      variants: {
        create: source.variants.map((v) => ({
          name: v.name,
          sku: `${v.sku}${suffix.toUpperCase()}`,
          priceCents: v.priceCents,
          compareAtCents: v.compareAtCents,
          originalPriceCents: v.originalPriceCents,
          stock: v.stock,
          stockStatus: v.stockStatus,
          manageStock: v.manageStock,
          backorders: v.backorders,
          lowStockAmount: v.lowStockAmount,
          weightGrams: v.weightGrams,
          isDefault: v.isDefault,
          isActive: v.isActive,
          imageUrl: v.imageUrl,
          sortOrder: v.sortOrder,
          // barcode omitted on purpose: unique, and reissued on demand.
        })),
      },
    },
    select: { id: true },
  });

  /*
   * Categories are attached separately. `categoryId` and the other foreign
   * keys come across in the spread above, which puts the create into Prisma's
   * "unchecked" shape - and that shape cannot also carry a `connect` for the
   * implicit many-to-many. Doing it as a second write keeps both.
   */
  if (source.categories.length) {
    await prisma.product.update({
      where: { id: copy.id },
      data: { categories: { connect: source.categories.map((c) => ({ id: c.id })) } },
    });
  }

  await recomputeProductPricing(copy.id);
  revalidatePath("/admin/products");
  redirect(`/admin/products/${copy.id}?copied=1`);
}

export async function deleteProduct(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.product.delete({ where: { id } });
  }
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

/**
 * Price, sale price, stock and SKU for a product that has one option.
 *
 * A "simple" product is still one variant underneath - that is what carries
 * the price, the stock and the barcode everywhere else in the shop - so this
 * writes to the default variant rather than inventing a second place prices
 * can live. Regular and sale price map the way WooCommerce does it: the sale
 * price becomes what the customer pays and the regular price becomes the
 * struck-through "was".
 */
/**
 * The attribute values a product offers.
 *
 * Available on every product type: a simple product uses them as printed specs
 * ("Material: cotton"), a variable one uses them as the pool its options are
 * generated from. Stored as a replace, which is simpler than diffing and loses
 * nothing - the variants keep their own links.
 */
export async function saveProductAttributes(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/admin/products");
  const back = `/admin/products/${productId}`;

  const valueIds = formData.getAll("attributeValueIds").map(String).filter(Boolean);

  await prisma.$transaction([
    prisma.productAttributeValue.deleteMany({ where: { productId } }),
    ...(valueIds.length
      ? [
          prisma.productAttributeValue.createMany({
            data: valueIds.map((attributeValueId) => ({ productId, attributeValueId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  // The options have to follow the ticks - see the helper for what "follow"
  // means when unticking collapses two options onto one.
  await pruneVariationsToAttributes(productId, valueIds);

  await recomputeProductPricing(productId);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  revalidatePath(back);
  revalidatePath("/shop");
  if (product?.slug) revalidatePath(`/products/${product.slug}`);
  redirect(`${back}?saved=1#attributes`);
}

/**
 * One variation for every combination of the chosen attribute values.
 *
 * Only combinations that do not exist yet are created, so pressing it twice is
 * harmless and hand-edited prices survive. Each new option copies its price
 * from the product's default option and starts at zero stock, which is the
 * safe default - it cannot oversell something nobody has counted yet.
 */
export async function generateVariations(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/admin/products");
  const back = `/admin/products/${productId}`;

  const chosen = await prisma.productAttributeValue.findMany({
    where: { productId },
    include: { attributeValue: { include: { attribute: true } } },
  });
  if (chosen.length === 0) redirect(`${back}?error=noattributes`);

  // Group the values by attribute, in the attributes' own order.
  const groups = new Map<string, { sortOrder: number; name: string; values: { id: string; value: string }[] }>();
  for (const row of chosen) {
    const attr = row.attributeValue.attribute;
    const group = groups.get(attr.id) ?? { sortOrder: attr.sortOrder, name: attr.name, values: [] };
    group.values.push({ id: row.attributeValue.id, value: row.attributeValue.value });
    groups.set(attr.id, group);
  }
  const ordered = [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  // Cartesian product: [[S,M],[Black,White]] -> S/Black, S/White, M/Black...
  let combos: { id: string; value: string }[][] = [[]];
  for (const group of ordered) {
    combos = combos.flatMap((combo) => group.values.map((v) => [...combo, v]));
  }
  // A runaway combination count would be a mistake, not an intention.
  if (combos.length > 100) redirect(`${back}?error=toomanyvariations`);

  const existing = await prisma.productVariant.findMany({
    where: { productId },
    include: { values: { select: { attributeValueId: true } } },
  });
  const seen = new Set(
    existing.map((v) => v.values.map((x) => x.attributeValueId).sort().join("|")),
  );
  const template = existing.find((v) => v.isDefault) ?? existing[0];

  let made = 0;
  for (const combo of combos) {
    const key = combo.map((c) => c.id).sort().join("|");
    if (seen.has(key)) continue;

    const name = combo.map((c) => c.value).join(" / ");
    await prisma.productVariant.create({
      data: {
        productId,
        name,
        sku: `${(template?.sku ?? "SKU").replace(/-[A-Z0-9]+$/i, "")}-${combo
          .map((c) => c.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase())
          .join("-")}-${Date.now().toString(36).slice(-3).toUpperCase()}`,
        priceCents: template?.priceCents ?? 0,
        compareAtCents: template?.compareAtCents ?? null,
        stock: 0,
        /*
         * Off, like a new product's own option. Copying it from the default
         * variant meant a product that happened to count its stock generated
         * twenty options all demanding a count nobody had taken.
         */
        manageStock: false,
        sortOrder: existing.length + made,
        values: { create: combo.map((c) => ({ attributeValueId: c.id })) },
      },
    });
    made += 1;
  }

  await recomputeProductPricing(productId);
  kickSortlyProduct(productId);
  revalidatePath(back);
  redirect(`${back}?saved=variations&n=${made}#variations`);
}

/* saveSimplePricing removed: the Inventory and General tabs are one form
   now, and updateProduct above saves price, stock and SKU together. */

/**
 * Save every option of a product in one go.
 *
 * The table used to carry a Save button per row, which meant editing five
 * prices was five round trips. Fields are named per option id and join one
 * form, so this reads them back the same way. Attribute links are left alone -
 * changing a price should not rewrite what the option is.
 */
export async function saveVariantsBulk(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const productId = String(formData.get("productId") ?? "");
  if (!productId) redirect("/admin/products");
  const back = `/admin/products/${productId}`;

  const ids = [...new Set(formData.getAll("variantId").map(String).filter(Boolean))];
  if (ids.length === 0) redirect(`${back}?saved=1#variations`);

  const mine = await prisma.productVariant.findMany({
    where: { id: { in: ids }, productId },
    select: { id: true, sku: true, priceCents: true },
  });

  for (const variant of mine) {
    const priceCents = parsePriceToCents(String(formData.get(`priceCents_${variant.id}`) ?? ""));
    // A row with an unreadable price is left as it was rather than zeroed.
    if (priceCents === null) continue;

    const rawCompare = parsePriceToCents(String(formData.get(`compareAtCents_${variant.id}`) ?? ""));
    const compareAtCents = rawCompare !== null && rawCompare > priceCents ? rawCompare : null;
    const typedSku = String(formData.get(`sku_${variant.id}`) ?? "").trim();

    if (typedSku && typedSku !== variant.sku) {
      const clash = await prisma.productVariant.findUnique({
        where: { sku: typedSku },
        select: { id: true },
      });
      if (clash && clash.id !== variant.id) redirect(`${back}?error=skutaken`);
    }

    /*
     * A row that is not counting its stock does not render its quantity,
     * backorders or low-stock fields, so they arrive missing rather than
     * empty. Writing them anyway zeroed the quantity of every option someone
     * had merely stopped tracking - so only fields that were actually posted
     * are written, and the rest keep what they had.
     */
    const posted = (field: string) => formData.has(`${field}_${variant.id}`);

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        priceCents,
        compareAtCents,
        // Only a real price edit resets the bulk-pricing original; saving stock doesn't.
        ...(variant.priceCents !== priceCents ? { originalPriceCents: null } : {}),
        stockStatus: readStockStatus(formData.get(`stockStatus_${variant.id}`)),
        manageStock: formData.get(`manageStock_${variant.id}`) === "on",
        isActive: formData.get(`isActive_${variant.id}`) === "on",
        ...(posted("stock")
          ? { stock: Number(formData.get(`stock_${variant.id}`) ?? 0) || 0 }
          : {}),
        ...(posted("backorders")
          ? { backorders: readBackorders(formData.get(`backorders_${variant.id}`)) }
          : {}),
        ...(posted("lowStockAmount")
          ? { lowStockAmount: readOptionalInt(formData.get(`lowStockAmount_${variant.id}`)) }
          : {}),
        ...(typedSku ? { sku: typedSku } : {}),
      },
    });
  }

  await recomputeProductPricing(productId);
  kickSortlyProduct(productId);
  revalidatePath(back);
  redirect(`${back}?saved=1#variations`);
}

export async function saveVariant(formData: FormData): Promise<void> {
  await requireCapability("catalog");

  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const priceCents = parsePriceToCents(String(formData.get("priceCents") ?? ""));
  if (!productId || priceCents === null) {
    redirect(`/admin/products/${productId}?error=variant`);
  }

  // attrValue_<attributeId> selects, one per attribute that has values.
  const attributeValueIds = [...formData.entries()]
    .filter(([k, v]) => k.startsWith("attrValue_") && String(v))
    .map(([, v]) => String(v));

  const chosen = attributeValueIds.length
    ? await prisma.attributeValue.findMany({
        where: { id: { in: attributeValueIds } },
        include: { attribute: { select: { name: true, sortOrder: true } } },
        orderBy: { attribute: { sortOrder: "asc" } },
      })
    : [];

  // Name the variant after its option values ("L / Black") unless one is typed.
  const typedName = String(formData.get("name") ?? "").trim();
  const derivedName = chosen.map((c) => c.value).join(" / ");
  const name = typedName || derivedName || "Default";

  // Compare-at is the higher struck-through "was" price. Ignore it when it is
  // not actually above the selling price, otherwise the badge would be a lie.
  const rawCompare = parsePriceToCents(String(formData.get("compareAtCents") ?? ""));
  const compareAtCents =
    rawCompare !== null && rawCompare > priceCents ? rawCompare : null;

  const priceBefore = variantId
    ? (await prisma.productVariant.findUnique({ where: { id: variantId }, select: { priceCents: true } }))?.priceCents
    : undefined;

  const data = {
    name,
    priceCents,
    compareAtCents,
    // A price changed by hand becomes the baseline for "Restore original prices".
    ...(priceBefore !== undefined && priceBefore !== priceCents ? { originalPriceCents: null } : {}),
    stock: Number(formData.get("stock") ?? 0) || 0,
    stockStatus: readStockStatus(formData.get("stockStatus")),
    manageStock: formData.get("manageStock") === "on",
    backorders: readBackorders(formData.get("backorders")),
    lowStockAmount: readOptionalInt(formData.get("lowStockAmount")),
    weightGrams: Number(formData.get("weightGrams") ?? 0) || null,
    imageUrl: String(formData.get("imageUrl") ?? "").trim() || null,
    isActive: formData.get("isActive") !== "off",
  };

  if (variantId) {
    /*
     * A typed SKU is honoured on update, not just on create.
     *
     * It is unique across the whole shop - a scanner has to resolve one code
     * to exactly one item - so a clash is caught here and reported, rather
     * than surfacing as a raw Prisma constraint error on the page.
     */
    const typedSku = String(formData.get("sku") ?? "").trim();
    if (typedSku) {
      const clash = await prisma.productVariant.findUnique({
        where: { sku: typedSku },
        select: { id: true },
      });
      if (clash && clash.id !== variantId) {
        redirect(`/admin/products/${productId}?error=skutaken`);
      }
    }

    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variantId },
        // Blank means "leave it alone" rather than "clear it": every variant
        // must keep a code.
        data: typedSku ? { ...data, sku: typedSku } : data,
      }),
      prisma.productVariantValue.deleteMany({ where: { variantId } }),
      ...(attributeValueIds.length
        ? [
            prisma.productVariantValue.createMany({
              data: attributeValueIds.map((attributeValueId) => ({
                variantId,
                attributeValueId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  } else {
    const sku =
      String(formData.get("sku") ?? "").trim() ||
      `SKU-${Date.now().toString(36).toUpperCase()}`;
    const count = await prisma.productVariant.count({ where: { productId } });
    await prisma.productVariant.create({
      data: {
        ...data,
        sku,
        productId,
        isDefault: count === 0,
        sortOrder: count,
        values: {
          create: attributeValueIds.map((attributeValueId) => ({
            attributeValueId,
          })),
        },
      },
    });
  }

  await recomputeProductPricing(productId);
  kickSortlyProduct(productId);
  /*
   * No redirect: a redirect is a fresh navigation, which threw the admin back
   * to the top of a long page every time a variant row was saved. Revalidating
   * re-renders in place and leaves the scroll position alone.
   */
  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteVariant(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");

  // Never leave a product with zero variants - it would have no price.
  const remaining = await prisma.productVariant.count({ where: { productId } });
  if (variantId && remaining > 1) {
    await prisma.productVariant.delete({ where: { id: variantId } });
    await recomputeProductPricing(productId);
    // A deleted option also leaves any Free Gift offer it was the gift of.
    await syncGiftProducts();
  }
  revalidatePath(`/admin/products/${productId}`);
}

export async function addImage(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(formData.get("productId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (productId && url) {
    const count = await prisma.productImage.count({ where: { productId } });
    await prisma.productImage.create({
      data: {
        productId,
        url,
        alt: String(formData.get("alt") ?? "") || null,
        sortOrder: count,
      },
    });
  }
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

export async function deleteImage(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (imageId) await prisma.productImage.delete({ where: { id: imageId } });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

/** Ids ticked in a bulk table. */
function bulkIds(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/**
 * Bulk delete. Products carry order history through OrderItem, but that
 * relation is `SetNull` on the product side, so past orders keep their frozen
 * name and price snapshots and simply lose the link.
 */
export async function bulkDeleteProducts(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = bulkIds(formData);
  if (ids.length) await prisma.product.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(`/admin/products?bulk=deleted&n=${ids.length}`);
}

/** Bulk publish / unpublish - the common "edit many at once" case. */
export async function bulkSetProductStatus(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = bulkIds(formData);
  const status = String(formData.get("status") ?? "");
  if (!["PUBLISHED", "DRAFT", "ARCHIVED"].includes(status)) {
    redirect("/admin/products?bulk=badstatus");
  }

  if (ids.length) {
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { status: status as "PUBLISHED" | "DRAFT" | "ARCHIVED" },
    });
  }

  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(`/admin/products?bulk=status&n=${ids.length}`);
}

/** Curried so one toolbar button can target a specific status. */
export async function bulkPublishProducts(formData: FormData): Promise<void> {
  formData.set("status", "PUBLISHED");
  return bulkSetProductStatus(formData);
}

export async function bulkDraftProducts(formData: FormData): Promise<void> {
  formData.set("status", "DRAFT");
  return bulkSetProductStatus(formData);
}

/** Products list bulk bar: open Bulk pricing with the ticked products chosen. */
export async function bulkChangePrices(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))].slice(0, 500);
  if (ids.length === 0) redirect("/admin/products/bulk-pricing");
  redirect(`/admin/products/bulk-pricing?scope=products&ids=${encodeURIComponent(ids.join(","))}`);
}

/** Products list bulk bar: open Bundle & Save with the ticked products chosen. */
export async function bulkBundleSave(formData: FormData): Promise<void> {
  await requireCapability("catalog");
  const ids = [...new Set(formData.getAll("ids").map(String).filter(Boolean))].slice(0, 500);
  if (ids.length === 0) redirect("/admin/products/bundle-save");
  redirect(`/admin/products/bundle-save?ids=${encodeURIComponent(ids.join(","))}`);
}
