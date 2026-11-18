/*
 * Bundle & Save: quantity price breaks per product ("Buy 2, save 10%",
 * "Buy 3, save 20%"). One rule is applied to many products at once from
 * Admin > Products > Bundle & Save; each product stores its own copy.
 *
 * Every option of the product counts towards a tier - 1 Mint and 2 Strawberry
 * is 3 - and the tier's percentage comes off every unit of that product in the
 * cart. The tier price becomes the item's price, so bundle deals, discount
 * codes, the subtotal and the saved order are all worked out from it.
 *
 * Plain functions with no server imports: the product page's buy panel uses the
 * same maths in the browser, so the price shown is the price charged.
 */

export type QuantityTier = {
  /** How many of the product. 1 is allowed for a badge with no discount. */
  qty: number;
  /** Percent off each unit, 0-90. */
  percent: number;
  /** Optional label such as "Most Popular". */
  badge: string;
};

export const MAX_TIERS = 4;
export const MAX_TIER_QTY = 100;
export const MAX_TIER_PERCENT = 90;

/** Whatever is stored (or posted), as clean tiers sorted by quantity. */
export function sanitizeTiers(raw: unknown): QuantityTier[] {
  if (!Array.isArray(raw)) return [];
  const byQty = new Map<number, QuantityTier>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const qty = Math.floor(Number(r.qty));
    const percent = Math.round(Number(r.percent) || 0);
    const badge = String(r.badge ?? "").trim().slice(0, 30);
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_TIER_QTY) continue;
    const pct = Math.max(0, Math.min(MAX_TIER_PERCENT, percent));
    // A row with no discount and no badge says nothing.
    if (pct === 0 && !badge) continue;
    // Buying one can carry a badge but never a discount - that would just be the price.
    byQty.set(qty, { qty, percent: qty === 1 ? 0 : pct, badge });
  }
  return [...byQty.values()].sort((a, b) => a.qty - b.qty).slice(0, MAX_TIERS);
}

/** Tiers from the admin form's rows: tierQty_0, tierPct_0, tierBadge_0 ... */
export function parseTiersForm(get: (field: string) => string): QuantityTier[] {
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < MAX_TIERS; i += 1) {
    rows.push({ qty: get(`tierQty_${i}`), percent: get(`tierPct_${i}`), badge: get(`tierBadge_${i}`) });
  }
  return sanitizeTiers(rows.filter((r) => r.qty.trim() !== ""));
}

/**
 * What is wrong with a rule, in words for the admin. Each bigger quantity must
 * cost more in total than the one before it: Buy 4 at 40% off is 2.4 items'
 * worth, exactly what Buy 3 at 20% off costs, so the 4th item would be free.
 */
export function tierProblems(tiers: QuantityTier[]): string[] {
  const problems: string[] = [];
  const steps = [{ qty: 1, percent: 0 }, ...tiers.filter((t) => t.qty > 1)];
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1];
    const cur = steps[i];
    // Total in hundredths of one item's price, so no rounding is involved.
    if (cur.qty * (100 - cur.percent) <= prev.qty * (100 - prev.percent)) {
      problems.push(
        `Buy ${cur.qty} at ${cur.percent}% off costs ${cur.qty * (100 - cur.percent) === prev.qty * (100 - prev.percent) ? "the same as" : "less than"} Buy ${prev.qty}${prev.percent ? ` at ${prev.percent}% off` : ""} - lower its discount.`,
      );
    }
  }
  return problems;
}

/** One stable string per rule, so products sharing a rule can be grouped. */
export function tiersKey(tiers: QuantityTier[]): string {
  return JSON.stringify(tiers.map((t) => [t.qty, t.percent, t.badge]));
}

/** "Buy 2 -10% · Buy 3 -20%" for admin lists. */
export function describeTiers(tiers: QuantityTier[]): string {
  const parts = tiers
    .filter((t) => t.percent > 0)
    .map((t) => `Buy ${t.qty} −${t.percent}%${t.badge ? ` (${t.badge})` : ""}`);
  const lone = tiers.find((t) => t.qty === 1 && t.badge);
  if (lone) parts.unshift(`Buy 1 (${lone.badge})`);
  return parts.join(" · ");
}

/** The best discount a quantity earns: the largest tier it reaches. */
export function bestTier(tiers: QuantityTier[], totalQty: number): QuantityTier | null {
  let best: QuantityTier | null = null;
  for (const t of tiers) {
    if (t.percent > 0 && t.qty <= totalQty && (!best || t.qty > best.qty)) best = t;
  }
  return best;
}

/** One unit at a tier's price, rounded per unit like every other discount. */
export function tierUnitPrice(unitCents: number, percent: number): number {
  return unitCents - Math.round((unitCents * percent) / 100);
}

export type TierLine = {
  id: string;
  productId: string | null;
  unitPriceCents: number;
  quantity: number;
  isGift: boolean;
};

/**
 * Which cart lines get a tier price. All non-gift lines of a product are
 * counted together; each line keeps its own option's price.
 */
export function applyQuantityTiers(
  lines: TierLine[],
  tiersByProduct: Map<string, QuantityTier[]>,
): Map<string, { percent: number; unitCents: number }> {
  const totals = new Map<string, number>();
  for (const l of lines) {
    if (l.isGift || !l.productId || l.quantity < 1) continue;
    totals.set(l.productId, (totals.get(l.productId) ?? 0) + l.quantity);
  }
  const out = new Map<string, { percent: number; unitCents: number }>();
  for (const l of lines) {
    if (l.isGift || !l.productId) continue;
    const tier = bestTier(tiersByProduct.get(l.productId) ?? [], totals.get(l.productId) ?? 0);
    if (!tier) continue;
    out.set(l.id, { percent: tier.percent, unitCents: tierUnitPrice(l.unitPriceCents, tier.percent) });
  }
  return out;
}
