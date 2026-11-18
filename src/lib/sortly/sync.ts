import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { setSetting } from "@/lib/settings";
import { assignBarcode, getBarcodeConfig, type BarcodeConfig } from "@/lib/barcode";
import * as api from "@/lib/sortly/api";
import { decideMerge } from "@/lib/sortly/merge";

/**
 * Two-way stock sync between product options and Sortly warehouse items.
 *
 *  - Linking: an option is linked to the Sortly item whose barcode / QR value
 *    (or Sortly ID) equals the option's barcode. Options with no Sortly item
 *    are created there (user choice). An option without a barcode first gets
 *    one from the shop's Barcode settings (or its SKU as Code 128), so the
 *    Sortly label matches what the site prints, and a retry links instead of
 *    creating twice.
 *  - Counting: Sortly is the master (see merge.ts). Site sales, cancellations
 *    and gift lines are queued as changes (outbox.ts) and applied on top of
 *    Sortly's count; changes made in Sortly are copied to the site.
 *  - Labels: barcodes are made on the site only, and products are never
 *    imported from Sortly (user rules). The Sortly label always carries the
 *    site barcode; a label changed in Sortly is put back. Each linked option
 *    stores its item's Sortly ID and label codes, so Scan Lookup recognises
 *    Sortly-printed QR labels too.
 *  - Triggers: Sortly's webhook, right after a paid/cancelled order, on saving
 *    a product (new options go to Sortly at once), on a barcode change, and the
 *    admin's "Sync now". No server timer (user choice); /api/cron/sortly-sync
 *    exists for one.
 */

export const SORTLY_KEYS = {
  enabled: "sortly.enabled",
  secretKey: "sortly.secret_key",
  folderId: "sortly.folder_id",
  createMissing: "sortly.create_missing",
  webhookToken: "sortly.webhook_token",
  lastPollAt: "sortly.last_poll_at",
  lastFullScanAt: "sortly.last_full_scan_at",
  lastRun: "sortly.last_run",
} as const;

export type SortlyConfig = {
  enabled: boolean;
  secretKey: string;
  folderId: number | null;
  createMissing: boolean;
  webhookToken: string;
  lastPollAt: number;
  lastFullScanAt: number;
  lastRun: RunSummary | null;
};

export type RunSummary = {
  at: string;
  kind: "full" | "scheduled" | "webhook" | "product";
  scanned: number;
  linked: number;
  created: number;
  synced: number;
  unmatched: number;
  errors: number;
  message?: string;
};

const MAX_CREATE_PER_RUN = 200;
const MAX_DUE_PER_RUN = 150;

const emptySummary = (kind: RunSummary["kind"]): RunSummary => ({
  at: new Date().toISOString(),
  kind,
  scanned: 0,
  linked: 0,
  created: 0,
  synced: 0,
  unmatched: 0,
  errors: 0,
});

/** Settings read straight from the table: a run saves and re-reads them. */
export async function readSortlyConfig(): Promise<SortlyConfig> {
  const rows = await prisma.storeSetting.findMany({ where: { key: { startsWith: "sortly." } } });
  const s = new Map(rows.map((r) => [r.key, r.value]));
  const int = (k: string) => {
    const n = Number(s.get(k) ?? "");
    return Number.isFinite(n) ? n : 0;
  };
  let lastRun: RunSummary | null = null;
  try {
    lastRun = s.get(SORTLY_KEYS.lastRun) ? (JSON.parse(s.get(SORTLY_KEYS.lastRun) as string) as RunSummary) : null;
  } catch {
    lastRun = null;
  }
  const folder = Number(s.get(SORTLY_KEYS.folderId) ?? "");
  return {
    enabled: s.get(SORTLY_KEYS.enabled) === "1",
    secretKey: (s.get(SORTLY_KEYS.secretKey) ?? "").trim(),
    folderId: Number.isInteger(folder) && folder > 0 ? folder : null,
    createMissing: s.get(SORTLY_KEYS.createMissing) !== "0",
    webhookToken: s.get(SORTLY_KEYS.webhookToken) ?? "",
    lastPollAt: int(SORTLY_KEYS.lastPollAt),
    lastFullScanAt: int(SORTLY_KEYS.lastFullScanAt),
    lastRun,
  };
}

