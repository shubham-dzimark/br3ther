import "server-only";

/*
 * The product spreadsheet: one format, written by the export and read back by
 * the import.
 *
 * One row is one sellable line, not one product. A simple product is a single
 * row; a variable product is one row per option, all sharing the same slug and
 * repeating the product's own columns. That is how a shop actually thinks
 * about a price list, and it means a file can be opened, a column of prices
 * changed, and sent straight back.
 *
 * Two rules the whole importer rests on:
 *  - `slug` identifies the product and `sku` identifies the option. Both are
 *    unique in the database, so a row can always be matched to exactly one
 *    thing, or to nothing, in which case it is created.
 *  - A blank cell means "leave this as it is". It never means "clear it".
 *    Anything else would turn a file exported with a few columns deleted into
 *    a way to wipe descriptions across the catalogue.
 *
 * Nothing here deletes. A product missing from the file is left alone.
 */

/** Columns written by the export, in the order they appear. */
export const PRODUCT_CSV_HEADERS = [
  "slug",
  "name",
  "type",
  "status",
  "featured",
  "category",
  "categories",
  "variant_name",
  "sku",
  "barcode",
  "price",
  "compare_at_price",
  "stock",
  "manage_stock",
  "stock_status",
  "weight_grams",
  "sold_individually",
  "shipping_class",
  "short_description",
  "description",
  "seo_title",
  "seo_description",
  "cover_image_url",
  "images",
  "external_url",
  "external_label",
] as const;

export type ProductCsvColumn = (typeof PRODUCT_CSV_HEADERS)[number];

export const PRODUCT_TYPES = ["SIMPLE", "VARIABLE", "GROUPED", "EXTERNAL", "GIFT_CARD"] as const;
export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const STOCK_STATUSES = ["IN_STOCK", "OUT_OF_STOCK", "ON_BACKORDER"] as const;

/** Several values in one cell - categories, image URLs. */
export const LIST_SEPARATOR = "|";

/**
 * A row after parsing. Every field is optional: `undefined` is a blank cell,
 * which leaves whatever is already stored alone.
 */
export type ProductCsvRow = {
  /** 1-based line number in the file, for the error list. */
  line: number;
  slug: string;
  name?: string;
  type?: (typeof PRODUCT_TYPES)[number];
  status?: (typeof PRODUCT_STATUSES)[number];
  featured?: boolean;
  category?: string;
  categories?: string[];
  variantName?: string;
  sku?: string;
  barcode?: string;
  priceCents?: number;
  compareAtCents?: number | null;
  stock?: number;
  manageStock?: boolean;
  stockStatus?: (typeof STOCK_STATUSES)[number];
  weightGrams?: number | null;
  soldIndividually?: boolean;
  shippingClass?: string;
  shortDescription?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImageUrl?: string;
  images?: string[];
  externalUrl?: string;
  externalLabel?: string;
};

export type ProductCsvIssue = { line: number; message: string };

/**
 * Where each known column sits in the uploaded file.
 *
 * Headers are squashed to letters before matching, so "Price", "price" and
 * "Price (CAD)" all land on the same column, and a file whose columns have
 * been reordered or thinned out still reads correctly.
 */
export function mapProductHeader(cells: string[]): Partial<Record<ProductCsvColumn, number>> {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const seen = cells.map(squash);
  const at = (...names: string[]) => {
    for (const n of names) {
      const i = seen.indexOf(squash(n));
      if (i !== -1) return i;
    }
    return undefined;
  };

  return {
    slug: at("slug", "handle", "permalink"),
    name: at("name", "title", "productname"),
    type: at("type", "producttype"),
    status: at("status", "published"),
    featured: at("featured"),
    category: at("category", "primarycategory"),
    categories: at("categories", "allcategories"),
    variant_name: at("variantname", "variant", "option", "optionname"),
    sku: at("sku", "code"),
    barcode: at("barcode", "gtin", "upc", "ean"),
    price: at("price", "regularprice", "priceCAD"),
    compare_at_price: at("compareatprice", "compareat", "saleprice", "wasprice"),
    stock: at("stock", "quantity", "qty", "stockquantity"),
    manage_stock: at("managestock", "trackstock"),
    stock_status: at("stockstatus", "instock"),
    weight_grams: at("weightgrams", "weight"),
    sold_individually: at("soldindividually", "limitonepercustomer"),
    shipping_class: at("shippingclass"),
    short_description: at("shortdescription", "short", "excerpt"),
    description: at("description", "longdescription", "content"),
    seo_title: at("seotitle", "metatitle"),
    seo_description: at("seodescription", "metadescription"),
    cover_image_url: at("coverimageurl", "coverimage", "mainimage", "image"),
    images: at("images", "gallery", "imageurls"),
    external_url: at("externalurl", "producturl", "buyurl"),
    external_label: at("externallabel", "buttontext"),
  };
}

