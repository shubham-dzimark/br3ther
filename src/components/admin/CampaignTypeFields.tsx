"use client";

import { useState } from "react";
import { Field, fieldInput } from "./Field";

/**
 * Campaign type, priority and - for next-order campaigns - the coupon each
 * customer receives. Shared by the new-campaign form and the editor.
 */

const TYPES = [
  { value: "CHECKOUT", label: "Checkout Upsells", hint: "Products offered on the checkout page." },
  { value: "CART", label: "Cart Upsells", hint: "Products offered on the cart page, before checkout." },
  { value: "THANK_YOU", label: "Thank You Page Upsells", hint: "One-click add to an order just placed, before the e-Transfer is sent." },
  { value: "NEXT_ORDER", label: "Next Order Coupons", hint: "A personal coupon for the next purchase, shown after ordering and in the order email." },
] as const;

export function CampaignTypeFields({
  defaultPlacement = "CHECKOUT",
  defaultPriority = 10,
  defaultValidDays = 30,
  defaultMinSpend = "",
}: {
  defaultPlacement?: string;
  defaultPriority?: number;
  defaultValidDays?: number;
  defaultMinSpend?: string;
}) {
  const [placement, setPlacement] = useState(defaultPlacement);
  const current = TYPES.find((t) => t.value === placement) ?? TYPES[0];

  return (
    <div className="space-y-5">
      <Field label="Campaign type" htmlFor="placement">
        <select id="placement" name="placement" value={placement} onChange={(e) => setPlacement(e.target.value)} className={fieldInput}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="-mt-3 px-5 text-xs text-slate-500">{current.hint}</p>

      <Field label="Priority" htmlFor="priority">
        <input id="priority" name="priority" type="number" min={0} max={100} defaultValue={defaultPriority} className={fieldInput} />
      </Field>
      <p className="-mt-3 px-5 text-xs text-slate-500">Higher wins when more than one campaign qualifies for the same spot.</p>

      {placement === "NEXT_ORDER" ? (
        <div className="space-y-5 rounded-[var(--admin-radius-sm)] border border-[var(--admin-line)] bg-[var(--admin-inset)] p-4">
          <p className="text-sm font-medium text-slate-700">Coupon each customer receives</p>
          <p className="-mt-3 text-xs text-slate-500">
            Set the amount with the discount below. Each code is single-use for one customer, and only unlocks once the order that earned it is paid.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valid for (days)" htmlFor="couponValidDays">
              <input id="couponValidDays" name="couponValidDays" type="number" min={1} max={365} defaultValue={defaultValidDays} className={fieldInput} />
            </Field>
            <Field label="Minimum spend to use it" htmlFor="couponMinSpend">
              <input id="couponMinSpend" name="couponMinSpend" inputMode="decimal" placeholder="0.00" defaultValue={defaultMinSpend} className={fieldInput} />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}