export async function ensureWebhookToken(): Promise<string> {
  const cfg = await readSortlyConfig();
  if (cfg.webhookToken.length >= 32) return cfg.webhookToken;
  const token = randomBytes(24).toString("hex");
  await setSetting(SORTLY_KEYS.webhookToken, token);
  return token;
}

export async function sortlyLog(
  level: "info" | "warn" | "error",
  action: string,
  message: string,
  extra: { variantId?: string | null; sortlyItemId?: number | null } = {},
): Promise<void> {
  await prisma.sortlySyncLog
    .create({
      data: {
        level,
        action,
        message: message.slice(0, 500),
        variantId: extra.variantId ?? null,
        sortlyItemId: extra.sortlyItemId ?? null,
      },
    })
    .catch(() => undefined);
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const stopsRun = (e: unknown) => e instanceof api.SortlyError && (e.status === 429 || e.status === 401);

const codeKey = (s: string) => s.trim().toLowerCase();
const labelCodesOf = (item: api.SortlyItem) =>
  [item.labelUrl, item.labelUrlExtra].filter((c): c is string => Boolean(c));
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** Whether a site barcode is already one of the item's codes (label, second label or Sortly ID). */
function itemHasCode(item: api.SortlyItem, code: string | null | undefined): boolean {
  if (!code) return false;
  const k = codeKey(code);
  return [item.labelUrl, item.labelUrlExtra, item.sid].some((c) => c !== null && codeKey(c) === k);
}

/* ------------------------------------------------------------------------ */
/* Labels                                                                    */
/* ------------------------------------------------------------------------ */

type LabelRow = {
  id: string;
  barcode: string | null;
  barcodeFormat: string | null;
  sortlySid: string | null;
  sortlyLabelCodes: string[];
};

/**
 * Barcodes are made on the site only (user rule, 2026-09-14): the Sortly label
 * always carries the option's site barcode, so a label changed in Sortly is put
 * back. Also keeps the stored Sortly ID and label codes current for Scan Lookup.
 * Returns whether the label was rewritten.
 */
async function refreshLabel(cfg: SortlyConfig, v: LabelRow, item: api.SortlyItem): Promise<boolean> {
  let codes = labelCodesOf(item);
  let pushed = false;
  if (v.barcode && !itemHasCode(item, v.barcode)) {
    try {
      await api.setLabel(cfg.secretKey, item.id, v.barcode, api.labelTypeFor(v.barcodeFormat));
      codes = [v.barcode, ...(item.labelUrlExtra ? [item.labelUrlExtra] : [])];
      pushed = true;
      await sortlyLog("info", "label", `Sortly label set to the site barcode ${v.barcode}.`, { variantId: v.id, sortlyItemId: item.id });
    } catch (e) {
      await sortlyLog("error", "label", `Could not put barcode ${v.barcode} on the Sortly label: ${errText(e)}`, { variantId: v.id, sortlyItemId: item.id });
      if (stopsRun(e)) throw e;
    }
  }
  if (item.sid !== v.sortlySid || !sameList(codes, v.sortlyLabelCodes)) {
    await prisma.productVariant.update({ where: { id: v.id }, data: { sortlySid: item.sid, sortlyLabelCodes: codes } });
  }
  return pushed;
}

/** The site barcode of these linked options changed: put it on their Sortly labels now. */
export async function pushSortlyLabels(variantIds: string[]): Promise<number> {
  if (variantIds.length === 0) return 0;
  const cfg = await readSortlyConfig();
  if (!cfg.enabled || !cfg.secretKey) return 0;

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, sortlyItemId: { not: null } },
    select: { id: true, barcode: true, barcodeFormat: true, sortlyItemId: true, sortlySid: true, sortlyLabelCodes: true },
  });
  let pushed = 0;
  for (const v of variants) {
    const itemId = v.sortlyItemId as number;
    try {
      const item = await api.getItem(cfg.secretKey, itemId);
      if (!item) continue; // Deleted in Sortly: the next sync unlinks it.
      if (await refreshLabel(cfg, v, item)) pushed += 1;
    } catch (e) {
      await sortlyLog("error", "label", `Could not update the Sortly label: ${errText(e)}`, { variantId: v.id, sortlyItemId: itemId });
      if (stopsRun(e)) break;
    }
  }
  return pushed;
}

