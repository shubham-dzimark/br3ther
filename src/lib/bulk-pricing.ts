import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { recomputeProductPricing } from "@/lib/product-pricing";

/*
 * Store-wide price changes: raise or lower every option's selling price by an
 * amount or a percentage, for the whole store, a category or chosen products -
 * and put them back.
 *
 * The first bulk change to an option saves its price in originalPriceCents;
 * later bulk changes build on the current price but never overwrite that
 * saved original, so "Restore original prices" always returns to the price from
 * before any bulk change. Editing a price by hand makes that the new original
 * (see the product actions). "Was" (compare-at) prices are never touched: the
 * storefront only shows one while it is above the selling price.
 */

export type Rounding = "99" | "dollar" | "none";

export type PriceChange = {
  direction: "increase" | "decrease";
  mode: "amount" | "percent";
  /** Cents when mode is "amount", whole percent when "percent". */
  value: number;
  rounding: Rounding;
};

export type PriceScope =
  | { kind: "all" }
  | { kind: "category"; categoryId: string }
  | { kind: "products"; productIds: string[] };

export const MAX_AMOUNT_CENTS = 100_000_00;
export const MAX_INCREASE_PERCENT = 500;
export const MAX_DECREASE_PERCENT = 90;

/** Nearest price ending in .99 ($83.40 -> $82.99), whole dollars, or as is. */
export function roundPrice(cents: number, rounding: Rounding): number {
  const value = Math.round(cents);
  if (rounding === "none") return Math.max(1, value);
  if (rounding === "dollar") return Math.max(100, Math.round(value / 100) * 100);
  const lower = Math.floor(value / 100) * 100 - 1;
  const upper = lower + 100;
  const nearest = value - lower <= upper - value ? lower : upper;
  return Math.max(99, nearest);
}

/** The new selling price, or null when a decrease would take it to nothing. */
export function newPrice(currentCents: number, change: PriceChange): number | null {
  const delta = change.mode === "amount" ? change.value : Math.round((currentCents * change.value) / 100);
  const raw = change.direction === "increase" ? currentCents + delta : currentCents - delta;
  if (raw < 1) return null;
  return roundPrice(raw, change.rounding);
}

/** Read and check a change from a form; null with a reason when it's not usable. */
export function parsePriceChange(get: (field: string) => string): { change: PriceChange } | { error: string } {
  const direction = get("direction") === "decrease" ? "decrease" : "increase";
  const mode = get("mode") === "percent" ? "percent" : "amount";
  const rounding: Rounding = get("rounding") === "none" ? "none" : get("rounding") === "dollar" ? "dollar" : "99";
  const rawValue = get("value").replace(/[$,%\s]/g, "");
  const n = Number(rawValue);
  if (!rawValue || !Number.isFinite(n) || n <= 0) return { error: "Enter an amount or percentage above zero." };

  if (mode === "percent") {
    const pct = Math.round(n);
    const max = direction === "increase" ? MAX_INCREASE_PERCENT : MAX_DECREASE_PERCENT;
    if (pct < 1 || pct > max) return { error: `A ${direction} can be 1% to ${max}%.` };
    return { change: { direction, mode, value: pct, rounding } };
  }
  const cents = Math.round(n * 100);
  if (cents < 1 || cents > MAX_AMOUNT_CENTS) return { error: "Enter an amount between $0.01 and $100,000." };
  return { change: { direction, mode, value: cents, rounding } };
}

