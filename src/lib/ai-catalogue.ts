import "server-only";
import { prisma } from "@/lib/prisma";
import { getMoneyFormatter } from "@/lib/currency";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import type { ToolOutcome } from "@/lib/ai-tools";
import { getTimeZone, ymd } from "@/lib/timezone";
import { freeShippingThreshold } from "@/lib/shipping";

/**
 * What the assistant may tell customers about the shop itself.
 *
 * The dividing line is not "public vs private" in the abstract - it is what a
 * visitor could already see by clicking around the storefront. Everything here
 * is drawn from published products and active offers, which is exactly that.
 * Anything a shopper cannot reach on their own - draft products, cost prices,
 * another customer's order - is not reachable from here either, and not
 * because the model is asked nicely but because the queries cannot express it.
 */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com"
).replace(/\/$/, "");

/**
 * Only ever published products a shopper can buy. Draft, archived and
 * gift-only products are invisible, always.
 */
const PUBLIC_ONLY = { status: "PUBLISHED" as const, isGiftOnly: false };

/*
 * Words carrying no product meaning. Without this, "do you sell shoes"
 * matched a product whose description happens to contain "you" - the customer
 * asks about something the shop does not stock and is shown something it does,
 * which is worse than admitting it is not stocked.
 */
const FILLER = new Set([
  "the","and","for","you","your","yours","are","was","have","has","had","can","could","would","will",
  "does","did","doing","any","all","some","this","that","these","those","with","from","about","into",
  "our","their","its","not","but","get","got","buy","sell","selling","want","need","looking","look",
  "please","hello","tell","know","show","see","find","there","here","what","when","where","which",
  "how","why","who","them","they","his","her","him","she","also","just","like","more","most","many",
  "much","stock","available","product","products","item","items","thing","things","order","shop","store",
]);

export type CatalogueRules = {
  shareProducts: boolean;
  /** "exact" shows the number left; "vague" only says in or out of stock. */
  stockDetail: "exact" | "vague" | "hidden";
  shareOffers: boolean;
  /** Coupon codes are the one thing worth withholding by default. */
  shareCoupons: boolean;
};

export async function getCatalogueRules(): Promise<CatalogueRules> {
  const s = await getSettings();
  const stock = s[SETTING_KEYS.aiStockDetail];
  return {
    shareProducts: (s[SETTING_KEYS.aiShareProducts] ?? "1") === "1",
    stockDetail: stock === "exact" || stock === "hidden" ? stock : "vague",
    shareOffers: (s[SETTING_KEYS.aiShareOffers] ?? "1") === "1",
    shareCoupons: s[SETTING_KEYS.aiShareCoupons] === "1",
  };
}

function stockLine(stock: number, rules: CatalogueRules): string | null {
  if (rules.stockDetail === "hidden") return null;
  if (stock <= 0) return "Out of stock";
  if (rules.stockDetail === "exact") return `${stock} in stock`;
  return stock <= 5 ? "Low stock" : "In stock";
}

/**
 * Search the catalogue.
 *
 * Tokenised rather than matched as one string. The old version asked the
 * database for rows containing the customer's whole phrase, so "do you have
 * gym tops" found nothing even though a product called "Mens Gym Stringer Tank
 * Top" was sitting right there - which is exactly why the assistant kept
 * saying it had no information.
 */
