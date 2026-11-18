import "server-only";
import { toBuffer, toSVG } from "bwip-js/node";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Barcodes for products.
 *
 * Rendering goes through bwip-js rather than a hand-rolled encoder: the whole
 * point of a barcode is that a scanner reads it, and a subtly wrong bar
 * pattern looks perfectly fine on screen while failing at the till. bwip-js
 * implements the BWIPP reference encoders.
 */

export const BARCODE_FORMATS = [
  { value: "ean13", label: "EAN-13 (retail standard)", digits: 13, bwip: "ean13" },
  { value: "ean8", label: "EAN-8 (small packages)", digits: 8, bwip: "ean8" },
  { value: "upca", label: "UPC-A (North America)", digits: 12, bwip: "upca" },
  { value: "code128", label: "Code 128 (any text)", digits: 0, bwip: "code128" },
  { value: "qrcode", label: "QR code (2D, holds a link)", digits: 0, bwip: "qrcode" },
] as const;

/** 2D symbologies are sized and captioned differently from linear ones. */
export const TWO_D: readonly BarcodeFormat[] = ["qrcode"];
export const isTwoD = (format: BarcodeFormat) => TWO_D.includes(format);

export type BarcodeFormat = (typeof BARCODE_FORMATS)[number]["value"];

/**
 * Paper for a sheet of labels. "roll" is a thermal label printer, where the
 * page *is* the label, so the sheet prints one per page at the label's size.
 */
export const LABEL_PAPERS = [
  { value: "a4", label: "A4 sheet (210 x 297 mm)", width: 210, height: 297 },
  { value: "letter", label: "US Letter (216 x 279 mm)", width: 216, height: 279 },
  { value: "roll", label: "Label roll / thermal (one per page)", width: 0, height: 0 },
] as const;
export type LabelPaper = (typeof LABEL_PAPERS)[number]["value"];

/**
 * What the barcode actually carries. "auto" generates an in-store GTIN;
 * "sku" encodes the SKU you already use on the shelf; "url" puts the product
 * page link in a QR so a customer's phone opens it. Each falls back to the
 * generated number when the chosen symbology cannot hold that value - an
 * EAN-13 is thirteen digits and nothing else.
 */
export type ValueSource = "auto" | "sku" | "url";
export type TitleCase = "none" | "upper" | "capitalize";
export type LabelSort = "name" | "sku" | "newest";

export type BarcodeConfig = {
  enabled: boolean;
  format: BarcodeFormat;
  autoAssign: boolean;
  prefix: string;
  showOnProduct: boolean;
  onSlip: boolean;
  onInvoice: boolean;
  labelCopies: number;
  labelShowPrice: boolean;
  labelShowSku: boolean;
  labelShowVariant: boolean;
  labelLayout: "split" | "centered";
  labelColumns: number;
  slipQr: boolean;
  slipQrTarget: "order" | "admin" | "track";
  valueSource: ValueSource;
  /** Digits in a generated number, for symbologies with no fixed length. */
  autoDigits: number;
  /* Label design. Millimetres, because that is how label stock is sold. */
  labelPaper: LabelPaper;
  labelWidthMm: number;
  labelHeightMm: number;
  labelGapMm: number;
  labelMarginMm: number;
  labelFontPt: number;
  labelBorder: boolean;
  labelRadiusMm: number;
  labelBarColor: string;
  labelBgColor: string;
  labelTitleCase: TitleCase;
  labelPricePrefix: string;
  labelShowStore: boolean;
  labelCustomText: string;
  labelMinimal: boolean;
  labelSort: LabelSort;
  /** Order barcode inside order emails. */
  inEmail: boolean;
  /** A small code beside each line item in order emails. */
  emailItems: boolean;
};

