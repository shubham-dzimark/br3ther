/**
 * Decimal-string crypto arithmetic, ported line for line from the Crypto Pay
 * plugin's BC Math helpers (class-crypto-money.php).
 *
 * Amounts are strings, never floats: a satoshi-scale figure pushed through a
 * JavaScript number is already wrong. Scaled BigInts stand in for BC Math, and
 * like BC Math every add, multiply and divide truncates toward zero at the
 * requested scale; rounding is the explicit half-up step the plugin does.
 */

export const FIAT_DECIMALS = 2;

const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Anything that is not a plain decimal reads as "0", like the plugin's str(). */
export function str(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "" || !DECIMAL.test(s) ? "0" : s;
}

type Scaled = { units: bigint; scale: number };

// BigInt() rather than 10n literals: the project targets below ES2020.
const TEN = BigInt(10);
const ZERO = BigInt(0);
const pow = (n: number) => TEN ** BigInt(n);

function parse(v: unknown): Scaled {
  const s = str(v);
  const neg = s.startsWith("-");
  const [int = "", frac = ""] = (neg ? s.slice(1) : s).split(".");
  const units = BigInt(`${int || "0"}${frac}`);
  return { units: neg ? -units : units, scale: frac.length };
}

/** The same value at another scale, truncating toward zero when it shrinks. */
function rescale(v: Scaled, scale: number): bigint {
  return scale >= v.scale ? v.units * pow(scale - v.scale) : v.units / pow(v.scale - scale);
}

function format(units: bigint, scale: number): string {
  const neg = units < ZERO;
  const digits = (neg ? -units : units).toString().padStart(scale + 1, "0");
  const out = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return neg ? `-${out}` : out;
}

export function bcadd(a: unknown, b: unknown, scale: number): string {
  const x = parse(a);
  const y = parse(b);
  const s = Math.max(x.scale, y.scale);
  return format(rescale({ units: rescale(x, s) + rescale(y, s), scale: s }, scale), scale);
}

export function bcmul(a: unknown, b: unknown, scale: number): string {
  const x = parse(a);
  const y = parse(b);
  return format(rescale({ units: x.units * y.units, scale: x.scale + y.scale }, scale), scale);
}

export function bcdiv(a: unknown, b: unknown, scale: number): string {
  const x = parse(a);
  const y = parse(b);
  if (y.units === ZERO) throw new Error("Division by zero");
  // (X / 10^xs) / (Y / 10^ys), expressed in units of 10^-scale.
  return format((x.units * pow(y.scale + scale)) / (y.units * pow(x.scale)), scale);
}

export function bccomp(a: unknown, b: unknown, scale: number): -1 | 0 | 1 {
  const x = rescale(parse(a), scale);
  const y = rescale(parse(b), scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Truncate to a fixed precision (for clamping an already-exact value). */
export function scale(v: unknown, decimals: number): string {
  return bcadd(str(v), "0", decimals);
}

/** Round to a fixed precision, half-up - BC Math has no native round. */
export function round(v: unknown, decimals: number): string {
  let s = str(v);
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const half = `0.${"0".repeat(decimals)}5`;
  let r = bcadd(s, half, decimals + 1);
  r = bcadd(r, "0", decimals);
  return neg && bccomp(r, "0", decimals) !== 0 ? `-${r}` : r;
}

/** Fiat to crypto at a rate quoted as fiat per coin. */
export function fiatToCrypto(fiat: unknown, rate: unknown, decimals: number): string {
  const r = str(rate);
  if (bccomp(r, "0", 18) <= 0) return "0";
  return round(bcdiv(str(fiat), r, decimals + 4), decimals);
}

/** Crypto to fiat, rounded to 2 places. */
export function cryptoToFiat(crypto: unknown, rate: unknown): string {
  return round(bcmul(str(crypto), str(rate), 8), FIAT_DECIMALS);
}

export function cryptoAdd(a: unknown, b: unknown, decimals: number): string {
  return round(bcadd(str(a), str(b), decimals + 4), decimals);
}

export function fiatAdd(a: unknown, b: unknown): string {
  return round(bcadd(str(a), str(b), 6), FIAT_DECIMALS);
}

/**
 * The full breakdown for one method:
 *  base_crypto  = the order's fiat amount converted to crypto
 *  crypto_total = base_crypto + the fee (crypto-denominated)
 *  fee_fiat, total_fiat for display in the order currency.
 */
export function compute(
  fiatAmount: unknown,
  feeCrypto: unknown,
  rate: unknown,
  decimals: number,
): { base_crypto: string; crypto_total: string; fee_fiat: string; total_fiat: string } {
  const base = fiatToCrypto(fiatAmount, rate, decimals);
  const total = cryptoAdd(base, str(feeCrypto), decimals);
  const feeFiat = cryptoToFiat(feeCrypto, rate);
  const totalFiat = fiatAdd(fiatAmount, feeFiat);
  return { base_crypto: base, crypto_total: total, fee_fiat: feeFiat, total_fiat: totalFiat };
}
