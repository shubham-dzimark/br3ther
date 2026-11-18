"use client";

import { useState } from "react";
import { Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { BACKORDER_OPTIONS } from "@/lib/stock";

/**
 * The inventory fields of a simple product's own option.
 *
 * "Track this option's quantity" comes first and decides the rest: a product
 * that is not counted has no quantity, no backorder rule and no low-stock
 * threshold to set, so those three are not shown at all rather than sitting
 * there inviting numbers that would be ignored. Same rule as each row of the
 * variations table.
 */
export function SimpleInventoryFields({
  formId,
  manageStock,
  stock,
  backorders,
  lowStockAmount,
}: {
  formId: string;
  manageStock: boolean;
  stock: number;
  backorders: string;
  lowStockAmount: number | null;
}) {
  const [tracked, setTracked] = useState(manageStock);

  return (
    <>
      <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 sm:col-span-2">
        <input
          type="checkbox"
          name="manageStock"
          form={formId}
          checked={tracked}
          onChange={(e) => setTracked(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
        />
        <span className="text-sm text-slate-700">
          Track this option&rsquo;s quantity
          <span className="mt-0.5 block text-xs text-slate-500">
            Off means always in stock, and the quantity, backorder rule and
            low-stock threshold do not apply.
          </span>
        </span>
      </label>

      {tracked ? (
        <>
          <Field label="Stock" htmlFor="invStock">
            <input
              id="invStock"
              name="stock"
              form={formId}
              type="number"
              min="0"
              defaultValue={stock}
              className={fieldInput}
            />
          </Field>
          <Field label="Allow backorders" htmlFor="invBackorders">
            <select
              id="invBackorders"
              name="backorders"
              form={formId}
              defaultValue={backorders}
              className={fieldSelect}
            >
              {BACKORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Low stock threshold" htmlFor="invLowStock">
            <input
              id="invLowStock"
              name="lowStockAmount"
              form={formId}
              type="number"
              min="0"
              defaultValue={lowStockAmount ?? ""}
              placeholder="none"
              className={fieldInput}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}