/* ------------------------------------------------------------------------ */
/* One linked option: the count                                              */
/* ------------------------------------------------------------------------ */

const inFlight = new Set<string>();

type SyncResult = "busy" | "skip" | "unlinked" | "error" | "recovered" | ReturnType<typeof decideMerge>["kind"];

/** Brings one linked option and its Sortly item to the same count. */
export async function syncVariant(cfg: SortlyConfig, variantId: string, known?: api.SortlyItem): Promise<SyncResult> {
  if (inFlight.has(variantId)) return "busy";
  inFlight.add(variantId);
  try {
    return await syncVariantInner(cfg, variantId, known);
  } finally {
    inFlight.delete(variantId);
  }
}

async function syncVariantInner(cfg: SortlyConfig, variantId: string, known?: api.SortlyItem): Promise<SyncResult> {
  // A consistent picture: a sale commits its stock change and its queued change together.
  const { v, rows } = await prisma.$transaction(
    async (tx) => {
      const v = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          stock: true,
          manageStock: true,
          barcode: true,
          barcodeFormat: true,
          sortlyItemId: true,
          sortlyBaseQty: true,
          sortlyPendingQty: true,
          sortlyPendingRun: true,
          sortlyPendingSite: true,
          sortlySid: true,
          sortlyLabelCodes: true,
        },
      });
      const rows = v?.sortlyItemId
        ? await tx.sortlyStockChange.findMany({
            where: { variantId, appliedAt: null },
            select: { id: true, delta: true, runId: true },
          })
        : [];
      return { v, rows };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  if (!v || v.sortlyItemId === null || !v.manageStock) return "skip";
  const itemId = v.sortlyItemId;

  let item: api.SortlyItem | null;
  try {
    item = known && known.id === itemId ? known : await api.getItem(cfg.secretKey, itemId);
  } catch (e) {
    await sortlyLog("error", "fetch", `Could not read Sortly item ${itemId}: ${errText(e)}`, { variantId, sortlyItemId: itemId });
    throw e;
  }

  if (!item) {
    // Deleted in Sortly: unlink, leave the site's stock as it is.
    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variantId },
        data: {
          sortlyItemId: null,
          sortlyBaseQty: null,
          sortlyPendingQty: null,
          sortlyPendingRun: null,
          sortlyPendingSite: null,
          sortlySid: null,
          sortlyLabelCodes: [],
        },
      }),
      prisma.sortlyStockChange.updateMany({
        where: { variantId, appliedAt: null },
        data: { appliedAt: new Date(), lastError: "Item was deleted in Sortly" },
      }),
    ]);
    await sortlyLog("warn", "unlink", `Sortly item ${itemId} no longer exists, so the option was unlinked.`, { variantId, sortlyItemId: itemId });
    return "unlinked";
  }

  await refreshLabel(cfg, v, item);

  if (item.quantity === null) {
    await sortlyLog("warn", "skip", `Sortly item ${itemId} is not counted in units, so its stock is not synced.`, { variantId, sortlyItemId: itemId });
    return "skip";
  }

  // A push that reached Sortly but was not written back here (e.g. a restart).
  if (v.sortlyPendingRun) {
    if (item.quantity === v.sortlyPendingQty) {
      await finalizePush(variantId, v.sortlyPendingRun, v.sortlyPendingQty, v.sortlyPendingSite ?? v.stock);
      await sortlyLog("info", "recover", `Finished an interrupted update: both now ${v.sortlyPendingQty}.`, { variantId, sortlyItemId: itemId });
      return "recovered";
    }
    await prisma.$transaction([
      prisma.sortlyStockChange.updateMany({ where: { runId: v.sortlyPendingRun, appliedAt: null }, data: { runId: null } }),
      prisma.productVariant.update({
        where: { id: variantId },
        data: { sortlyPendingQty: null, sortlyPendingRun: null, sortlyPendingSite: null },
      }),
    ]);
    return syncVariantInner(cfg, variantId, item);
  }

  const open = rows.filter((r) => r.runId === null);
  const pendingDelta = open.reduce((sum, r) => sum + r.delta, 0);
  const d = decideMerge({ base: v.sortlyBaseQty, sortly: item.quantity, site: v.stock, pendingDelta });

  if (d.pushToSortly) {
    const run = randomBytes(8).toString("hex");
    await prisma.$transaction([
      prisma.sortlyStockChange.updateMany({
        where: { id: { in: open.map((r) => r.id) }, appliedAt: null },
        data: { runId: run },
      }),
      prisma.productVariant.update({
        where: { id: variantId },
        data: { sortlyPendingQty: d.final, sortlyPendingRun: run, sortlyPendingSite: v.stock },
      }),
    ]);
    try {
      await api.setQuantity(cfg.secretKey, itemId, d.final);
    } catch (e) {
      await prisma.$transaction([
        prisma.sortlyStockChange.updateMany({
          where: { runId: run, appliedAt: null },
          data: { runId: null, attempts: { increment: 1 }, lastError: errText(e) },
        }),
        prisma.productVariant.update({
          where: { id: variantId },
          data: { sortlyPendingQty: null, sortlyPendingRun: null, sortlyPendingSite: null },
        }),
      ]);
      await sortlyLog("error", "push", `Could not update Sortly item ${itemId} to ${d.final}: ${errText(e)}`, { variantId, sortlyItemId: itemId });
      return "error";
    }
    await finalizePush(variantId, run, d.final, v.stock);
  } else {
    await prisma.$transaction([
      prisma.sortlyStockChange.updateMany({
        where: { id: { in: open.map((r) => r.id) }, appliedAt: null },
        data: { appliedAt: new Date() },
      }),
      prisma.productVariant.update({
        where: { id: variantId },
        data: { stock: { increment: d.final - v.stock }, sortlyBaseQty: d.final, sortlySyncedAt: new Date() },
      }),
    ]);
  }

  const messages: Record<string, string> = {
    "first-link": `Linked: site stock set to Sortly's ${d.final}.`,
    deltas: `Sent ${pendingDelta > 0 ? "+" : ""}${pendingDelta} from site orders: Sortly ${item.quantity} → ${d.final}.`,
    sortly: `Sortly changed ${v.sortlyBaseQty} → ${item.quantity}${pendingDelta ? ` (plus ${pendingDelta} from site orders)` : ""}: site stock now ${d.final}.`,
    site: `Site stock edited to ${v.stock}: Sortly ${item.quantity} → ${d.final}.`,
    conflict: `Both changed (Sortly ${item.quantity}, site ${v.stock}); Sortly wins${pendingDelta ? ` plus ${pendingDelta} from site orders` : ""}: both now ${d.final}.`,
  };
  if (messages[d.kind]) {
    await sortlyLog(d.kind === "conflict" ? "warn" : "info", d.kind, messages[d.kind], { variantId, sortlyItemId: itemId });
  }
  return d.kind;
}