/** #rrggbb only - the value is written into a stylesheet and an SVG. */
function hex(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

const clamp = (value: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function getBarcodeConfig(): Promise<BarcodeConfig> {
  const s = await getSettings();
  const raw = s[SETTING_KEYS.barcodeFormat];
  const format = (BARCODE_FORMATS.some((f) => f.value === raw) ? raw : "ean13") as BarcodeFormat;

  return {
    enabled: s[SETTING_KEYS.barcodeEnabled] === "1",
    format,
    autoAssign: s[SETTING_KEYS.barcodeAutoAssign] !== "0",
    prefix: (s[SETTING_KEYS.barcodePrefix] ?? "200").replace(/\D/g, ""),
    showOnProduct: s[SETTING_KEYS.barcodeShowOnProduct] === "1",
    onSlip: s[SETTING_KEYS.barcodeOnSlip] !== "0",
    onInvoice: s[SETTING_KEYS.barcodeOnInvoice] === "1",
    labelCopies: Math.min(100, Math.max(1, Number(s[SETTING_KEYS.barcodeLabelCopies]) || 1)),
    labelShowPrice: s[SETTING_KEYS.barcodeLabelShowPrice] !== "0",
    labelShowSku: s[SETTING_KEYS.barcodeLabelShowSku] !== "0",
    labelShowVariant: s[SETTING_KEYS.barcodeLabelShowVariant] !== "0",
    labelLayout: s[SETTING_KEYS.barcodeLabelLayout] === "centered" ? "centered" : "split",
    labelColumns: Math.min(5, Math.max(1, Number(s[SETTING_KEYS.barcodeLabelColumns]) || 3)),
    slipQr: s[SETTING_KEYS.barcodeSlipQr] === "1",
    slipQrTarget:
      s[SETTING_KEYS.barcodeSlipQrTarget] === "order"
        ? "order"
        : s[SETTING_KEYS.barcodeSlipQrTarget] === "track"
          ? "track"
          : "admin",
    valueSource: (["auto", "sku", "url"] as const).includes(
      s[SETTING_KEYS.barcodeValueSource] as ValueSource,
    )
      ? (s[SETTING_KEYS.barcodeValueSource] as ValueSource)
      : "auto",
    autoDigits: clamp(s[SETTING_KEYS.barcodeAutoDigits], 6, 18, 12),
    labelPaper: LABEL_PAPERS.some((p) => p.value === s[SETTING_KEYS.barcodeLabelPaper])
      ? (s[SETTING_KEYS.barcodeLabelPaper] as LabelPaper)
      : "a4",
    labelWidthMm: clamp(s[SETTING_KEYS.barcodeLabelWidth], 20, 210, 60),
    labelHeightMm: clamp(s[SETTING_KEYS.barcodeLabelHeight], 12, 297, 35),
    labelGapMm: clamp(s[SETTING_KEYS.barcodeLabelGap], 0, 20, 3),
    labelMarginMm: clamp(s[SETTING_KEYS.barcodeLabelMargin], 0, 30, 8),
    labelFontPt: clamp(s[SETTING_KEYS.barcodeLabelFont], 5, 16, 9),
    labelBorder: s[SETTING_KEYS.barcodeLabelBorder] !== "0",
    labelRadiusMm: clamp(s[SETTING_KEYS.barcodeLabelRadius], 0, 10, 2),
    labelBarColor: hex(s[SETTING_KEYS.barcodeLabelBarColor], "#000000"),
    labelBgColor: hex(s[SETTING_KEYS.barcodeLabelBgColor], "#FFFFFF"),
    labelTitleCase: (["none", "upper", "capitalize"] as const).includes(
      s[SETTING_KEYS.barcodeLabelTitleCase] as TitleCase,
    )
      ? (s[SETTING_KEYS.barcodeLabelTitleCase] as TitleCase)
      : "none",
    labelPricePrefix: (s[SETTING_KEYS.barcodeLabelPricePrefix] ?? "").slice(0, 12),
    labelShowStore: s[SETTING_KEYS.barcodeLabelShowStore] === "1",
    labelCustomText: (s[SETTING_KEYS.barcodeLabelCustomText] ?? "").slice(0, 60),
    labelMinimal: s[SETTING_KEYS.barcodeLabelMinimal] === "1",
    labelSort: (["name", "sku", "newest"] as const).includes(
      s[SETTING_KEYS.barcodeLabelSort] as LabelSort,
    )
      ? (s[SETTING_KEYS.barcodeLabelSort] as LabelSort)
      : "name",
    inEmail: s[SETTING_KEYS.barcodeInEmail] === "1",
    emailItems: s[SETTING_KEYS.barcodeEmailItems] === "1",
  };
}

export function formatMeta(format: BarcodeFormat) {
  return BARCODE_FORMATS.find((f) => f.value === format) ?? BARCODE_FORMATS[0];
}

/**
 * The GS1 mod-10 check digit, used by EAN-13, EAN-8 and UPC-A.
 *
 * Weights alternate 3 and 1 from the rightmost body digit leftwards, which is
 * why the parity depends on the length rather than being fixed.
 */
export function checkDigit(body: string): number {
  const digits = body.split("").map(Number);
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(code)) return false;
  const body = code.slice(0, -1);
  return checkDigit(body) === Number(code.slice(-1));
}

/**
 * Build a generated number for a variant.
 *
 * The prefix defaults to 200, which GS1 reserves for in-store use - numbers in
 * that range are guaranteed never to collide with a real manufacturer's GTIN,
 * so scanning one of our labels can't pull up someone else's product.
 *
 * EAN-13, EAN-8 and UPC-A fix their own length and end in a check digit, so
 * `digits` is ignored for them. Code 128 and QR carry any length, so those use
 * the chosen digit count. Code 128 used to encode the SKU here instead, which
 * meant "generated number" quietly produced something else entirely.
 */
export function buildCode(
  format: BarcodeFormat,
  prefix: string,
  sequence: number,
  digits = 12,
): string {
  const meta = formatMeta(format);
  const head = (prefix || "").replace(/\D/g, "");

  if (meta.digits === 0) {
    const width = Math.min(18, Math.max(6, Math.round(digits)));
    // Room for a sequence even with a long prefix.
    const lead = head.slice(0, Math.max(0, width - 4));
    const tail = String(sequence)
      .padStart(width - lead.length, "0")
      .slice(-(width - lead.length));
    return `${lead}${tail}`;
  }

  const bodyLength = meta.digits - 1;
  const lead = (head || "200").slice(0, Math.max(0, bodyLength - 4));
  const tail = String(sequence)
    .padStart(bodyLength - lead.length, "0")
    .slice(-(bodyLength - lead.length));
  const body = `${lead}${tail}`;
  return `${body}${checkDigit(body)}`;
}

/** SVG for a code, sized for a label rather than a screen. */
export function renderBarcodeSvg(
  code: string,
  format: BarcodeFormat,
  opts: {
    height?: number;
    scale?: number;
    includeText?: boolean;
    /** #rrggbb. Scanners want dark bars on a light ground - see the settings note. */
    barColor?: string;
    bgColor?: string;
  } = {},
): string | null {
  if (!code) return null;
  // bwip wants bare hex, and treats white as "no background" when omitted.
  const bar = opts.barColor && /^#[0-9a-fA-F]{6}$/.test(opts.barColor)
    ? opts.barColor.slice(1)
    : undefined;
  const bg = opts.bgColor && /^#[0-9a-fA-F]{6}$/.test(opts.bgColor)
    ? opts.bgColor.slice(1)
    : undefined;
  try {
    /*
     * A QR is a square: it takes its size from scale alone, and bwip rejects
     * the linear `height`. It also carries no human-readable caption - the
     * text under a QR is noise, since nobody types one in by hand.
     */
    if (isTwoD(format)) {
      return toSVG({
        bcid: formatMeta(format).bwip,
        text: code,
        scale: opts.scale ?? 3,
        includetext: false,
        ...(bar ? { barcolor: bar } : {}),
        ...(bg ? { backgroundcolor: bg } : {}),
      });
    }

    return toSVG({
      bcid: formatMeta(format).bwip,
      text: code,
      scale: opts.scale ?? 2,
      height: opts.height ?? 12,
      includetext: opts.includeText ?? true,
      textxalign: "center",
      textsize: 8,
      ...(bar ? { barcolor: bar, textcolor: bar } : {}),
      ...(bg ? { backgroundcolor: bg } : {}),
    });
  } catch {
    /*
     * A code that does not fit its symbology - the wrong digit count, or a
     * bad check digit - throws here. Returning null shows "no barcode" in the
     * UI instead of a broken image or a 500 on a product page.
     */
    return null;
  }
}

/**
 * The same barcode as a PNG.
 *
 * Email clients are the reason this exists: Gmail, Outlook and Apple Mail all
 * refuse inline SVG, so a code in an email has to be a bitmap fetched over
 * http. PDFs take a bitmap too. Everything on screen keeps using the SVG.
 */
export async function renderBarcodePng(
  code: string,
  format: BarcodeFormat,
  opts: { height?: number; scale?: number; includeText?: boolean } = {},
): Promise<Buffer | null> {
  if (!code) return null;
  try {
    if (isTwoD(format)) {
      return await toBuffer({
        bcid: formatMeta(format).bwip,
        text: code,
        scale: opts.scale ?? 4,
        includetext: false,
      });
    }
    return await toBuffer({
      bcid: formatMeta(format).bwip,
      text: code,
      scale: opts.scale ?? 3,
      height: opts.height ?? 10,
      includetext: opts.includeText ?? true,
      textxalign: "center",
      textsize: 9,
    });
  } catch {
    return null;
  }
}

/** Absolute URL of the PNG above - what an <img> in an email points at. */
export function barcodeImageUrl(
  code: string,
  format: BarcodeFormat,
  opts: { height?: number; scale?: number } = {},
): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/+$/, "");
  const q = new URLSearchParams({ code, format });
  if (opts.height) q.set("h", String(opts.height));
  if (opts.scale) q.set("s", String(opts.scale));
  return `${base}/api/barcode?${q.toString()}`;
}

