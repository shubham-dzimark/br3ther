// All money is integer cents. These helpers are the only place that converts.

/**
 * The one place a price becomes text: "$80 CAD", "$9.83 CAD", "£12.50 GBP".
 *
 * Two deliberate choices:
 *  - narrowSymbol, so CAD renders as "$" rather than Intl's default "CA$",
 *    with the code appended instead. Same information, read more naturally,
 *    and it still distinguishes CAD from USD.
 *  - trailing ".00" is dropped on whole amounts, so $80 stays $80, while
 *    anything with cents keeps both digits.
 */
export function formatMoney(
  cents: number,
  currency = "CAD",
  locale = "en-CA",
): string {
  const whole = cents % 100 === 0;
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  };

  try {
    const out = new Intl.NumberFormat(locale, options).format(cents / 100);
    /*
     * Intl has no narrow symbol for every code - for those it prints the code
     * itself, which would give "XYZ 80 XYZ" once the suffix is appended. When
     * the code is already in the output, it is the symbol, so leave it alone.
     */
    return out.includes(currency) ? out : `${out} ${currency}`;
  } catch {
    // Unknown currency code - show the number rather than throwing mid-render.
    const plain = new Intl.NumberFormat(locale, {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
    return currency ? `${plain} ${currency}` : plain;
  }
}

export function formatCents(cents: number, currency = "CAD"): string {
  return formatMoney(cents, currency);
}

/**
 * Parse a user-typed price ("12", "12.5", "$12.50") into integer cents.
 * Returns null when the input isn't a usable positive amount.
 */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Round rather than truncate so 12.345 -> 1235, not 1234.
  return Math.round(value * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
