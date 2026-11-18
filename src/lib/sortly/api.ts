import "server-only";

/**
 * Minimal client for the Sortly API (https://developer.sortly.com).
 *
 * Bearer auth with the account's secret key, which lives only in the database
 * (Admin > 3rd party setup > Sortly Inventory) and is never logged. Sortly
 * allows 1,000 requests per 15 minutes across the whole account; a 429 stops
 * the current run and the next scheduled run carries on.
 */

export type SortlyItem = {
  id: number;
  name: string;
  type: string;
  /** Null for items Sortly measures in something other than units. */
  quantity: number | null;
  price: number | null;
  /** Sortly's own code, e.g. S01QSR0001, that its QR labels point at. */
  sid: string | null;
  /** Value of the item's primary barcode / QR code. */
  labelUrl: string | null;
  labelUrlExtra: string | null;
  updatedAt: string | null;
};

export class SortlyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SortlyError";
  }
}

const API = "https://api.sortly.co";

/** Tests point this at a local stand-in; production always talks to Sortly. */
function baseUrl(): string {
  const override = process.env.SORTLY_API_BASE;
  return override && process.env.NODE_ENV !== "production" ? override.replace(/\/$/, "") : API;
}

/** Last rate-limit headers seen, for the admin screen. */
export const rateLimit: { max: number | null; remaining: number | null } = { max: null, remaining: null };

async function request(key: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown> {
  if (!key) throw new SortlyError(401, "No Sortly secret key is saved.");

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new SortlyError(0, `Could not reach Sortly (${e instanceof Error ? e.message : "network error"}).`);
  }

  const max = res.headers.get("Sortly-Rate-Limit-Max");
  const remaining = res.headers.get("Sortly-Rate-Limit-Remaining");
  if (max !== null && Number.isFinite(Number(max))) rateLimit.max = Number(max);
  if (remaining !== null && Number.isFinite(Number(remaining))) rateLimit.remaining = Number(remaining);

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const message =
      res.status === 401
        ? "Sortly rejected the secret key."
        : res.status === 429
          ? "Sortly's rate limit was reached; the next run will carry on."
          : json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
            ? (json as { message: string }).message
            : `Sortly returned HTTP ${res.status}.`;
    throw new SortlyError(res.status, message);
  }
  return json;
}

const unwrap = (j: unknown): unknown =>
  j && typeof j === "object" && "data" in (j as Record<string, unknown>) ? (j as { data: unknown }).data : j;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

export function toItem(raw: unknown): SortlyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = num(r.id);
  if (id === null) return null;
  const quantity = num(r.quantity);
  return {
    id,
    name: text(r.name) ?? "",
    type: text(r.type) ?? "item",
    quantity: quantity === null ? null : Math.round(quantity),
    price: num(r.price),
    sid: text(r.sid),
    labelUrl: text(r.label_url),
    labelUrlExtra: text(r.label_url_extra),
    updatedAt: text(r.updated_at),
  };
}

/** Checks the key; returns how many items and folders the account has. */
export async function testKey(key: string): Promise<number> {
  const j = (await request(key, "GET", "/api/v1/items?per_page=1")) as { meta?: { total_count?: unknown } } | null;
  return num(j?.meta?.total_count) ?? 0;
}

/** One item, or null when Sortly no longer has it. */
export async function getItem(key: string, id: number): Promise<SortlyItem | null> {
  try {
    return toItem(unwrap(await request(key, "GET", `/api/v1/items/${id}`)));
  } catch (e) {
    if (e instanceof SortlyError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Every item (folders left out), or only those changed since `updatedSince`
 * (Unix seconds). Uses /items/recent, which covers all folders.
 */
export async function listItems(key: string, updatedSince?: number, maxPages = 100): Promise<SortlyItem[]> {
  const out: SortlyItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const q = new URLSearchParams({ per_page: "100", page: String(page) });
    if (updatedSince) q.set("updated_since", String(Math.floor(updatedSince)));
    const j = (await request(key, "GET", `/api/v1/items/recent?${q}`)) as {
      data?: unknown;
      meta?: { next_page_url?: unknown; total_pages?: unknown };
    } | null;
    const rows = Array.isArray(j?.data) ? j.data : [];
    for (const row of rows) {
      const item = toItem(row);
      if (item && item.type !== "folder") out.push(item);
    }
    const totalPages = num(j?.meta?.total_pages);
    const more = Boolean(j?.meta?.next_page_url) || (totalPages !== null && page < totalPages);
    if (!more || rows.length === 0) break;
  }
  return out;
}

/** Sets the absolute count (Sortly has no add/subtract). */
export async function setQuantity(key: string, id: number, quantity: number): Promise<void> {
  await request(key, "PUT", `/api/v1/items/${id}`, { quantity });
}

export type NewItem = {
  name: string;
  quantity: number;
  price: number | null;
  parentId: number | null;
  labelUrl: string | null;
  labelType: string | null;
};

export async function createItem(key: string, input: NewItem): Promise<SortlyItem> {
  const item = toItem(
    unwrap(
      await request(key, "POST", "/api/v1/items", {
        type: "item",
        name: input.name.slice(0, 190),
        quantity: input.quantity,
        ...(input.price !== null ? { price: input.price } : {}),
        ...(input.parentId !== null ? { parent_id: input.parentId } : {}),
        ...(input.labelUrl ? { label_url: input.labelUrl, label_url_type: input.labelType ?? "org.iso.Code128" } : {}),
      }),
    ),
  );
  if (!item) throw new SortlyError(500, "Sortly did not return the new item.");
  return item;
}

/** The site's barcode formats as Sortly label symbologies. */
export const LABEL_TYPES: Record<string, string> = {
  ean13: "org.gs1.EAN-13",
  ean8: "org.gs1.EAN-8",
  code128: "org.iso.Code128",
  qrcode: "org.iso.QRCode",
};

/** Sortly has no UPC-A type; anything unmapped is labelled Code 128. */
export function labelTypeFor(format: string | null | undefined): string {
  return (format && LABEL_TYPES[format]) || "org.iso.Code128";
}

/** Puts a barcode on the item's primary label. */
export async function setLabel(key: string, id: number, labelUrl: string, labelType: string): Promise<void> {
  await request(key, "PUT", `/api/v1/items/${id}`, { label_url: labelUrl, label_url_type: labelType });
}
