"use client";

import { useState } from "react";
import { Field, fieldInput, fieldSelect } from "./Field";
import type { CouponUsageMode } from "@/lib/coupon-usage-mode";

/**
 * The coupon usage limit: unlimited, a total across all customers, or a number
 * of uses per customer (matched by email, so a guest checkout counts too). The
 * number box only appears for the two limits that need one.
 */
export function CouponUsageFields({
  defaultMode = "unlimited",
  defaultCount = null,
}: {
  defaultMode?: CouponUsageMode;
  defaultCount?: number | null;
}) {
  const [mode, setMode] = useState<CouponUsageMode>(defaultMode);

  return (
    <div className="space-y-7" data-coupon-usage>
      <Field label="Usage limit" htmlFor="usageLimit">
        <select
          id="usageLimit"
          name="usageLimit"
          value={mode}
          onChange={(e) => setMode(e.target.value as CouponUsageMode)}
          className={fieldSelect}
        >
          <option value="unlimited">Unlimited</option>
          <option value="total">Total uses (all customers)</option>
          <option value="per_customer">Uses per customer</option>
        </select>
      </Field>

      {mode === "unlimited" ? (
        <p className="-mt-4 px-5 text-xs text-slate-400">
          Anyone can use this code any number of times.
        </p>
      ) : (
        <>
          <Field label={mode === "total" ? "Total uses" : "Uses per customer"} htmlFor="usageCount">
            <input
              id="usageCount"
              name="usageCount"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={defaultCount ?? 1}
              className={fieldInput}
            />
          </Field>
          <p className="-mt-4 px-5 text-xs text-slate-400">
            {mode === "total"
              ? "The code stops working once it has been used this many times in total, by anyone."
              : "Each customer can use the code this many times, checked by their email address at checkout (guest orders count too). Cancelled or refunded orders give the use back."}
          </p>
        </>
      )}
    </div>
  );
}