async function finalizePush(variantId: string, run: string, final: number, siteAtClaim: number): Promise<void> {
  await prisma.$transaction([
    prisma.sortlyStockChange.updateMany({ where: { runId: run, appliedAt: null }, data: { appliedAt: new Date() } }),
    prisma.productVariant.update({
      where: { id: variantId },
      data: {
        // An increment, so a sale that lands meanwhile is not overwritten.
        stock: { increment: final - siteAtClaim },
        sortlyBaseQty: final,
        sortlySyncedAt: new Date(),
        sortlyPendingQty: null,
        sortlyPendingRun: null,
        sortlyPendingSite: null,
      },
    }),
  ]);
}

/* ------------------------------------------------------------------------ */
/* Linking and creating                                                      */
/* ------------------------------------------------------------------------ */

/** Options that take part: active, counting stock, on products the cart can sell. */
function syncableWhere(): Prisma.ProductVariantWhereInput {
  return {
    isActive: true,
    manageStock: true,
    product: { type: { notIn: ["GROUPED", "EXTERNAL"] }, status: { not: "ARCHIVED" } },
  };
}

async function linkVariant(variantId: string, item: api.SortlyItem, site: number): Promise<boolean> {
  const qty = Math.max(0, item.quantity ?? 0);
  // One Sortly item links to one option (checked here, not by a DB constraint).
  const other = await prisma.productVariant.findFirst({
    where: { sortlyItemId: item.id, NOT: { id: variantId } },
    select: { id: true },
  });
  if (other) {
    await sortlyLog("warn", "link", `Sortly item ${item.id} is already linked to another option.`, { variantId, sortlyItemId: item.id });
    return false;
  }
  try {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sortlyItemId: item.id,
        sortlyBaseQty: qty,
        sortlySyncedAt: new Date(),
        sortlySid: item.sid,
        sortlyLabelCodes: labelCodesOf(item),
        stock: { increment: qty - site },
      },
    });
    return true;
  } catch (e) {
    await sortlyLog("error", "link", `Could not link Sortly item ${item.id}: ${errText(e)}`, { variantId, sortlyItemId: item.id });
    return false;
  }
}

