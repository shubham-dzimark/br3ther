/**
 * Small colour helpers for deriving a storefront palette from a couple of
 * chosen colours, so the merchant picks two or three values rather than nine.
 */

export type Rgb = { r: number; g: number; b: number };

/** Accepts #rgb and #rrggbb. Returns null for anything else. */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Mix two colours. `amount` is how much of `other` to blend in (0-1). */
export function mix(base: Rgb, other: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: base.r + (other.r - base.r) * t,
    g: base.g + (other.g - base.g) * t,
    b: base.b + (other.b - base.b) * t,
  };
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

export const darken = (c: Rgb, amount: number) => mix(c, BLACK, amount);
export const lighten = (c: Rgb, amount: number) => mix(c, WHITE, amount);

/**
 * The full set of storefront brand variables, derived from the two colours the
 * merchant actually chooses plus a highlight. Falls back to the original
 * hand-picked palette if a value can't be parsed, so a bad setting can never
 * blank out the site.
 */
export function storefrontPalette(
  primaryHex: string,
  darkHex: string,
  highlightHex: string,
): Record<string, string> {
  const primary = parseHex(primaryHex) ?? parseHex("#7B2FF7")!;
  const dark = parseHex(darkHex) ?? parseHex("#0D0A1C")!;
  const highlight = parseHex(highlightHex) ?? parseHex("#FFC400")!;

  /*
   * Each colour is emitted twice: a hex for solid use, and an "R G B" triplet
   * so Tailwind can apply opacity via rgb(var(--x-rgb) / 0.4). Applying an
   * opacity modifier straight to a var() colour renders a grey fallback
   * instead of a translucent brand colour.
   */
  const channels = (c: Rgb) =>
    `${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}`;

  /*
   * Darkening a primary that is already very dark produces a hover state
   * indistinguishable from the resting one, so lift it instead below a
   * luminance threshold. Lighter palettes keep the original behaviour.
   */
  const relativeLuminance = (c: Rgb) =>
    (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  const hover =
    relativeLuminance(primary) < 0.25
      ? lighten(primary, 0.16)
      : darken(primary, 0.14);
  const light = lighten(primary, 0.35);
  const soft = lighten(primary, 0.85);
  const deep = darken(dark, 0.24);
  const deeper = darken(dark, 0.36);
  const darkest = darken(dark, 0.56);

  /*
   * A call-to-action colour that is guaranteed to be visible on a WHITE
   * surface.
   *
   * --brand-highlight is whatever the shop picked, and this one picked white.
   * That is right on the dark panels - the order ticket, the band, the
   * footer - and invisible everywhere else: a white button on a white page,
   * which is exactly what had happened to "Proceed to checkout" in the slide
   * cart, "Track order", "Send reset link" and a dozen others.
   *
   * So: use the highlight when it is dark enough to carry white text, and
   * fall back to the primary brand colour when it is not. Buttons that sit on
   * dark panels keep using --brand-highlight directly.
   */
  const cta = relativeLuminance(highlight) > 0.62 ? primary : highlight;
  const ctaInk = relativeLuminance(cta) > 0.62 ? darkest : ({ r: 255, g: 255, b: 255 } as Rgb);

  return {
    "--brand-cta": toHex(cta),
    "--brand-cta-rgb": channels(cta),
    "--brand-cta-ink": toHex(ctaInk),
    "--brand-rgb": channels(primary),
    "--brand-hover-rgb": channels(hover),
    "--brand-light-rgb": channels(light),
    "--brand-soft-rgb": channels(soft),
    "--brand-dark-rgb": channels(dark),
    /* Header, hero, USP band and footer. Same source as --brand-dark, named
       separately so those four surfaces can be retargeted in one place. */
    "--brand-surface-rgb": channels(dark),
    "--brand-deep-rgb": channels(deep),
    "--brand-deeper-rgb": channels(deeper),
    "--brand-darkest-rgb": channels(darkest),
    "--brand-highlight-rgb": channels(highlight),
    "--brand": toHex(primary),
    "--brand-hover": toHex(hover),
    "--brand-light": toHex(light),
    "--brand-soft": toHex(soft),
    "--brand-dark": toHex(dark),
    "--brand-surface": toHex(dark),
    "--brand-deep": toHex(deep),
    "--brand-deeper": toHex(deeper),
    "--brand-darkest": toHex(darkest),
    "--brand-highlight": toHex(highlight),
  };
}