/**
 * The code a variant should carry when the shop does not want a generated
 * number. Returns null when the chosen source cannot be encoded in the chosen
 * symbology, and the caller falls back to the generated GTIN.
 */
export function codeFromSource(
  source: ValueSource,
  format: BarcodeFormat,
  sku: string,
  productUrl: string | null,
): string | null {
  if (source === "sku") {
    const clean = sku.trim();
    if (!clean) return null;
    // Free-text symbologies take the SKU as it is.
    if (format === "code128" || format === "qrcode") return clean.toUpperCase().slice(0, 40);
    // A digit symbology can only use a SKU that already is a valid code.
    const meta = formatMeta(format);
    if (clean.length === meta.digits && /^\d+$/.test(clean) && isValidGtin(clean)) return clean;
    return null;
  }
  if (source === "url") {
    // Only a QR is worth putting a link in; a linear code would be unreadable.
    return format === "qrcode" && productUrl ? productUrl : null;
  }
  return null;
}

/** Where a product lives, for the "product link" value source. */
export function productUrlFor(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/+$/, "");
  return `${base}/products/${slug}`;
}

/**
 * Give a variant a code if it has not got one.
 *
 * The sequence comes from how many codes exist rather than the row count, so
 * deleting a product cannot hand its number to the next one. Collisions are
 * retried because the unique index is the real arbiter.
 */