const LINK_SELECT = {
  id: true,
  sku: true,
  name: true,
  barcode: true,
  barcodeFormat: true,
  stock: true,
  priceCents: true,
  sortlyItemId: true,
  product: { select: { name: true } },
} satisfies Prisma.ProductVariantSelect;

type LinkRow = Prisma.ProductVariantGetPayload<{ select: typeof LINK_SELECT }>;

type LinkCtx = {
  cfg: SortlyConfig;
  items: api.SortlyItem[];
  byCode: Map<string, api.SortlyItem>;
  byId: Map<number, api.SortlyItem>;
  taken: Set<number>;
  summary: RunSummary;
  barcodeConfig: BarcodeConfig;
};

function addToIndex(ctx: Pick<LinkCtx, "byCode" | "byId">, item: api.SortlyItem): void {
  ctx.byId.set(item.id, item);
  for (const code of [item.labelUrl, item.labelUrlExtra, item.sid]) {
    if (code && !ctx.byCode.has(codeKey(code))) ctx.byCode.set(codeKey(code), item);
  }
}

async function buildCtx(cfg: SortlyConfig, items: api.SortlyItem[], summary: RunSummary): Promise<LinkCtx> {
  const ctx: LinkCtx = {
    cfg,
    items,
    byCode: new Map(),
    byId: new Map(),
    taken: new Set(
      (await prisma.productVariant.findMany({ where: { sortlyItemId: { not: null } }, select: { sortlyItemId: true } })).map(
        (v) => v.sortlyItemId as number,
      ),
    ),
    summary,
    barcodeConfig: await getBarcodeConfig(),
  };
  for (const item of items) addToIndex(ctx, item);
  return ctx;
}

/** Every Sortly item. Callers that may create items pass maxAgeMs 0 so nothing new in Sortly is missed. */
let indexCache: { at: number; items: api.SortlyItem[] } | null = null;

async function sortlyItems(cfg: SortlyConfig, maxAgeMs: number): Promise<api.SortlyItem[]> {
  if (indexCache && Date.now() - indexCache.at < maxAgeMs) return indexCache.items;
  const items = await api.listItems(cfg.secretKey);
  indexCache = { at: Date.now(), items };
  return items;
}

async function linkMatch(ctx: LinkCtx, v: LinkRow, match: api.SortlyItem, code: string): Promise<void> {
  if (ctx.taken.has(match.id)) {
    ctx.summary.unmatched += 1;
    await sortlyLog("warn", "link", `Barcode ${code} is on a Sortly item already linked to another option.`, { variantId: v.id, sortlyItemId: match.id });
    return;
  }
  if (match.quantity === null) {
    ctx.summary.unmatched += 1;
    await sortlyLog("warn", "link", `Sortly item "${match.name}" is not counted in units, so it was not linked.`, { variantId: v.id, sortlyItemId: match.id });
    return;
  }
  if (await linkVariant(v.id, match, v.stock)) {
    ctx.taken.add(match.id);
    ctx.summary.linked += 1;
    await sortlyLog("info", "link", `Linked to Sortly item "${match.name}" by barcode ${code}; site stock set to ${Math.max(0, match.quantity)}.`, { variantId: v.id, sortlyItemId: match.id });
  } else {
    ctx.summary.errors += 1;
  }
}

