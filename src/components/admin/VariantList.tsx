"use client";

import { useState, type ReactNode } from "react";
import { centsToInput } from "@/lib/money";
import { BACKORDER_OPTIONS, STOCK_STATUS_OPTIONS } from "@/lib/stock";

/**
 * The options of a variable product, WooCommerce-style: one short line each,
 * opened to edit the rest.
 *
 * The table used to carry twelve columns - SKU, image, compare-at, track,
 * quantity, backorders, low-at - so five flavours in three weights scrolled
 * sideways off the screen and down past the fold. Now a row shows what you
 * change most (price, status, visible) and everything else lives behind Edit.
 *
 * Laid out against the width of its own box, not the window: on the product
 * screen it shares the page with a sidebar, so a laptop window still left it
 * too narrow for six columns - option chips wrapped a word per line and the
 * inputs were squeezed. Below that width each option is a small card with
 * labelled fields; wide enough, it lines up as a table.
 *
 * Counting stock is one decision for the whole product rather than a tick per
 * row: a shop either counts this thing or it does not. Off by default, and the
 * quantity fields only exist while it is on - nothing asks for a number it
 * would then ignore.
 *
 * Every field stays mounted and is hidden with CSS, never unmounted, so a
 * collapsed row still posts and "Save all options" saves the lot.
 */

export type VariantRow = {
  id: string;
  name: string;
  /** "Weight: 1G", "Flavour: Mint" - what this option is. */
  options: { id: string; label: string }[];
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  stockStatus: string;
  manageStock: boolean;
  stock: number;
  backorders: string;
  lowStockAmount: number | null;
  isActive: boolean;
  /** Server-rendered forms that cannot nest inside the bulk form. */
  image: ReactNode;
  remove: ReactNode;
};

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15";

/**
 * The same columns for the header and every row, once the box is wide enough.
 * Every track but the first is a fixed width: the header and each row are
 * separate grids, and an `auto` last column sized itself to "Edit" in the
 * header but to the Edit button plus bin in a row - so each row's columns sat
 * left of their headings, and "Visible" ended up over the Edit buttons.
 */
const columns = "@3xl:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_4.5rem_8.5rem]";

/** Field caption on the narrow card; the header row names them once it is a table. */
const caption = "mb-1 block text-[11px] font-medium text-slate-500 @3xl:sr-only";

