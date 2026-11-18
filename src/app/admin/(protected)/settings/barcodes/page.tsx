import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import {
  BARCODE_FORMATS,
  LABEL_PAPERS,
  getBarcodeConfig,
  renderBarcodeSvg,
  buildCode,
  formatMeta,
} from "@/lib/barcode";
import { generateMissing, regenerateAll, saveBarcodeSettings } from "./actions";

export const metadata: Metadata = { title: "Barcodes" };
export const dynamic = "force-dynamic";

export default async function BarcodeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; n?: string }>;
}) {
  await requireCapability("appearance");
  const [{ saved, error, n }, config, counts] = await Promise.all([
    searchParams,
    getBarcodeConfig(),
    prisma.productVariant
      .findMany({ select: { barcode: true } })
      .then((rows) => ({
        total: rows.length,
        withCode: rows.filter((r) => r.barcode).length,
      })),
  ]);

  // A live preview of the chosen format, so the setting is not abstract.
  const sample = buildCode(config.format, config.prefix, 1, config.autoDigits);
  const fixedLength = formatMeta(config.format).digits > 0;
  const preview = renderBarcodeSvg(sample, config.format, { height: 14, scale: 2 });
  // The same code again in the label's own colours, to show the design.
  // Matches the label sheet: short bars, no built-in caption, number as small text.
  const labelPreview = renderBarcodeSvg(sample, config.format, {
    height: Math.max(4, Math.round(config.labelHeightMm * (config.labelMinimal ? 0.3 : 0.2))),
    scale: 2,
    includeText: false,
    barColor: config.labelBarColor,
    bgColor: config.labelBgColor,
  });
  const missing = counts.total - counts.withCode;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Barcodes
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            {saved === "generated"
              ? `${n} generated`
              : saved === "regenerated"
                ? `${n} regenerated`
                : "Saved"}
          </span>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-slate-500">
        Scannable codes for stock, picking and the till.
      </p>

      {error === "off" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Turn barcodes on and save before generating.
        </p>
      ) : null}

      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm ${
          config.enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {config.enabled ? (
          <>
            <strong className="font-semibold">Barcodes are on.</strong>{" "}
            {counts.withCode} of {counts.total} product variant
            {counts.total === 1 ? "" : "s"} have a code
            {missing > 0 ? ` — ${missing} still to do.` : "."}
          </>
        ) : (
          <>
            <strong className="font-semibold">Barcodes are off.</strong> Nothing
            is generated, printed or shown anywhere until this is switched on.
          </>
        )}
      </div>

      <form action={saveBarcodeSettings} className="space-y-5">
        <SectionCard title="How they work">
          <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={config.enabled}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Use barcodes
              <span className="mt-0.5 block text-xs text-slate-500">
                The master switch for everything on this page.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Format" htmlFor="format">
              <select
                id="format"
                name="format"
                defaultValue={config.format}
                className={fieldSelect}
              >
                {BARCODE_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What the code holds" htmlFor="valueSource">
              <select
                id="valueSource"
                name="valueSource"
                defaultValue={config.valueSource}
                className={fieldSelect}
              >
                <option value="auto">A generated number (safe default)</option>
                <option value="sku">Your own SKU</option>
                <option value="url">The product link (QR only)</option>
              </select>
            </Field>

            <Field label="Generated number length" htmlFor="autoDigits">
              <input
                id="autoDigits"
                name="autoDigits"
                type="number"
                min="6"
                max="18"
                defaultValue={config.autoDigits}
                className={fieldInput}
                readOnly={fixedLength}
              />
              <p className="mt-2 px-1 text-xs text-slate-500">
                {fixedLength
                  ? `${formatMeta(config.format).label.split(" (")[0]} always uses ${formatMeta(config.format).digits} digits, including its check digit, so this is set by the format.`
                  : "How many digits a generated number has, including the prefix."}
              </p>
            </Field>

            <Field label="Number prefix" htmlFor="prefix">
              <input
                id="prefix"
                name="prefix"
                inputMode="numeric"
                defaultValue={config.prefix}
                className={fieldInput}
              />
            </Field>
          </div>

          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
            <strong className="text-slate-700">Leave the prefix at 200</strong>{" "}
            unless you have bought real GS1 numbers. The 200&ndash;299 range is
            reserved for in-store use, which guarantees a code we generate can
            never collide with a real manufacturer&rsquo;s product at a till.
            Code 128 ignores the prefix and encodes the SKU itself, which suits
            internal stock control rather than retail.
          </p>

          {preview ? (
            <div className="mt-5 flex items-center gap-5 rounded-2xl border border-slate-200 p-4">
              <div
                className="[&>svg]:h-auto [&>svg]:w-[190px]"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
              <div className="text-xs text-slate-500">
                <p className="font-semibold text-slate-700">Example code</p>
                <p className="mt-1 font-mono">{sample}</p>
                <p className="mt-1">This is what the next product would get.</p>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Where they appear">
          <div className="space-y-3.5">
            {[
              { name: "autoAssign", on: config.autoAssign, label: "Give new products a code automatically", note: "As soon as a product is created." },
              { name: "showOnProduct", on: config.showOnProduct, label: "Show on the product page", note: "Most shops leave this off — it means nothing to a shopper." },
              { name: "onSlip", on: config.onSlip, label: "Print on packing slips", note: "So a picker can scan each line against the box." },
              { name: "onInvoice", on: config.onInvoice, label: "Print on invoices", note: "" },
              { name: "labelShowPrice", on: config.labelShowPrice, label: "Show the price on labels", note: "" },
              { name: "labelShowSku", on: config.labelShowSku, label: "Show the SKU on labels", note: "" },
              { name: "labelShowVariant", on: config.labelShowVariant, label: "Show the variant on labels", note: "Size or colour, under the product name." },
              { name: "slipQr", on: config.slipQr, label: "Add a QR code to packing slips", note: "Beside the order barcode. A QR holds a whole link, so a phone camera opens the order rather than reading out a number." },
            ].map((t) => (
              <label key={t.name} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name={t.name}
                  defaultChecked={t.on}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  {t.label}
                  {t.note ? (
                    <span className="mt-0.5 block text-xs text-slate-500">{t.note}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Labels per product when printing" htmlFor="labelCopies">
              <input
                id="labelCopies"
                name="labelCopies"
                type="number"
                min="1"
                max="100"
                defaultValue={config.labelCopies}
                className={fieldInput}
              />
            </Field>

            <Field label="Labels across the page" htmlFor="labelColumns">
              <select
                id="labelColumns"
                name="labelColumns"
                defaultValue={String(config.labelColumns)}
                className={fieldInput}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} per row
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Label layout" htmlFor="labelLayout">
              <select
                id="labelLayout"
                name="labelLayout"
                defaultValue={config.labelLayout}
                className={fieldInput}
              >
                <option value="split">Name left, price right</option>
                <option value="centered">Everything centred</option>
              </select>
            </Field>
          </div>

          <div className="mt-7 max-w-sm">
            <Field label="What the packing-slip QR points at" htmlFor="slipQrTarget">
              <select
                id="slipQrTarget"
                name="slipQrTarget"
                defaultValue={config.slipQrTarget}
                className={fieldInput}
              >
                <option value="admin">The order in this admin (staff)</option>
                <option value="track">The customer&rsquo;s own order page</option>
                <option value="order">Just the order number (no link)</option>
              </select>
            </Field>
            <p className="mt-2 px-1 text-xs text-slate-500">
              Only used when the QR is switched on above. The admin link needs a
              sign-in to open, so it is safe on paper that goes in the box
              &mdash; but choose the customer page if the slip is for them.
            </p>
          </div>

        </SectionCard>

        <SectionCard title="Label design">
          <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
            The printed label itself. Sizes are in millimetres, the way label
            stock is sold &mdash; measure one sticker on your sheet and put those
            numbers in. Scanners read dark bars on a pale background, so keep a
            strong contrast between the two colours.
          </p>

          <div className="mb-7 space-y-3">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="inEmail" defaultChecked={config.inEmail} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Order barcode in order emails
                <span className="mt-0.5 block text-xs text-slate-500">
                  A scannable order number under the items, so a printed email
                  works like a packing slip.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="emailItems" defaultChecked={config.emailItems} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                A code beside each item in order emails
                <span className="mt-0.5 block text-xs text-slate-500">
                  Handy for picking against the customer&rsquo;s own copy. Only
                  items that have a code show one.
                </span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Paper" htmlFor="labelPaper">
              <select id="labelPaper" name="labelPaper" defaultValue={config.labelPaper} className={fieldSelect}>
                {LABEL_PAPERS.map((paper) => (
                  <option key={paper.value} value={paper.value}>{paper.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Sort labels by" htmlFor="labelSort">
              <select id="labelSort" name="labelSort" defaultValue={config.labelSort} className={fieldSelect}>
                <option value="name">Product name</option>
                <option value="sku">SKU</option>
                <option value="newest">Newest first</option>
              </select>
            </Field>
            <Field label="Label width (mm)" htmlFor="labelWidth">
              <input id="labelWidth" name="labelWidth" type="number" min="20" max="210" defaultValue={config.labelWidthMm} className={fieldInput} />
            </Field>
            <Field label="Label height (mm)" htmlFor="labelHeight">
              <input id="labelHeight" name="labelHeight" type="number" min="12" max="297" defaultValue={config.labelHeightMm} className={fieldInput} />
            </Field>
            <Field label="Gap between labels (mm)" htmlFor="labelGap">
              <input id="labelGap" name="labelGap" type="number" min="0" max="20" defaultValue={config.labelGapMm} className={fieldInput} />
            </Field>
            <Field label="Page margin (mm)" htmlFor="labelMargin">
              <input id="labelMargin" name="labelMargin" type="number" min="0" max="30" defaultValue={config.labelMarginMm} className={fieldInput} />
            </Field>
            <Field label="Text size (pt)" htmlFor="labelFont">
              <input id="labelFont" name="labelFont" type="number" min="5" max="16" defaultValue={config.labelFontPt} className={fieldInput} />
            </Field>
            <Field label="Corner rounding (mm)" htmlFor="labelRadius">
              <input id="labelRadius" name="labelRadius" type="number" min="0" max="10" defaultValue={config.labelRadiusMm} className={fieldInput} />
            </Field>
            <Field label="Bar colour" htmlFor="labelBarColor">
              <input id="labelBarColor" name="labelBarColor" type="color" defaultValue={config.labelBarColor} className="h-11 w-full rounded-full border border-slate-200 px-2" />
            </Field>
            <Field label="Label background" htmlFor="labelBgColor">
              <input id="labelBgColor" name="labelBgColor" type="color" defaultValue={config.labelBgColor} className="h-11 w-full rounded-full border border-slate-200 px-2" />
            </Field>
            <Field label="Product name style" htmlFor="labelTitleCase">
              <select id="labelTitleCase" name="labelTitleCase" defaultValue={config.labelTitleCase} className={fieldSelect}>
                <option value="none">As written</option>
                <option value="upper">UPPERCASE</option>
                <option value="capitalize">Capitalised</option>
              </select>
            </Field>
            <Field label="Before the price" htmlFor="labelPricePrefix">
              <input id="labelPricePrefix" name="labelPricePrefix" defaultValue={config.labelPricePrefix} placeholder="e.g. Price:" maxLength={12} className={fieldInput} />
            </Field>
            <Field label="Extra line on the label" htmlFor="labelCustomText">
              <input id="labelCustomText" name="labelCustomText" defaultValue={config.labelCustomText} placeholder="e.g. Made in Canada" maxLength={60} className={fieldInput} />
            </Field>
          </div>

          <div className="mt-7 space-y-3">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="labelBorder" defaultChecked={config.labelBorder} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Outline each label
                <span className="mt-0.5 block text-xs text-slate-500">
                  A cutting guide. Turn it off when printing onto die-cut sticker sheets.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="labelShowStore" defaultChecked={config.labelShowStore} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Print the shop name
                <span className="mt-0.5 block text-xs text-slate-500">
                  A small line above the product name.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="labelMinimal" defaultChecked={config.labelMinimal} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Barcode only
                <span className="mt-0.5 block text-xs text-slate-500">
                  Drops the name, price and extras &mdash; for tiny stickers where only the code fits.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-7 rounded-2xl border border-slate-200 p-5">
            <p className="mb-3 text-xs font-medium text-slate-500">One label, as it will print</p>
            <div
              className="flex flex-col overflow-hidden px-2 py-2"
              style={{
                width: `${config.labelWidthMm}mm`,
                height: `${config.labelHeightMm}mm`,
                backgroundColor: config.labelBgColor,
                border: config.labelBorder ? "1px solid #cbd5e1" : "none",
                borderRadius: `${config.labelRadiusMm}mm`,
                fontSize: `${config.labelFontPt}pt`,
              }}
            >
              {!config.labelMinimal ? (
                <p
                  className="shrink-0 truncate font-semibold leading-tight"
                  style={{
                    textTransform:
                      config.labelTitleCase === "upper"
                        ? "uppercase"
                        : config.labelTitleCase === "capitalize"
                          ? "capitalize"
                          : "none",
                  }}
                >
                  Sample product
                </p>
              ) : null}
              {labelPreview ? (
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <div
                    className="absolute inset-0 flex items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: labelPreview }}
                  />
                </div>
              ) : null}
              {labelPreview && config.format !== "qrcode" ? (
                <p className="shrink-0 pt-[0.8mm] text-center font-mono leading-none tracking-[0.15em]" style={{ fontSize: "0.8em" }}>
                  {sample}
                </p>
              ) : null}
              {!config.labelMinimal ? (
                <p className="flex shrink-0 items-center justify-between gap-2 leading-tight">
                  <span className="truncate">SAMPLE-SKU</span>
                  <span className="shrink-0 font-bold">{config.labelPricePrefix} 19.99</span>
                </p>
              ) : null}
              {!config.labelMinimal && config.labelCustomText ? (
                <p className="shrink-0 truncate leading-tight">{config.labelCustomText}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </SectionCard>
      </form>

      <SectionCard
        title="Generate"
        action={
          <Link
            href="/admin/products/labels"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            Print labels
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <form action={generateMissing}>
            <button type="submit" className={btnPrimary}>
              Generate missing ({missing})
            </button>
          </form>

          <form action={regenerateAll}>
            <button
              type="submit"
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Regenerate everything
            </button>
          </form>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          &ldquo;Generate missing&rdquo; only fills in products without a code,
          so existing labels keep working.{" "}
          <strong className="text-red-600">Regenerate everything</strong>{" "}
          replaces every code &mdash; any label already printed and stuck on a
          box stops matching.
        </p>
      </SectionCard>
    </div>
  );
}