/** Links one option to its Sortly item by barcode, or creates the item. False means stop the run. */
async function linkOrCreate(ctx: LinkCtx, v: LinkRow): Promise<boolean> {
  const { cfg, summary } = ctx;
  let barcode = v.barcode?.trim() || null;
  let format = v.barcodeFormat;

  const found = barcode ? ctx.byCode.get(codeKey(barcode)) : undefined;
  if (found && barcode) {
    await linkMatch(ctx, v, found, barcode);
    return true;
  }
  if (!cfg.createMissing || summary.created >= MAX_CREATE_PER_RUN) {
    summary.unmatched += 1;
    return true;
  }

  if (!barcode) {
    // A barcode first, so the Sortly label matches what the site prints and a retry links instead of creating twice.
    if (ctx.barcodeConfig.enabled) {
      const assigned = await assignBarcode(v.id, ctx.barcodeConfig).catch(() => null);
      if (assigned) {
        const fresh = await prisma.productVariant.findUnique({ where: { id: v.id }, select: { barcode: true, barcodeFormat: true } });
        barcode = fresh?.barcode ?? assigned;
        format = fresh?.barcodeFormat ?? ctx.barcodeConfig.format;
      }
    }
    if (!barcode) {
      const candidate = v.sku.trim();
      const clash = candidate
        ? await prisma.productVariant.findFirst({ where: { barcode: candidate, NOT: { id: v.id } }, select: { id: true } })
        : null;
      if (!candidate || clash) {
        summary.unmatched += 1;
        await sortlyLog("warn", "create", "Option has no barcode and its SKU is already used as another barcode.", { variantId: v.id });
        return true;
      }
      await prisma.productVariant.update({ where: { id: v.id }, data: { barcode: candidate, barcodeFormat: "code128" } });
      barcode = candidate;
      format = "code128";
    }
    const nowFound = ctx.byCode.get(codeKey(barcode));
    if (nowFound) {
      await linkMatch(ctx, v, nowFound, barcode);
      return true;
    }
  }

  const optionName = v.name && v.name !== v.product.name && !/^default/i.test(v.name) ? ` - ${v.name}` : "";
  try {
    const created = await api.createItem(cfg.secretKey, {
      name: `${v.product.name}${optionName}`,
      quantity: Math.max(0, v.stock),
      price: v.priceCents / 100,
      parentId: cfg.folderId,
      labelUrl: barcode,
      labelType: api.labelTypeFor(format),
    });
    const withQty: api.SortlyItem = {
      ...created,
      quantity: created.quantity ?? Math.max(0, v.stock),
      labelUrl: created.labelUrl ?? barcode,
    };
    ctx.items.push(withQty);
    addToIndex(ctx, withQty);
    if (await linkVariant(v.id, withQty, v.stock)) {
      ctx.taken.add(created.id);
      summary.created += 1;
      await sortlyLog("info", "create", `Created in Sortly with quantity ${withQty.quantity} and barcode ${barcode}.`, { variantId: v.id, sortlyItemId: created.id });
    } else {
      summary.errors += 1;
    }
  } catch (e) {
    summary.errors += 1;
    await sortlyLog("error", "create", `Could not create the item in Sortly: ${errText(e)}`, { variantId: v.id });
    if (stopsRun(e)) return false;
  }
  return true;
}

async function saveRun(summary: RunSummary): Promise<void> {
  await setSetting(SORTLY_KEYS.lastRun, JSON.stringify(summary)).catch(() => undefined);
}

let fullRunActive = false;

