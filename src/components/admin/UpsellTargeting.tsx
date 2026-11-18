"use client";

import { useState } from "react";
import { ProductPicker, type PickerOption } from "@/components/admin/ProductPicker";

export type UpsellMode = "all" | "products" | "category";

/*
 * Who sees a Checkout Upsell offer: one choice, not a checkbox and two
 * pickers that could disagree. Only the chosen row's control is rendered, so
 * what is submitted is always what the shop owner can see.
 */
export function UpsellTargeting({
  defaultMode,
  productOptions,
  defaultProductIds = [],
  categories,
  defaultCategoryIds = [],
}: {
  defaultMode: UpsellMode;
  productOptions: PickerOption[];
  defaultProductIds?: string[];
  categories: { id: string; name: string }[];
  defaultCategoryIds?: string[];
}) {
  const [mode, setMode] = useState<UpsellMode>(defaultMode);

  const row = (value: UpsellMode, label: string, hint: string) => (
    <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
      <input
        type="radio"
        name="showTo"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="h-4 w-4 accent-[var(--admin-accent)]"
      />
      {label}
      <span className="text-xs text-slate-400">{hint}</span>
    </label>
  );

  return (
    <fieldset className="px-5">
      <legend className="mb-2 text-sm font-medium text-slate-700">How to show this offer</legend>
      <div className="space-y-3">
        {row("all", "Show on all products", "every basket sees it")}

        <div>
          {row("products", "Selected products", "only when the basket holds one of them")}
          {mode === "products" ? (
            <div className="mt-3 pl-7">
              <ProductPicker
                name="triggerProductIds"
                options={productOptions}
                defaultValue={defaultProductIds}
                minChars={1}
                placeholder="Type a product name…"
              />
            </div>
          ) : null}
        </div>

        <div>
          {row("category", "Category wise", "only when the basket holds something from these")}
          {mode === "category" ? (
            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pl-7">
              {categories.length === 0 ? (
                <p className="text-sm text-slate-500">No categories yet.</p>
              ) : (
                categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="triggerCategoryIds"
                      value={c.id}
                      defaultChecked={defaultCategoryIds.includes(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}