export async function searchProducts(
  args: { query?: string },
  rules: CatalogueRules,
): Promise<ToolOutcome> {
  if (!rules.shareProducts) {
    return { text: "Product details are switched off. Hand this to a person.", outcome: "denied" };
  }

  const raw = String(args.query ?? "").trim().slice(0, 120);
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER.has(w))
    .slice(0, 6);

  if (words.length === 0) {
    return {
      text: "That question does not name anything to search for. Ask what they are after, or hand over.",
      outcome: "denied",
    };
  }

  const products = await prisma.product.findMany({
    where: {
      ...PUBLIC_ONLY,
      OR: words.flatMap((w) => [
        { name: { contains: w, mode: "insensitive" as const } },
        { description: { contains: w, mode: "insensitive" as const } },
        { shortDescription: { contains: w, mode: "insensitive" as const } },
        { category: { name: { contains: w, mode: "insensitive" as const } } },
      ]),
    },
    select: productShape(),
    take: 6,
    orderBy: [{ featured: "desc" }, { ratingCount: "desc" }],
  });

  /*
   * The database query is a loose substring match, which is all `contains`
   * can do - and on its own it is wrong: "hat" matches inside "that", so
   * asking for a purple sequin hat cheerfully returned an activewear set.
   *
   * So candidates are re-checked here on word boundaries, and anything that
   * only matched mid-word is dropped. Name and category count for more than a
   * passing mention in the description.
   */
  const scored = products
    .map((p) => {
      const title = `${p.name} ${p.category?.name ?? ""}`;
      const body = `${p.shortDescription ?? ""} ${p.description ?? ""}`;
      let score = 0;
      for (const w of words) {
        const boundary = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
        if (boundary.test(title)) score += 3;
        else if (boundary.test(body)) score += 1;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (scored.length === 0) {
    return {
      text: "No published product matches that. Say so plainly rather than guessing, and offer to fetch a person.",
      outcome: "not_found",
    };
  }

  const money = await getMoneyFormatter();
  return {
    text: scored.map((r) => describe(r.p, money, rules, false)).join("\n\n"),
    outcome: "ok",
  };
}

/** Everything a shopper can see on one product page. */
export async function productDetails(
  args: { slug?: string },
  rules: CatalogueRules,
): Promise<ToolOutcome> {
  if (!rules.shareProducts) {
    return { text: "Product details are switched off.", outcome: "denied" };
  }
  const slug = String(args.slug ?? "").trim().toLowerCase();
  if (!slug) return { text: "Which product? Give its link or exact name.", outcome: "denied" };

  const product = await prisma.product.findFirst({
    where: { ...PUBLIC_ONLY, slug },
    select: productShape(),
  });
  if (!product) {
    return { text: "No published product with that link.", outcome: "not_found" };
  }

  const money = await getMoneyFormatter();
  return { text: describe(product, money, rules, true), outcome: "ok" };
}

/** Active, public offers - the things already advertised on the shop. */
export async function storeOffers(rules: CatalogueRules): Promise<ToolOutcome> {
  const tz = await getTimeZone();
  if (!rules.shareOffers) {
    return { text: "Offer details are switched off.", outcome: "denied" };
  }

  const now = new Date();
  const [deals, settings, money, onSale] = await Promise.all([
    prisma.deal.findMany({
      where: {
        isActive: true,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
      },
      select: { title: true, type: true, percentOff: true, description: true, endsAt: true },
      take: 5,
    }),
    getSettings(),
    getMoneyFormatter(),
    prisma.product.findMany({
      where: { ...PUBLIC_ONLY, onSale: true },
      select: { name: true, slug: true, minPriceCents: true, discountPercent: true },
      take: 5,
    }),
  ]);

  const lines: string[] = [];

  const freeOver = await freeShippingThreshold();
  if (freeOver > 0) lines.push(`Free shipping on orders over ${money.format(freeOver)}.`);

  for (const d of deals) {
    lines.push(
      `${d.title}${d.percentOff ? ` - ${d.percentOff}% off` : ""}${
        d.endsAt ? ` (ends ${ymd(d.endsAt, tz)})` : ""
      }`,
    );
  }

  for (const p of onSale) {
    lines.push(
      `On sale: ${p.name}${p.discountPercent ? ` (${p.discountPercent}% off)` : ""} - ${money.format(p.minPriceCents)} - ${SITE_URL}/products/${p.slug}`,
    );
  }

  /*
   * Coupon codes are off by default and are the only thing here a shopper
   * could not already find. A code handed out on request is a code handed to
   * everyone, so this is the shop owner's call, not the model's.
   */
  if (rules.shareCoupons) {
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { code: true, type: true, value: true, minSubtotalCents: true },
      take: 3,
    });
    for (const c of coupons) {
      const value = c.type === "PERCENT" ? `${c.value}% off` : `${money.format(c.value)} off`;
      lines.push(
        `Code ${c.code}: ${value}${c.minSubtotalCents ? ` on orders over ${money.format(c.minSubtotalCents)}` : ""}`,
      );
    }
  }

  return lines.length
    ? { text: lines.join("\n"), outcome: "ok" }
    : { text: "There are no offers running right now.", outcome: "not_found" };
}

/* ---------- shaping ---------- */

function productShape() {
  return {
    name: true,
    slug: true,
    shortDescription: true,
    description: true,
    minPriceCents: true,
    onSale: true,
    discountPercent: true,
    ratingAverage: true,
    ratingCount: true,
    category: { select: { name: true } },
    variants: {
      where: { isActive: true },
      select: { name: true, priceCents: true, compareAtCents: true, stock: true },
      orderBy: { sortOrder: "asc" as const },
      take: 12,
    },
  };
}

type Shaped = {
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  minPriceCents: number;
  onSale: boolean;
  discountPercent: number;
  ratingAverage: number;
  ratingCount: number;
  category: { name: string } | null;
  variants: { name: string; priceCents: number; compareAtCents: number | null; stock: number }[];
};

function describe(
  p: Shaped,
  money: { format: (c: number) => string },
  rules: CatalogueRules,
  full: boolean,
): string {
  const lines = [`PRODUCT: ${p.name}`];
  if (p.category) lines.push(`Category: ${p.category.name}`);

  const cheapest = p.variants.length
    ? Math.min(...p.variants.map((v) => v.priceCents))
    : p.minPriceCents;
  // The currency is part of the figure, not a detail to be re-derived.
  lines.push(
    `Price: ${money.format(cheapest)} (quote exactly, do not convert)${p.onSale && p.discountPercent ? ` - ${p.discountPercent}% off` : ""}`,
  );

  if (p.ratingCount > 0) {
    lines.push(`Rating: ${p.ratingAverage.toFixed(1)} out of 5 from ${p.ratingCount} reviews`);
  }

  if (p.variants.length > 1) {
    lines.push(
      `Options: ${p.variants
        .map((v) => {
          const s = stockLine(v.stock, rules);
          return `${v.name} ${money.format(v.priceCents)}${s ? ` (${s})` : ""}`;
        })
        .join(", ")}`,
    );
  } else if (p.variants.length === 1) {
    const s = stockLine(p.variants[0].stock, rules);
    if (s) lines.push(`Availability: ${s}`);
  }

  const body = (full ? p.description : p.shortDescription || p.description) ?? "";
  if (body) {
    const clean = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    lines.push(`Description: ${clean.slice(0, full ? 900 : 260)}`);
  }

  // The link is what makes a "Buy now" card appear in the chat window.
  lines.push(`Link: ${SITE_URL}/products/${p.slug}`);
  return lines.join("\n");
}