/** Reads every Sortly item, links and creates, then syncs every linked option. */
export async function runFullSync(cfg?: SortlyConfig): Promise<RunSummary> {
  const conf = cfg ?? (await readSortlyConfig());
  const summary = emptySummary("full");
  if (!conf.secretKey) return { ...summary, errors: 1, message: "No Sortly secret key is saved." };
  if (fullRunActive) return { ...summary, message: "A full sync is already running." };
  fullRunActive = true;
  const startedAt = Math.floor(Date.now() / 1000);

  try {
    let items: api.SortlyItem[];
    try {
      items = await sortlyItems(conf, 0);
    } catch (e) {
      await sortlyLog("error", "scan", `Could not read items from Sortly: ${errText(e)}`);
      const failed = { ...summary, errors: 1, message: errText(e) };
      await saveRun(failed);
      return failed;
    }
    summary.scanned = items.length;
    const ctx = await buildCtx(conf, items, summary);

    const unlinked = await prisma.productVariant.findMany({
      where: { ...syncableWhere(), sortlyItemId: null },
      orderBy: { createdAt: "asc" },
      select: LINK_SELECT,
    });
    for (const v of unlinked) {
      if (!(await linkOrCreate(ctx, v))) break;
    }

    const linked = await prisma.productVariant.findMany({
      where: { ...syncableWhere(), sortlyItemId: { not: null } },
      select: { id: true, sortlyItemId: true },
    });
    for (const v of linked) {
      try {
        const r = await syncVariant(conf, v.id, ctx.byId.get(v.sortlyItemId as number));
        if (r === "error") summary.errors += 1;
        else if (r !== "none" && r !== "skip" && r !== "busy") summary.synced += 1;
      } catch (e) {
        summary.errors += 1;
        if (stopsRun(e)) break;
      }
    }

    await setSetting(SORTLY_KEYS.lastFullScanAt, String(startedAt));
    await setSetting(SORTLY_KEYS.lastPollAt, String(startedAt));
    await saveRun(summary);
    return summary;
  } finally {
    fullRunActive = false;
  }
}

/** A product was saved: link or create its options in Sortly now, not at the next Sync now. */
export async function linkOrCreateForProduct(productId: string): Promise<RunSummary | null> {
  const cfg = await readSortlyConfig();
  if (!cfg.enabled || !cfg.secretKey) return null;

  const variants = await prisma.productVariant.findMany({
    where: { ...syncableWhere(), productId, sortlyItemId: null },
    orderBy: { createdAt: "asc" },
    select: LINK_SELECT,
  });
  if (variants.length === 0) return null;

  const summary = emptySummary("product");
  try {
    /*
     * The whole item list, read fresh, so an item the warehouse already has is
     * linked rather than created twice. A cached list (it was 60s) missed items
     * added in Sortly during that minute and created duplicates.
     */
    const items = await sortlyItems(cfg, 0);
    summary.scanned = items.length;
    const ctx = await buildCtx(cfg, items, summary);
    for (const v of variants) {
      if (!(await linkOrCreate(ctx, v))) break;
    }
  } catch (e) {
    summary.errors += 1;
    await sortlyLog("error", "product", `Could not send the saved product to Sortly: ${errText(e)}`);
  }
  if (summary.linked || summary.created || summary.errors) await saveRun(summary);
  return summary;
}

/* ------------------------------------------------------------------------ */
/* Scheduled run, webhook, after-order kick                                  */
/* ------------------------------------------------------------------------ */

