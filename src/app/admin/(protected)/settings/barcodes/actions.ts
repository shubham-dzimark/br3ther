"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import {
  assignMissingBarcodes,
  BARCODE_FORMATS,
  getBarcodeConfig,
  isValidGtin,
} from "@/lib/barcode";
// Barcodes are made here; linked Sortly labels follow them.
import { kickSortlyLabels } from "@/lib/sortly/outbox";

const PAGE = "/admin/settings/barcodes";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();
const flag = (fd: FormData, n: string) => (fd.get(n) === "on" ? "1" : "0");

/** A whole number from the form, clamped to what the sheet can actually use. */
const num = (fd: FormData, name: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(String(fd.get(name) ?? "")));
  return String(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
};

/** #rrggbb only, so a stray value cannot reach the stylesheet or the SVG. */
const colour = (fd: FormData, name: string, fallback: string) => {
  const v = String(fd.get(name) ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
};

export async function saveBarcodeSettings(fd: FormData): Promise<void> {
  await requireCapability("appearance");

  const raw = text(fd, "format");
  const format = BARCODE_FORMATS.some((f) => f.value === raw) ? raw : "ean13";

  await setSettings({
    [SETTING_KEYS.barcodeEnabled]: flag(fd, "enabled"),
    [SETTING_KEYS.barcodeFormat]: format,
    [SETTING_KEYS.barcodeAutoAssign]: flag(fd, "autoAssign"),
    [SETTING_KEYS.barcodePrefix]: text(fd, "prefix").replace(/\D/g, "").slice(0, 5) || "200",
    [SETTING_KEYS.barcodeShowOnProduct]: flag(fd, "showOnProduct"),
    [SETTING_KEYS.barcodeOnSlip]: flag(fd, "onSlip"),
    [SETTING_KEYS.barcodeOnInvoice]: flag(fd, "onInvoice"),
    [SETTING_KEYS.barcodeLabelCopies]: String(
      Math.min(100, Math.max(1, Number(fd.get("labelCopies")) || 1)),
    ),
    [SETTING_KEYS.barcodeLabelShowPrice]: flag(fd, "labelShowPrice"),
    [SETTING_KEYS.barcodeLabelShowSku]: flag(fd, "labelShowSku"),
    [SETTING_KEYS.barcodeLabelShowVariant]: flag(fd, "labelShowVariant"),
    [SETTING_KEYS.barcodeLabelLayout]:
      String(fd.get("labelLayout") ?? "") === "centered" ? "centered" : "split",
    [SETTING_KEYS.barcodeLabelColumns]: String(
      Math.min(5, Math.max(1, Number(fd.get("labelColumns")) || 3)),
    ),
    [SETTING_KEYS.barcodeSlipQr]: flag(fd, "slipQr"),
    [SETTING_KEYS.barcodeSlipQrTarget]: ["order", "admin", "track"].includes(
      String(fd.get("slipQrTarget") ?? ""),
    )
      ? String(fd.get("slipQrTarget"))
      : "admin",
    [SETTING_KEYS.barcodeValueSource]: ["auto", "sku", "url"].includes(text(fd, "valueSource"))
      ? text(fd, "valueSource")
      : "auto",
    [SETTING_KEYS.barcodeAutoDigits]: num(fd, "autoDigits", 6, 18, 12),
    [SETTING_KEYS.barcodeLabelPaper]: ["a4", "letter", "roll"].includes(text(fd, "labelPaper"))
      ? text(fd, "labelPaper")
      : "a4",
    [SETTING_KEYS.barcodeLabelWidth]: num(fd, "labelWidth", 20, 210, 60),
    [SETTING_KEYS.barcodeLabelHeight]: num(fd, "labelHeight", 12, 297, 35),
    [SETTING_KEYS.barcodeLabelGap]: num(fd, "labelGap", 0, 20, 3),
    [SETTING_KEYS.barcodeLabelMargin]: num(fd, "labelMargin", 0, 30, 8),
    [SETTING_KEYS.barcodeLabelFont]: num(fd, "labelFont", 5, 16, 9),
    [SETTING_KEYS.barcodeLabelBorder]: flag(fd, "labelBorder"),
    [SETTING_KEYS.barcodeLabelRadius]: num(fd, "labelRadius", 0, 10, 2),
    [SETTING_KEYS.barcodeLabelBarColor]: colour(fd, "labelBarColor", "#000000"),
    [SETTING_KEYS.barcodeLabelBgColor]: colour(fd, "labelBgColor", "#FFFFFF"),
    [SETTING_KEYS.barcodeLabelTitleCase]: ["none", "upper", "capitalize"].includes(
      text(fd, "labelTitleCase"),
    )
      ? text(fd, "labelTitleCase")
      : "none",
    [SETTING_KEYS.barcodeLabelPricePrefix]: text(fd, "labelPricePrefix").slice(0, 12),
    [SETTING_KEYS.barcodeLabelShowStore]: flag(fd, "labelShowStore"),
    [SETTING_KEYS.barcodeLabelCustomText]: text(fd, "labelCustomText").slice(0, 60),
    [SETTING_KEYS.barcodeLabelMinimal]: flag(fd, "labelMinimal"),
    [SETTING_KEYS.barcodeLabelSort]: ["name", "sku", "newest"].includes(text(fd, "labelSort"))
      ? text(fd, "labelSort")
      : "name",
    [SETTING_KEYS.barcodeInEmail]: flag(fd, "inEmail"),
    [SETTING_KEYS.barcodeEmailItems]: flag(fd, "emailItems"),
  });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}

/** Fill in every product that has no code yet. */
export async function generateMissing(): Promise<void> {
  await requireCapability("appearance");
  const config = await getBarcodeConfig();
  if (!config.enabled) redirect(`${PAGE}?error=off`);

  const count = await assignMissingBarcodes();
  revalidatePath(PAGE);
  revalidatePath("/admin/products");
  redirect(`${PAGE}?saved=generated&n=${count}`);
}

/**
 * Clear every code and start again.
 *
 * Kept behind its own button because printed labels stop matching the moment
 * this runs - the confirmation says so.
 */
export async function regenerateAll(): Promise<void> {
  await requireCapability("appearance");
  const config = await getBarcodeConfig();
  if (!config.enabled) redirect(`${PAGE}?error=off`);

  await prisma.productVariant.updateMany({ data: { barcode: null, barcodeFormat: null } });
  const count = await assignMissingBarcodes();
  const linked = await prisma.productVariant.findMany({ where: { sortlyItemId: { not: null } }, select: { id: true } });
  kickSortlyLabels(linked.map((v) => v.id));

  revalidatePath(PAGE);
  revalidatePath("/admin/products");
  redirect(`${PAGE}?saved=regenerated&n=${count}`);
}

/** Set or clear one variant's code by hand. */
export async function setVariantBarcode(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const variantId = text(fd, "variantId");
  const productId = text(fd, "productId");
  const code = text(fd, "barcode");
  if (!variantId) redirect("/admin/products");

  const back = `/admin/products/${productId}`;

  if (!code) {
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { barcode: null, barcodeFormat: null },
    });
    revalidatePath(back);
    redirect(`${back}?saved=1`);
  }

  const config = await getBarcodeConfig();
  // A numeric symbology with a bad check digit renders nothing and scans as
  // nothing, so it is rejected here rather than saved and silently broken.
  if (config.format !== "code128" && !isValidGtin(code)) {
    redirect(`${back}?error=barcode`);
  }

  const clash = await prisma.productVariant.findUnique({
    where: { barcode: code },
    select: { id: true },
  });
  if (clash && clash.id !== variantId) redirect(`${back}?error=barcode_taken`);

  await prisma.productVariant.update({
    where: { id: variantId },
    data: { barcode: code, barcodeFormat: config.format },
  });
  kickSortlyLabels([variantId]);

  revalidatePath(back);
  redirect(`${back}?saved=1`);
}