export async function assignBarcode(
  variantId: string,
  config?: BarcodeConfig,
): Promise<string | null> {
  const c = config ?? (await getBarcodeConfig());
  if (!c.enabled) return null;

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, sku: true, barcode: true, product: { select: { slug: true } } },
  });
  if (!variant || variant.barcode) return variant?.barcode ?? null;

  /*
   * A shop that wants its own SKUs or a product link gets exactly that, as
   * long as the symbology can carry it. Anything else drops through to the
   * generated number below rather than writing a code no scanner can read.
   */
  const direct = codeFromSource(
    c.valueSource,
    c.format,
    variant.sku,
    productUrlFor(variant.product.slug),
  );
  if (direct) {
    const taken = await prisma.productVariant.findUnique({
      where: { barcode: direct },
      select: { id: true },
    });
    if (!taken) {
      try {
        await prisma.productVariant.update({
          where: { id: variantId },
          data: { barcode: direct, barcodeFormat: c.format },
        });
        return direct;
      } catch {
        // Lost a race; fall through to a generated number.
      }
    }
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const used = await prisma.productVariant.count({ where: { barcode: { not: null } } });
    const code = buildCode(c.format, c.prefix, used + 1 + attempt, c.autoDigits);

    const clash = await prisma.productVariant.findUnique({
      where: { barcode: code },
      select: { id: true },
    });
    if (clash) continue;

    try {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { barcode: code, barcodeFormat: c.format },
      });
      return code;
    } catch {
      // Lost a race to another assignment; try the next number.
    }
  }
  return null;
}

/** Fill in every variant that has no code yet. Returns how many were given one. */
export async function assignMissingBarcodes(): Promise<number> {
  const config = await getBarcodeConfig();
  if (!config.enabled) return 0;

  const missing = await prisma.productVariant.findMany({
    where: { barcode: null },
    select: { id: true },
  });

  let done = 0;
  for (const v of missing) {
    if (await assignBarcode(v.id, config)) done += 1;
  }
  return done;
}

/** Resolve a scanned code to what it belongs to. */
export async function lookupBarcode(code: string) {
  const clean = code.trim();
  if (!clean) return null;

  /*
   * Sortly-printed labels resolve too: the linked item's Sortly ID and label
   * codes are kept on the option by the Sortly sync. A Sortly QR that encodes a
   * link still carries the Sortly ID (e.g. S01QSR0001), so that is tried as well.
   */
  const sortlyId = clean.toUpperCase().match(/\bS[0-9A-Z]{9}\b/)?.[0] ?? null;
  const variant = await prisma.productVariant.findFirst({
    where: {
      OR: [
        { barcode: clean },
        { sku: clean },
        { sortlySid: clean },
        { sortlyLabelCodes: { has: clean } },
        ...(sortlyId && sortlyId !== clean ? [{ sortlySid: sortlyId }] : []),
      ],
    },
    include: { product: { select: { id: true, name: true, slug: true } } },
  });
  if (variant) return { kind: "variant" as const, variant };

  // Orders are scannable too, by the number printed on the packing slip.
  const order = await prisma.order.findFirst({
    where: { OR: [{ orderNumber: clean }, { orderNumber: clean.replace(/^#/, "") }] },
    select: { id: true, orderNumber: true, status: true },
  });
  return order ? { kind: "order" as const, order } : null;
}