/** Sortly's recent changes, then anything waiting on the site side. */
export async function runScheduledSync(): Promise<RunSummary | { skipped: string }> {
  const cfg = await readSortlyConfig();
  if (!cfg.enabled || !cfg.secretKey) return { skipped: "disabled" };

  const now = Math.floor(Date.now() / 1000);
  const unlinked = await prisma.productVariant.count({ where: { ...syncableWhere(), sortlyItemId: null } });
  if (!cfg.lastFullScanAt || (now - cfg.lastFullScanAt > 3600 && unlinked > 0) || now - cfg.lastFullScanAt > 6 * 3600) {
    const full = await runFullSync(cfg);
    await pruneLog();
    return full;
  }

  const summary = emptySummary("scheduled");
  let pollOk = false;
  try {
    const changed = await api.listItems(cfg.secretKey, Math.max(0, cfg.lastPollAt - 120), 20);
    summary.scanned = changed.length;
    const variants = await prisma.productVariant.findMany({
      where: { sortlyItemId: { in: changed.map((i) => i.id) } },
      select: { id: true, sortlyItemId: true },
    });
    const byItem = new Map(variants.map((v) => [v.sortlyItemId as number, v.id]));
    for (const item of changed) {
      const variantId = byItem.get(item.id);
      if (!variantId) continue;
      const r = await syncVariant(cfg, variantId, item);
      if (r === "error") summary.errors += 1;
      else if (r !== "none" && r !== "skip" && r !== "busy") summary.synced += 1;
    }
    pollOk = true;
  } catch (e) {
    summary.errors += 1;
    summary.message = errText(e);
    await sortlyLog("error", "poll", `Could not read recent Sortly changes: ${errText(e)}`);
  }

  // Sales not yet sent, hand edits on the site, interrupted updates.
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT v.id FROM "ProductVariant" v
    WHERE v."sortlyItemId" IS NOT NULL AND v."manageStock" = true AND (
      v."sortlyPendingRun" IS NOT NULL
      OR v."sortlyBaseQty" IS NULL
      OR v.stock <> v."sortlyBaseQty"
      OR EXISTS (SELECT 1 FROM "SortlyStockChange" c WHERE c."variantId" = v.id AND c."appliedAt" IS NULL)
    )
    LIMIT ${MAX_DUE_PER_RUN}`;
  for (const { id } of due) {
    try {
      const r = await syncVariant(cfg, id);
      if (r === "error") summary.errors += 1;
      else if (r !== "none" && r !== "skip" && r !== "busy") summary.synced += 1;
    } catch (e) {
      summary.errors += 1;
      if (stopsRun(e)) break;
    }
  }

  if (pollOk) await setSetting(SORTLY_KEYS.lastPollAt, String(now));
  if (summary.synced || summary.errors) await saveRun(summary);
  await pruneLog();
  return summary;
}

async function pruneLog(): Promise<void> {
  await prisma.sortlySyncLog
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } })
    .catch(() => undefined);
}

/** Numeric ids anywhere in a webhook payload whose record looks like an item. */
export function webhookItemIds(payload: unknown): number[] {
  const ids = new Set<number>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 5 || ids.size >= 25 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n, depth + 1);
      return;
    }
    const r = node as Record<string, unknown>;
    const id = Number(r.id ?? r.item_id);
    const type = typeof r.type === "string" ? r.type : "";
    if (Number.isInteger(id) && id > 0 && type !== "folder") ids.add(id);
    for (const [k, v] of Object.entries(r)) if (k !== "id" && typeof v === "object") walk(v, depth + 1);
  };
  walk(payload, 0);
  return [...ids];
}

/** Sortly told us items changed: re-read each one (the payload is not trusted) and sync. */
export async function handleSortlyWebhook(payload: unknown): Promise<void> {
  const cfg = await readSortlyConfig();
  if (!cfg.enabled || !cfg.secretKey) return;
  for (const itemId of webhookItemIds(payload)) {
    try {
      const variant = await prisma.productVariant.findFirst({ where: { sortlyItemId: itemId }, select: { id: true } });
      if (variant) {
        await syncVariant(cfg, variant.id);
        continue;
      }
      // A new or relabelled item may match an option that is not linked yet.
      const item = await api.getItem(cfg.secretKey, itemId);
      if (!item || item.quantity === null) continue;
      const codes = [item.labelUrl, item.labelUrlExtra, item.sid].filter((c): c is string => Boolean(c));
      if (codes.length === 0) continue;
      const option = await prisma.productVariant.findFirst({
        where: { ...syncableWhere(), sortlyItemId: null, barcode: { in: codes, mode: "insensitive" } },
        select: { id: true, stock: true },
      });
      if (option && (await linkVariant(option.id, item, option.stock))) {
        await sortlyLog("info", "link", `Linked to new Sortly item "${item.name}" by barcode.`, { variantId: option.id, sortlyItemId: item.id });
      }
    } catch (e) {
      await sortlyLog("error", "webhook", `Webhook for item ${itemId} failed: ${errText(e)}`, { sortlyItemId: itemId });
    }
  }
}

const soon = new Set<string>();
let soonTimer: ReturnType<typeof setTimeout> | null = null;

/** After a paid or cancelled order: send the change within a couple of seconds. */
export function syncVariantsSoon(variantIds: string[]): void {
  for (const id of variantIds) soon.add(id);
  if (soonTimer) return;
  soonTimer = setTimeout(async () => {
    soonTimer = null;
    const ids = [...soon];
    soon.clear();
    try {
      const cfg = await readSortlyConfig();
      if (!cfg.enabled || !cfg.secretKey) return;
      for (const id of ids) await syncVariant(cfg, id).catch(() => undefined);
    } catch {
      // Sync now picks these up.
    }
  }, 1500);
}
