"use client";

import { useEffect, useState } from "react";
import { STOCK_STATUS_OPTIONS } from "@/lib/stock";

/*
 * Select several options on Manage inventory and change them together.
 *
 * The row boxes are plain inputs rendered with the table (`data-bulk-row`,
 * `form="inventory-bulk"`), so they post with this bar's form and not with the
 * "Save stock levels" form they sit inside. The bar and the select-all box
 * count them straight from the page, so neither needs the rows passed in.
 */

const ROW = "input[data-bulk-row]";

const control =
  "rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 outline-none transition focus:border-[var(--admin-accent)]";

const rowBoxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(ROW));

/** How many row boxes are ticked, out of how many, kept current as they change. */
function useSelection() {
  const [selection, setSelection] = useState({ checked: 0, total: 0 });
  useEffect(() => {
    const sync = () => {
      const boxes = rowBoxes();
      setSelection({ checked: boxes.filter((b) => b.checked).length, total: boxes.length });
    };
    sync();
    document.addEventListener("change", sync, true);
    return () => document.removeEventListener("change", sync, true);
  }, []);
  return selection;
}

function selectAll(on: boolean) {
  for (const box of rowBoxes()) box.checked = on;
  // Setting .checked fires nothing, so tell the counters.
  document.dispatchEvent(new Event("change"));
}

/** The header box: ticks or clears every listed option, part-filled when some are ticked. */
export function BulkSelectAll() {
  const { checked, total } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label="Select all listed options"
      checked={total > 0 && checked === total}
      ref={(el) => {
        if (el) el.indeterminate = checked > 0 && checked < total;
      }}
      onChange={(e) => selectAll(e.target.checked)}
      className="h-4 w-4 accent-[var(--admin-accent)]"
    />
  );
}

export function InventoryBulkBar({
  formId,
  action,
  back,
}: {
  formId: string;
  action: (fd: FormData) => void | Promise<void>;
  /** This page with its search and filter, to come back to after applying. */
  back: string;
}) {
  const { checked, total } = useSelection();
  const [track, setTrack] = useState("");
  const [mode, setMode] = useState("set");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const quantityChosen = amount.trim() !== "";
  const somethingChosen = track !== "" || status !== "" || quantityChosen;

  return (
    <form
      id={formId}
      action={action}
      // The ids are read when the form is submitted; clearing the boxes right
      // after means a stale selection is never re-applied by accident.
      onSubmit={() => window.setTimeout(() => selectAll(false), 0)}
      className="mx-3 mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 lg:mx-5"
    >
      <input type="hidden" name="back" value={back} />

      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm font-medium text-slate-700">
          {checked > 0 ? `${checked} of ${total} selected` : "Tick options to change them together"}
          {checked > 0 ? (
            <button
              type="button"
              onClick={() => selectAll(false)}
              className="ml-3 text-xs font-normal text-slate-500 underline underline-offset-2 hover:text-slate-800"
            >
              Clear
            </button>
          ) : null}
        </p>

        <select
          name="bulkTrack"
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          aria-label="Tracking for selected options"
          className={control}
        >
          <option value="">Tracking: no change</option>
          <option value="on">Track quantity</option>
          <option value="off">Don&rsquo;t track</option>
        </select>

        <div className="flex items-center gap-2">
          <select
            name="bulkMode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="How to change the stock"
            className={control}
          >
            <option value="set">Set stock to</option>
            <option value="add">Add to stock</option>
            <option value="remove">Remove from stock</option>
          </select>
          <input
            name="bulkAmount"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Qty"
            aria-label="Quantity"
            className={`w-24 ${control}`}
          />
        </div>

        <select
          name="bulkStatus"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status for selected options"
          className={control}
        >
          <option value="">Status: no change</option>
          {STOCK_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          type="submit"
          disabled={checked === 0 || !somethingChosen}
          className="rounded-full bg-[var(--admin-btn)] px-5 py-2 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply to selected
        </button>
      </div>

      {quantityChosen && track !== "off" ? (
        <p className="mt-2 text-xs text-slate-500">
          Changing the quantity also turns tracking on for the selected options &mdash; a
          count only limits the cart while it is tracked. Removing more than there is stops at 0.
        </p>
      ) : null}
    </form>
  );
}
