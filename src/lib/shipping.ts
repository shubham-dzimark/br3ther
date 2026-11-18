import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Shipping methods, the way WooCommerce does it: the shop lists what it
 * offers, each with a name the customer sees, a cost, whether the postage
 * itself is taxed, and extra costs for the classes of thing being posted.
 *
 * Zones are deliberately absent for now: this shop posts within one country,
 * so a zone per province would be a table of identical rows. Everything here
 * is written so a zone column can be added later without changing the shape of
 * a quote.
 *
 * A shop that has never opened this screen still has shipping: when no method
 * exists, the old flat rate and free-over settings are read as one, so nothing
 * about an existing checkout changes until a method is actually created.
 */

export type ShippingQuote = {
  /** Null for the settings-based fallback, which has no row of its own. */
  methodId: string | null;
  name: string;
  note: string | null;
  cents: number;
  /** Whether the postage goes into the taxable base. */
  taxable: boolean;
  /** Why it came out free, when it did - the checkout says so. */
  freeReason: "threshold" | "method" | "gift" | null;
};

export type ShippingOption = ShippingQuote & { available: boolean; reason: string | null };

/** What a basket needs for a quote: its total, and the classes it contains. */
export type ShippingBasket = {
  subtotalCents: number;
  /** One entry per distinct shipping class in the basket; nulls ignored. */
  classIds: string[];
};

const METHOD_SELECT = {
  id: true,
  name: true,
  type: true,
  taxable: true,
  costCents: true,
  freeOverCents: true,
  minOrderCents: true,
  note: true,
  classCosts: { select: { classId: true, costCents: true } },
} as const;

type MethodRow = {
  id: string;
  name: string;
  type: string;
  taxable: boolean;
  costCents: number;
  freeOverCents: number;
  minOrderCents: number;
  note: string | null;
  classCosts: { classId: string; costCents: number }[];
};

/** The fallback built from the old two settings. */
async function settingsQuote(basket: ShippingBasket): Promise<ShippingQuote> {
  const settings = await getSettings();
  const flat = Number(settings[SETTING_KEYS.shippingFlatCents]) || 0;
  const freeOver = Number(settings[SETTING_KEYS.freeShippingOverCents]) || 0;
  const free = freeOver > 0 && basket.subtotalCents >= freeOver;
  return {
    methodId: null,
    name: flat === 0 || free ? "Free shipping" : "Shipping",
    note: null,
    cents: free ? 0 : flat,
    taxable: true,
    freeReason: free ? "threshold" : flat === 0 ? "method" : null,
  };
}

/**
 * What one method costs for this basket.
 *
 * A class cost is charged once per class in the basket, not once per item -
 * two bulky things in one parcel are one bulky surcharge. Woo can do either;
 * this is the reading that matches how a parcel is actually posted.
 */
function quoteFor(method: MethodRow, basket: ShippingBasket): ShippingQuote {
  const base: ShippingQuote = {
    methodId: method.id,
    name: method.name,
    note: method.note,
    cents: 0,
    taxable: method.taxable,
    freeReason: null,
  };

  if (method.type === "FREE" || method.type === "PICKUP") {
    return { ...base, freeReason: "method" };
  }

  if (method.freeOverCents > 0 && basket.subtotalCents >= method.freeOverCents) {
    return { ...base, freeReason: "threshold" };
  }

  const classes = new Set(basket.classIds);
  const extra = method.classCosts
    .filter((c) => classes.has(c.classId))
    .reduce((n, c) => n + c.costCents, 0);

  return { ...base, cents: Math.max(0, method.costCents + extra) };
}

/** Every method, with whether this basket may use it and why not. */
export async function shippingOptions(basket: ShippingBasket): Promise<ShippingOption[]> {
  const methods = (await prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: METHOD_SELECT,
  })) as MethodRow[];

  if (methods.length === 0) {
    const quote = await settingsQuote(basket);
    return [{ ...quote, available: true, reason: null }];
  }

  return methods.map((method) => {
    const quote = quoteFor(method, basket);
    const below = method.minOrderCents > 0 && basket.subtotalCents < method.minOrderCents;
    return {
      ...quote,
      available: !below,
      reason: below ? "Not available for this order" : null,
    };
  });
}

/**
 * The quote to charge: the method asked for when it is still available, else
 * the first one on the list that is - never nothing, since an order has to
 * carry a postage figure.
 *
 * First, not cheapest. The shop's own order is the shop's intent; picking the
 * cheapest would quietly default every order to local pickup the moment
 * someone adds it, which is not what adding it meant.
 */
export async function quoteShipping(
  basket: ShippingBasket,
  methodId?: string | null,
): Promise<ShippingQuote> {
  const options = await shippingOptions(basket);
  const usable = options.filter((o) => o.available);
  const asked = methodId ? usable.find((o) => o.methodId === methodId) : undefined;
  const chosen = asked ?? usable[0] ?? options[0];
  const { available: _available, reason: _reason, ...quote } = chosen;
  return quote;
}

/** The distinct shipping classes a set of variants belongs to. */
export async function basketClassIds(variantIds: string[]): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const rows = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { product: { select: { shippingClassId: true } } },
  });
  return [
    ...new Set(
      rows
        .map((r) => r.product.shippingClassId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/**
 * The basket total at which shipping becomes free, for the free-shipping bar,
 * the header nudge and the assistant - or 0 when nothing ever makes it free.
 *
 * Read from the shipping methods, the lowest threshold on offer: a flat rate's
 * "Free over", or the minimum order of a Free shipping method. The old Shop
 * settings value only counts while no method exists at all.
 */
export async function freeShippingThreshold(): Promise<number> {
  const methods = await prisma.shippingMethod.findMany({
    where: { isActive: true },
    select: { type: true, freeOverCents: true, minOrderCents: true },
  });

  if (methods.length === 0) {
    const settings = await getSettings();
    return Number(settings[SETTING_KEYS.freeShippingOverCents]) || 0;
  }

  const thresholds = methods
    .map((m) => (m.type === "FREE" ? m.minOrderCents : m.freeOverCents))
    .filter((cents) => cents > 0);
  return thresholds.length > 0 ? Math.min(...thresholds) : 0;
}
