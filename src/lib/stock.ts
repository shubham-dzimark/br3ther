/**
 * Whether an option can actually be bought.
 *
 * The counted quantity is not the whole story: a shop may want something off
 * sale while it still has boxes on the shelf, or may take orders for something
 * it has none of. That is what WooCommerce calls stock status, and it wins over
 * the number - so every place that used to test `stock > 0` asks here instead.
 */
export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "ON_BACKORDER";

export type StockLike = {
  stock: number;
  stockStatus?: string | null;
  /** Off means the quantity is not tracked - it is simply always in stock. */
  manageStock?: boolean | null;
  /** "NO" | "NOTIFY" | "YES" - may it be ordered past zero? */
  backorders?: string | null;
};

/** Is the quantity counted at all? Defaults to yes for older rows. */
export const managesStock = (v: StockLike) => v.manageStock !== false;

/** Does it accept orders once the count reaches zero? */
export const takesBackorders = (v: StockLike) =>
  v.backorders === "YES" || v.backorders === "NOTIFY";

export const stockStatusOf = (v: StockLike): StockStatus =>
  v.stockStatus === "OUT_OF_STOCK" || v.stockStatus === "ON_BACKORDER"
    ? v.stockStatus
    : "IN_STOCK";

/** Can a customer put this in their basket right now? */
export function canSell(v: StockLike): boolean {
  const status = stockStatusOf(v);
  if (status === "OUT_OF_STOCK") return false;
  if (status === "ON_BACKORDER") return true;
  // Not counting stock means there is always some to sell.
  if (!managesStock(v)) return true;
  if (v.stock > 0) return true;
  // At zero it comes down to the backorder setting.
  return takesBackorders(v);
}

/**
 * How many may be added at once. A backordered item is not limited by a count
 * it does not have, so it gets a sane ceiling rather than zero.
 */
export function sellableQuantity(v: StockLike): number {
  const status = stockStatusOf(v);
  if (status === "OUT_OF_STOCK") return 0;
  if (status === "ON_BACKORDER" || !managesStock(v) || takesBackorders(v)) {
    return Math.max(v.stock, 99);
  }
  return Math.max(0, v.stock);
}

/**
 * The most one cart line may hold: one when sold individually, otherwise what
 * can be sold. Adding and changing a quantity both ask here - changing it used
 * to cap at the raw count, so a backordered or untracked option (count 0)
 * snapped every + back to 1.
 */
export function lineCeiling(v: StockLike, soldIndividually?: boolean | null): number {
  return soldIndividually ? 1 : sellableQuantity(v);
}

/** Shopper-facing wording for the availability line. */
export function stockLabel(v: StockLike): "in" | "low" | "backorder" | "out" {
  const status = stockStatusOf(v);
  if (status === "OUT_OF_STOCK") return "out";
  if (status === "ON_BACKORDER") return "backorder";
  if (!managesStock(v)) return "in";
  if (v.stock <= 0) return takesBackorders(v) ? "backorder" : "out";
  return v.stock <= 5 ? "low" : "in";
}

export const BACKORDER_OPTIONS = [
  { value: "NO", label: "Do not allow" },
  { value: "NOTIFY", label: "Allow, but notify customer" },
  { value: "YES", label: "Allow" },
] as const;

export const STOCK_STATUS_OPTIONS = [
  { value: "IN_STOCK", label: "In stock" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "ON_BACKORDER", label: "On backorder" },
] as const;
