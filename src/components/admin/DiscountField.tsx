"use client";

import { useState } from "react";

export type DiscountKind = "none" | "percent" | "fixed";

/*
 * The discount a Checkout Upsell offer takes off each item: the type is
 * chosen from the dropdown and the amount typed beside it, so there is one
 * figure to fill in and no way to leave a second one behind. The box is
 * hidden entirely while "No discount" is chosen.
 */
export function DiscountField({
  defaultKind,
  defaultValue = "",
}: {
  defaultKind: DiscountKind;
  defaultValue?: string;
}) {
  const [kind, setKind] = useState<DiscountKind>(defaultKind);

  return (
    <div className="px-5">
      <p className="mb-2 text-sm font-medium text-slate-700">Discount on these items</p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          name="discountKind"
          value={kind}
          onChange={(e) => setKind(e.target.value as DiscountKind)}
          aria-label="Discount type"
          className="appearance-none rounded-full border border-slate-200 bg-white px-5 py-2.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 14px center",
            backgroundSize: "16px",
          }}
        >
          <option value="none">No discount</option>
          <option value="percent">Percent off</option>
          <option value="fixed">Amount off</option>
        </select>

        {kind === "none" ? (
          <span className="text-sm text-slate-500">Shown at the usual price</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-slate-500">
            {kind === "fixed" ? "$" : null}
            <input
              /* Remounting on a type change clears a figure typed as a
                 percentage before it can be read back as dollars. */
              key={kind}
              name="discountValue"
              inputMode={kind === "fixed" ? "decimal" : "numeric"}
              defaultValue={kind === defaultKind ? defaultValue : ""}
              placeholder={kind === "fixed" ? "5.00" : "10"}
              aria-label={kind === "fixed" ? "Amount off" : "Percent off"}
              className="w-24 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
            />
            {kind === "percent" ? "%" : null}
            off each item
          </span>
        )}
      </div>
    </div>
  );
}