export function VariantList({
  rows,
  formId,
}: {
  rows: VariantRow[];
  formId: string;
}) {
  // On when the product already counts something, so opening and saving a
  // tracked product cannot quietly stop it counting.
  const [tracked, setTracked] = useState(rows.some((r) => r.manageStock));
  const [open, setOpen] = useState<string[]>([]);

  const toggle = (id: string) =>
    setOpen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const allOpen = open.length === rows.length && rows.length > 0;

  return (
    <div className="@container space-y-3" data-variant-grid>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={tracked}
            onChange={(e) => setTracked(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
          />
          <span className="text-sm text-slate-700">
            Track quantity for every option
            <span className="mt-0.5 block text-xs text-slate-500">
              Off means all options are always in stock and no quantity limits
              the cart. On adds a quantity, backorder rule and low-stock
              threshold to each option, under Edit.
            </span>
          </span>
        </label>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? [] : rows.map((r) => r.id))}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div
          aria-hidden="true"
          className={`hidden gap-3 bg-slate-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 @3xl:grid ${columns}`}
        >
          <span>Options</span>
          <span>Price</span>
          <span>Compare at</span>
          <span>Status</span>
          <span>Visible</span>
          <span className="text-right">Edit</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const expanded = open.includes(row.id);
            return (
              <li key={row.id}>
                {/* A card at least 32rem wide has room for Edit and the bin on the
                    same line as the fields, so they sit there instead of on a
                    line of their own under Visible. */}
                <div className={`grid grid-cols-2 items-end gap-3 px-4 py-3.5 @md:grid-cols-4 @lg:grid-cols-[repeat(3,minmax(0,1fr))_4.5rem_auto] @3xl:items-center ${columns}`}>
                  <div className="col-span-2 min-w-0 @md:col-span-4 @lg:col-span-5 @3xl:col-span-1">
                    <input type="hidden" name="variantId" form={formId} value={row.id} />
                    {/* One decision for the product, sent per option. */}
                    {tracked ? (
                      <input type="hidden" name={`manageStock_${row.id}`} form={formId} value="on" />
                    ) : null}

                    {row.options.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.options.map((o) => (
                          <span
                            key={o.id}
                            className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                          >
                            {o.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">{row.name}</span>
                    )}
                  </div>

                  <label className="min-w-0">
                    <span className={caption}>Price</span>
                    <input
                      name={`priceCents_${row.id}`}
                      form={formId}
                      inputMode="decimal"
                      defaultValue={centsToInput(row.priceCents)}
                      aria-label={`Price for ${row.name}`}
                      className={input}
                    />
                  </label>

                  {/* Beside the price: a sale price set out of sight of the
                      price it undercuts is a sale nobody checks. */}
                  <label className="min-w-0">
                    <span className={caption}>Compare at</span>
                    <input
                      name={`compareAtCents_${row.id}`}
                      form={formId}
                      inputMode="decimal"
                      defaultValue={row.compareAtCents != null ? centsToInput(row.compareAtCents) : ""}
                      placeholder="Compare at"
                      aria-label={`Compare-at price for ${row.name}`}
                      className={input}
                    />
                  </label>

                  <label className="min-w-0">
                    <span className={caption}>Status</span>
                    <select
                      name={`stockStatus_${row.id}`}
                      form={formId}
                      defaultValue={row.stockStatus}
                      aria-label={`Stock status for ${row.name}`}
                      className={input}
                    >
                      {STOCK_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>

                  {/* Captioned on top like Price, Compare at and Status, with the
                      box at the height of their inputs so the row lines up. */}
                  <label className="min-w-0" data-visible-cell data-visible-only>
                    <span className={caption}>Visible</span>
                    <span className="flex h-[34px] items-center">
                      <input
                        type="checkbox"
                        name={`isActive_${row.id}`}
                        form={formId}
                        defaultChecked={row.isActive}
                        aria-label={`Visible - ${row.name}`}
                        className="h-4 w-4 accent-[var(--admin-accent)]"
                      />
                    </span>
                  </label>

                  <div className="col-span-2 flex h-[34px] items-center justify-end gap-1.5 @md:col-span-4 @lg:col-span-1 @3xl:col-span-1" data-variant-actions>
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={expanded}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                    >
                      {expanded ? "Close" : "Edit"}
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {row.remove}
                  </div>
                </div>

                <div hidden={!expanded} className="bg-slate-50/60 px-4 pb-5 pt-1">
                  <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
                    <label className="min-w-0 text-xs text-slate-600">
                      SKU
                      <input
                        name={`sku_${row.id}`}
                        form={formId}
                        defaultValue={row.sku}
                        spellCheck={false}
                        className={`mt-1 font-mono ${input}`}
                      />
                    </label>

                    {tracked ? (
                      <>
                        <label className="min-w-0 text-xs text-slate-600">
                          Quantity
                          <input
                            name={`stock_${row.id}`}
                            form={formId}
                            type="number"
                            min="0"
                            defaultValue={row.stock}
                            className={`mt-1 ${input}`}
                          />
                        </label>
                        <label className="min-w-0 text-xs text-slate-600">
                          Allow backorders
                          <select
                            name={`backorders_${row.id}`}
                            form={formId}
                            defaultValue={row.backorders}
                            className={`mt-1 ${input}`}
                          >
                            {BACKORDER_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="min-w-0 text-xs text-slate-600">
                          Low stock at
                          <input
                            name={`lowStockAmount_${row.id}`}
                            form={formId}
                            type="number"
                            min="0"
                            defaultValue={row.lowStockAmount ?? ""}
                            placeholder="none"
                            className={`mt-1 ${input}`}
                          />
                        </label>
                      </>
                    ) : null}

                    <div className="min-w-0 text-xs text-slate-600 @md:col-span-2">
                      Image
                      <div className="mt-1">{row.image}</div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
