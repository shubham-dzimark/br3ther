/*
 * Which single offer a basket line gets.
 *
 * A line can qualify for three at once:
 *  - the offer it was added under from the checkout block ("grab this deal"),
 *  - a quantity tier on the product itself ("Bundle & Save"),
 *  - a companion deal, because the product it goes with is in the basket too.
 *
 * Only one applies. Stacking them put two tags on one line and produced a
 * price that neither tag explained, and a shop cannot reason about what a
 * product actually sells for when discounts multiply behind its back.
 *
 * The largest saving wins, measured from the list price so the three are
 * compared on the same footing. A tie keeps the order above: the offer the
 * shopper chose themselves, then the tier, then the companion deal.
 *
 * Kept apart from the cart so the rule can be tested on its own.
 */

export type LineOfferInput = {
  /** One unit before any discount. */
  listCents: number;
  quantity: number;
  /** Taken off each unit by the checkout-block offer, 0 when there is none. */
  offerOffCents: number;
  /** The quantity tier for this line, if the basket reaches one. */
  tier?: { percent: number; unitCents: number } | null;
  /** The companion deal, which may cover only some of the line's units. */
  deal?: { percent: number; unitOffCents: number; units: number; cents: number } | null;
};

export type LineOffer = {
  kind: "none" | "offer" | "tier" | "bundle";
  /** What the line saves in total. */
  savingCents: number;
  /** One unit as charged. For a companion deal only some units are discounted,
   *  so this stays the list price and the saving is taken off the line total. */
  unitPriceCents: number;
  /** One unit at the discounted price, for the struck-through pair. */
  discountedUnitCents: number;
  lineTotalCents: number;
  /** Percent shown on the line's single tag. */
  percent: number;
  /** Units the companion deal covers; 0 for the others. */
  units: number;
};

export function pickLineOffer(input: LineOfferInput): LineOffer {
  const { listCents, quantity, offerOffCents, tier, deal } = input;
  const list = Math.max(0, Math.round(listCents));
  const qty = Math.max(0, Math.round(quantity));

  const none: LineOffer = {
    kind: "none",
    savingCents: 0,
    unitPriceCents: list,
    discountedUnitCents: list,
    lineTotalCents: list * qty,
    percent: 0,
    units: 0,
  };
  if (qty < 1 || list < 1) return none;

  const offerOff = Math.max(0, Math.min(list, Math.round(offerOffCents)));
  const tierUnit = tier ? Math.max(0, Math.min(list, Math.round(tier.unitCents))) : list;
  const dealCents = deal ? Math.max(0, Math.round(deal.cents)) : 0;

  const candidates: LineOffer[] = [
    {
      kind: "offer",
      savingCents: offerOff * qty,
      unitPriceCents: list - offerOff,
      discountedUnitCents: list - offerOff,
      lineTotalCents: (list - offerOff) * qty,
      percent: offerOff > 0 ? Math.floor((offerOff / list) * 100) : 0,
      units: 0,
    },
    {
      kind: "tier",
      savingCents: tier ? (list - tierUnit) * qty : 0,
      unitPriceCents: tierUnit,
      discountedUnitCents: tierUnit,
      lineTotalCents: tierUnit * qty,
      percent: tier?.percent ?? 0,
      units: 0,
    },
    {
      kind: "bundle",
      savingCents: dealCents,
      // Only some units are discounted, so the unit price stays the list price
      // and the saving comes off the line's total.
      unitPriceCents: list,
      discountedUnitCents: deal ? list - Math.max(0, Math.round(deal.unitOffCents)) : list,
      lineTotalCents: list * qty - dealCents,
      percent: deal?.percent ?? 0,
      units: deal?.units ?? 0,
    },
  ];

  const best = candidates.reduce((winner, c) => (c.savingCents > winner.savingCents ? c : winner));
  return best.savingCents > 0 ? best : none;
}
