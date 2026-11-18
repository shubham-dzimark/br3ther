import "server-only";
import { prisma } from "@/lib/prisma";
import { parseCsvLine } from "@/lib/tracking-csv";
import { recomputeProductPricing } from "@/lib/product-pricing";
import type { Prisma } from "@/generated/prisma";
import {
  mapProductHeader,
  readProductRow,
  splitCsvRecords,
  type ProductCsvIssue,
  type ProductCsvRow,
} from "@/lib/product-csv";
import { EMPTY_RESULT, type ImportResult } from "@/lib/product-import-result";

/**
 * The plain columns of a product, as this importer sets them.
 *
 * Scalars only - including the two foreign keys - so one object can be handed
 * to either a create or an update. Prisma's update input allows
 * `{ set: value }` wrappers that a create rejects, which makes its own types
 * unusable for both.
 */
type ProductFields = {
  name?: string;
  type?: ProductCsvRow["type"];
  status?: ProductCsvRow["status"];
  featured?: boolean;
  soldIndividually?: boolean;
  shortDescription?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImageUrl?: string;
  externalUrl?: string;
  externalLabel?: string;
  categoryId?: string;
  shippingClassId?: string;
};

/** Enough for any catalogue this shop will paste in, and a stop on a runaway file. */
const MAX_ROWS = 5000;

/**
 * Apply a product spreadsheet to the catalogue.
 *
 * Deliberate limits, because this runs against a live catalogue:
 *  - nothing is ever deleted. A product missing from the file is left alone,
 *    and so is an option missing from it.
 *  - a blank cell leaves the stored value as it is. Clearing a description is
 *    something you do on the product page, not by deleting a column.
 *  - a product the file has not seen before is created as a DRAFT unless the
 *    file says otherwise, so a mistake is never live on the shop.
 *  - rows are applied one at a time rather than in a transaction, and the bad
 *    ones are listed by line number. Refusing 400 good rows over one typo
 *    helps nobody.
 *
 * Categories and shipping classes are matched to what already exists, by name
 * and ignoring case. An unknown name is reported rather than created: a typo
 * should not quietly add a category to the shop's menu.
 */