export function parseScope(get: (field: string) => string): PriceScope {
  const kind = get("scope");
  if (kind === "category" && get("category")) return { kind: "category", categoryId: get("category") };
  if (kind === "products") {
    const productIds = [...new Set(get("ids").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 500);
    if (productIds.length) return { kind: "products", productIds };
  }
  return { kind: "all" };
}

function productWhere(scope: PriceScope): Prisma.ProductWhereInput {
  if (scope.kind === "category") {
    return { OR: [{ categoryId: scope.categoryId }, { categories: { some: { id: scope.categoryId } } }] };
  }
  if (scope.kind === "products") return { id: { in: scope.productIds } };
  return {};
}

export type PreviewRow = {
  productName: string;
  variantName: string;
  oldCents: number;
  newCents: number | null;
};

export type ChangeSummary = {
  products: number;
  variants: number;
  /** Options a decrease would take to nothing, left unchanged. */
  skipped: number;
  /** Options whose "was" price will stop showing because the new price reaches it. */
  wasHidden: number;
  rows: PreviewRow[];
};

async function variantsIn(scope: PriceScope) {
  return prisma.productVariant.findMany({
    where: { product: productWhere(scope) },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      productId: true,
      priceCents: true,
      compareAtCents: true,
      originalPriceCents: true,
      product: { select: { name: true } },
    },
  });
}

function summarise(
  variants: Awaited<ReturnType<typeof variantsIn>>,
  change: PriceChange,
  sample: number,
): ChangeSummary {
  let skipped = 0;
  let wasHidden = 0;
  const rows: PreviewRow[] = [];
  for (const v of variants) {
    const next = newPrice(v.priceCents, change);
    if (next === null) skipped += 1;
    else if (v.compareAtCents != null && v.compareAtCents > v.priceCents && v.compareAtCents <= next) wasHidden += 1;
    if (rows.length < sample) {
      rows.push({ productName: v.product.name, variantName: v.name, oldCents: v.priceCents, newCents: next });
    }
  }
  return {
    products: new Set(variants.map((v) => v.productId)).size,
    variants: variants.length,
    skipped,
    wasHidden,
    rows,
  };
}

/** What a change would do, without saving anything. */
export async function previewPriceChange(scope: PriceScope, change: PriceChange, sample = 25): Promise<ChangeSummary> {
  return summarise(await variantsIn(scope), change, sample);
}

/** Apply the change. Returns the same summary as the preview (rows empty). */
export async function applyPriceChange(scope: PriceScope, change: PriceChange): Promise<ChangeSummary> {
  const variants = await variantsIn(scope);
  const summary = summarise(variants, change, 0);

  const updates = variants.flatMap((v) => {
    const next = newPrice(v.priceCents, change);
    if (next === null || next === v.priceCents) return [];
    return [
      prisma.productVariant.update({
        where: { id: v.id },
        // The first bulk change keeps the price it started from.
        data: { priceCents: next, originalPriceCents: v.originalPriceCents ?? v.priceCents },
      }),
    ];
  });
  for (let i = 0; i < updates.length; i += 100) {
    await prisma.$transaction(updates.slice(i, i + 100));
  }

  for (const productId of new Set(variants.map((v) => v.productId))) {
    await recomputeProductPricing(productId);
  }
  return summary;
}

/** How many options in scope have a saved original to go back to. */
export async function countRestorable(scope: PriceScope): Promise<number> {
  return prisma.productVariant.count({
    where: { product: productWhere(scope), originalPriceCents: { not: null } },
  });
}

/** Put every option in scope back to its price from before the first bulk change. */
export async function restoreOriginalPrices(scope: PriceScope): Promise<number> {
  const variants = await prisma.productVariant.findMany({
    where: { product: productWhere(scope), originalPriceCents: { not: null } },
    select: { id: true, productId: true, originalPriceCents: true },
  });
  const updates = variants.map((v) =>
    prisma.productVariant.update({
      where: { id: v.id },
      data: { priceCents: v.originalPriceCents as number, originalPriceCents: null },
    }),
  );
  for (let i = 0; i < updates.length; i += 100) {
    await prisma.$transaction(updates.slice(i, i + 100));
  }
  for (const productId of new Set(variants.map((v) => v.productId))) {
    await recomputeProductPricing(productId);
  }
  return variants.length;
}