/**
 * Split a file into records, honouring quoted fields that contain newlines.
 *
 * The shipping import splits on newlines alone, which is fine for a courier's
 * sheet of order numbers. It is not fine here: a product description is HTML
 * and routinely runs over several lines, and Excel writes exactly that - one
 * quoted cell spanning four lines. Splitting naively would tear one product
 * into four broken rows.
 *
 * A doubled quote inside a quoted field is an escaped quote, per RFC4180, and
 * is left for parseCsvLine to unpick.
 */
export function splitCsvRecords(text: string): string[] {
  const body = text.replace(/^\ufeff/, "");
  const records: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];

    if (ch === '"') {
      // A doubled quote stays inside the field; a lone one flips the state.
      if (quoted && body[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      quoted = !quoted;
      current += ch;
      continue;
    }

    if (!quoted && (ch === "\n" || ch === "\r")) {
      // Swallow the second half of a CRLF.
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      if (current.trim() !== "") records.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim() !== "") records.push(current);
  return records;
}

/** A slug from a product name, matching what the rest of the admin produces. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Dollars as written by a person - "$12", "12.50", "1,299.00" - into cents. */
export function parseMoneyToCents(input: string): number | null {
  const raw = input.replace(/[^0-9.,-]/g, "").replace(/,/g, "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** "yes"/"no"/"true"/"1"/"published" and friends. Null when unrecognised. */
export function parseBool(input: string): boolean | null {
  const v = input.trim().toLowerCase();
  if (v === "") return null;
  if (["yes", "y", "true", "1", "on", "published", "enabled"].includes(v)) return true;
  if (["no", "n", "false", "0", "off", "draft", "disabled"].includes(v)) return false;
  return null;
}

export function boolCell(value: boolean): string {
  return value ? "yes" : "no";
}

export function listCell(values: (string | null | undefined)[]): string {
  return values.filter((v): v is string => !!v && v.trim() !== "").join(LIST_SEPARATOR);
}

export function parseList(input: string): string[] {
  return input
    .split(LIST_SEPARATOR)
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

/**
 * Turn one line of the file into a row, collecting anything wrong with it.
 *
 * A row with issues is still returned: the caller applies the good rows and
 * lists the rest, because rejecting a 400-line file over one bad price helps
 * nobody. Only a missing slug *and* name makes a row unusable, since then
 * there is no way to know what it refers to.
 */
export function readProductRow(
  header: Partial<Record<ProductCsvColumn, number>>,
  cells: string[],
  line: number,
): { row: ProductCsvRow | null; issues: ProductCsvIssue[] } {
  const issues: ProductCsvIssue[] = [];
  const cell = (col: ProductCsvColumn): string => {
    const i = header[col];
    if (i === undefined) return "";
    return (cells[i] ?? "").trim();
  };
  /** Blank stays blank: undefined means "leave it alone". */
  const text = (col: ProductCsvColumn): string | undefined => {
    const v = cell(col);
    return v === "" ? undefined : v;
  };

  const name = text("name");
  const slug = cell("slug") || (name ? slugify(name) : "");
  if (!slug) {
    issues.push({ line, message: "no slug and no name - nothing to match this row to" });
    return { row: null, issues };
  }

  const row: ProductCsvRow = { line, slug };
  row.name = name;
  row.variantName = text("variant_name");
  row.sku = text("sku");
  row.barcode = text("barcode");
  row.category = text("category");
  row.shippingClass = text("shipping_class");
  row.shortDescription = text("short_description");
  row.description = text("description");
  row.seoTitle = text("seo_title");
  row.seoDescription = text("seo_description");
  row.coverImageUrl = text("cover_image_url");
  row.externalUrl = text("external_url");
  row.externalLabel = text("external_label");

  const categories = cell("categories");
  if (categories) row.categories = parseList(categories);

  const images = cell("images");
  if (images) row.images = parseList(images);

  const type = cell("type").toUpperCase();
  if (type) {
    if ((PRODUCT_TYPES as readonly string[]).includes(type)) {
      row.type = type as ProductCsvRow["type"];
    } else {
      issues.push({ line, message: `type "${type}" is not one of ${PRODUCT_TYPES.join(", ")}` });
    }
  }

  const status = cell("status").toUpperCase();
  if (status) {
    // "Publish" is what the product list shows, so accept it for "PUBLISHED".
    const normalised = status === "PUBLISH" ? "PUBLISHED" : status;
    if ((PRODUCT_STATUSES as readonly string[]).includes(normalised)) {
      row.status = normalised as ProductCsvRow["status"];
    } else {
      issues.push({
        line,
        message: `status "${status}" is not one of ${PRODUCT_STATUSES.join(", ")}`,
      });
    }
  }

  const stockStatus = cell("stock_status").toUpperCase().replace(/[\s-]+/g, "_");
  if (stockStatus) {
    if ((STOCK_STATUSES as readonly string[]).includes(stockStatus)) {
      row.stockStatus = stockStatus as ProductCsvRow["stockStatus"];
    } else {
      issues.push({
        line,
        message: `stock_status "${stockStatus}" is not one of ${STOCK_STATUSES.join(", ")}`,
      });
    }
  }

  for (const [col, key] of [
    ["featured", "featured"],
    ["manage_stock", "manageStock"],
    ["sold_individually", "soldIndividually"],
  ] as const) {
    const raw = cell(col);
    if (!raw) continue;
    const parsed = parseBool(raw);
    if (parsed === null) {
      issues.push({ line, message: `${col} "${raw}" is not yes or no` });
    } else {
      (row[key] as boolean) = parsed;
    }
  }

  const price = cell("price");
  if (price) {
    const cents = parseMoneyToCents(price);
    if (cents === null) issues.push({ line, message: `price "${price}" is not a number` });
    else row.priceCents = cents;
  }

  const compare = cell("compare_at_price");
  if (compare) {
    const cents = parseMoneyToCents(compare);
    // A zero here is how a spreadsheet says "no was-price", so it clears it.
    if (cents === null) {
      issues.push({ line, message: `compare_at_price "${compare}" is not a number` });
    } else {
      row.compareAtCents = cents === 0 ? null : cents;
    }
  }

  const stock = cell("stock");
  if (stock) {
    const n = Number(stock.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      issues.push({ line, message: `stock "${stock}" is not a whole number` });
    } else {
      row.stock = Math.round(n);
    }
  }

  const weight = cell("weight_grams");
  if (weight) {
    const n = Number(weight.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      issues.push({ line, message: `weight_grams "${weight}" is not a number` });
    } else {
      row.weightGrams = n === 0 ? null : Math.round(n);
    }
  }

  return { row, issues };
}

/**
 * The two example rows in the sample file: one plain product, one with two
 * options, so the shape of a variable product is obvious without reading any
 * documentation.
 */
export const PRODUCT_CSV_SAMPLE: string[][] = [
  [
    "example-cigar",
    "Example Tee",
    "SIMPLE",
    "DRAFT",
    "no",
    "T-Shirts",
    "T-Shirts",
    "Single unit",
    "EX-TEE-1",
    "",
    "24.99",
    "29.99",
    "25",
    "yes",
    "IN_STOCK",
    "180",
    "no",
    "",
    "Soft cotton tee.",
    "<p>A longer description. Basic HTML is allowed here.</p>",
    "Example Cigar | Br3thr",
    "A soft cotton tee, cut for everyday wear.",
    "https://br3thr.com/uploads/example-cigar.jpg",
    "https://br3thr.com/uploads/example-cigar-2.jpg|https://br3thr.com/uploads/example-cigar-3.jpg",
    "",
    "",
  ],
  [
    "example-hoodie",
    "Example Hoodie",
    "VARIABLE",
    "DRAFT",
    "no",
    "Hoodies",
    "Hoodies",
    "Medium",
    "EX-HOOD-M",
    "",
    "59.00",
    "",
    "10",
    "yes",
    "IN_STOCK",
    "600",
    "no",
    "",
    "Heavyweight hoodie.",
    "<p>Brushed fleece inside.</p>",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    // Same slug as the row above: this is the hoodie's second option, and only
    // the option's own columns need filling in.
    "example-hoodie",
    "Example Hoodie",
    "VARIABLE",
    "DRAFT",
    "no",
    "Hoodies",
    "Hoodies",
    "Large",
    "EX-HOOD-L",
    "",
    "62.00",
    "",
    "6",
    "yes",
    "IN_STOCK",
    "650",
    "no",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
];