export async function applyProductCsv(text: string): Promise<ImportResult> {
  const lines = splitCsvRecords(text);
  if (lines.length < 2) {
    return {
      ...EMPTY_RESULT,
      status: "error",
      message: "That file has no rows under its header.",
    };
  }
  if (lines.length - 1 > MAX_ROWS) {
    return {
      ...EMPTY_RESULT,
      status: "error",
      message: `That file has ${lines.length - 1} rows. The limit is ${MAX_ROWS}.`,
    };
  }

  const header = mapProductHeader(parseCsvLine(lines[0]));
  if (header.slug === undefined && header.name === undefined) {
    return {
      ...EMPTY_RESULT,
      status: "error",
      message: "The file needs a slug column or a name column - neither was found.",
    };
  }

  const issues: ProductCsvIssue[] = [];
  const rows: ProductCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const { row, issues: rowIssues } = readProductRow(
      header,
      parseCsvLine(lines[i]),
      i + 1,
    );
    issues.push(...rowIssues);
    if (row) rows.push(row);
  }

  /*
   * Rows are grouped by slug, because a variable product is several rows that
   * describe one product. The product's own columns are taken from the first
   * row that fills them in, so only the first row of a group needs them.
   */
  const groups = new Map<string, ProductCsvRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.slug);
    if (existing) existing.push(row);
    else groups.set(row.slug, [row]);
  }

  const [categories, shippingClasses] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.shippingClass.findMany({ select: { id: true, name: true } }),
  ]);
  const categoryByName = new Map<string, string>(
    categories.map((c) => [c.name.trim().toLowerCase(), c.id] as [string, string]),
  );
  const classByName = new Map<string, string>(
    shippingClasses.map((c) => [c.name.trim().toLowerCase(), c.id] as [string, string]),
  );

  let productsCreated = 0;
  let productsUpdated = 0;
  let optionsCreated = 0;
  let optionsUpdated = 0;

  for (const [slug, groupRows] of groups) {
    const line = groupRows[0].line;
    /** The first row of the group that fills a given column in. */
    const pick = <K extends keyof ProductCsvRow>(key: K): ProductCsvRow[K] | undefined => {
      for (const r of groupRows) if (r[key] !== undefined) return r[key];
      return undefined;
    };

    try {
      const existing = await prisma.product.findUnique({
        where: { slug },
        select: { id: true, variants: { select: { id: true, name: true, sku: true } } },
      });

      const name = pick("name");
      if (!existing && !name) {
        issues.push({ line, message: `"${slug}" is not in the shop yet and the row has no name` });
        continue;
      }

      // ---- the product's own columns ----
      const data: ProductFields = {};
      if (name !== undefined) data.name = name;
      const type = pick("type");
      if (type !== undefined) data.type = type;
      const status = pick("status");
      if (status !== undefined) data.status = status;
      const featured = pick("featured");
      if (featured !== undefined) data.featured = featured;
      const soldIndividually = pick("soldIndividually");
      if (soldIndividually !== undefined) data.soldIndividually = soldIndividually;
      for (const [key, field] of [
        ["shortDescription", "shortDescription"],
        ["description", "description"],
        ["seoTitle", "seoTitle"],
        ["seoDescription", "seoDescription"],
        ["coverImageUrl", "coverImageUrl"],
        ["externalUrl", "externalUrl"],
        ["externalLabel", "externalLabel"],
      ] as const) {
        const value = pick(key);
        if (value !== undefined) data[field] = value;
      }

      const categoryName = pick("category");
      if (categoryName !== undefined) {
        const id = categoryByName.get(categoryName.trim().toLowerCase());
        if (id) data.categoryId = id;
        else issues.push({ line, message: `category "${categoryName}" does not exist - left unchanged` });
      }

      const shippingClassName = pick("shippingClass");
      if (shippingClassName !== undefined) {
        const id = classByName.get(shippingClassName.trim().toLowerCase());
        if (id) data.shippingClassId = id;
        else
          issues.push({
            line,
            message: `shipping class "${shippingClassName}" does not exist - left unchanged`,
          });
      }

      let categoryIds: { id: string }[] = [];
      const categoryNames = pick("categories");
      if (categoryNames !== undefined) {
        const ids: { id: string }[] = [];
        for (const raw of categoryNames) {
          const id = categoryByName.get(raw.trim().toLowerCase());
          if (id) ids.push({ id });
          else issues.push({ line, message: `category "${raw}" does not exist - skipped` });
        }
        // `set` is the only sensible reading of a filled-in list: it is the
        // full list of categories this product belongs to.
        categoryIds = ids;
      }

      let productId: string;
      if (existing) {
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(categoryIds.length > 0 ? { categories: { set: categoryIds } } : {}),
          },
        });
        productId = existing.id;
        productsUpdated += 1;
      } else {
        const created = await prisma.product.create({
          data: {
            ...data,
            slug,
            name: name as string,
            // Never live by accident: a new product waits as a draft unless
            // the file explicitly says to publish it.
            status: status ?? "DRAFT",
            ...(categoryIds.length > 0 ? { categories: { connect: categoryIds } } : {}),
          },
          select: { id: true },
        });
        productId = created.id;
        productsCreated += 1;
      }

      // ---- the gallery ----
      const images = pick("images");
      if (images !== undefined && images.length > 0) {
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.productImage.createMany({
          data: images.map((url, i) => ({ productId, url, sortOrder: i })),
        });
      }

      // ---- one option per row ----
      for (const row of groupRows) {
        const variantName = row.variantName ?? "Single unit";
        const sku = row.sku;

        const match = sku
          ? await prisma.productVariant.findUnique({
              where: { sku },
              select: { id: true, productId: true },
            })
          : (existing?.variants.find((v) => v.name === variantName) ?? null);

        if (match && "productId" in match && match.productId !== productId) {
          issues.push({
            line: row.line,
            message: `sku "${sku}" already belongs to another product - option skipped`,
          });
          continue;
        }

        const variantData: Prisma.ProductVariantUncheckedUpdateInput = {};
        if (row.variantName !== undefined) variantData.name = row.variantName;
        if (row.barcode !== undefined) variantData.barcode = row.barcode;
        if (row.priceCents !== undefined) variantData.priceCents = row.priceCents;
        if (row.compareAtCents !== undefined) variantData.compareAtCents = row.compareAtCents;
        if (row.stock !== undefined) variantData.stock = row.stock;
        if (row.manageStock !== undefined) variantData.manageStock = row.manageStock;
        if (row.stockStatus !== undefined) variantData.stockStatus = row.stockStatus;
        if (row.weightGrams !== undefined) variantData.weightGrams = row.weightGrams;

        if (match) {
          if (Object.keys(variantData).length > 0) {
            await prisma.productVariant.update({ where: { id: match.id }, data: variantData });
            optionsUpdated += 1;
          }
          continue;
        }

        // A new option has to have a price and a code of its own.
        if (row.priceCents === undefined) {
          issues.push({
            line: row.line,
            message: `"${variantName}" is new and has no price - option skipped`,
          });
          continue;
        }
        if (!sku) {
          issues.push({
            line: row.line,
            message: `"${variantName}" is new and has no sku - option skipped`,
          });
          continue;
        }

        await prisma.productVariant.create({
          data: {
            productId,
            name: variantName,
            sku,
            priceCents: row.priceCents,
            compareAtCents: row.compareAtCents ?? null,
            stock: row.stock ?? 0,
            manageStock: row.manageStock ?? true,
            stockStatus: row.stockStatus ?? "IN_STOCK",
            weightGrams: row.weightGrams ?? null,
            barcode: row.barcode ?? null,
            isDefault: false,
          },
        });
        optionsCreated += 1;
      }

      // The shop sorts and filters on the cached lowest price, so it has to
      // follow every price this file moved.
      await recomputeProductPricing(productId);
    } catch (error) {
      issues.push({
        line,
        message: `"${slug}" could not be saved: ${
          error instanceof Error ? error.message.split("\n").pop()?.trim() : "unknown error"
        }`,
      });
    }
  }

  return {
    status: "done",
    productsCreated,
    productsUpdated,
    optionsCreated,
    optionsUpdated,
    issues,
  };
}
