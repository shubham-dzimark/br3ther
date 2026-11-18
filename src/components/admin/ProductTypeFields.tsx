"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Field, fieldInput, fieldSelect } from "@/components/admin/Field";

const TYPES = [
  {
    value: "SIMPLE",
    label: "Simple product",
    hint: "One thing at one price. The price and stock live on its single option.",
  },
  {
    value: "VARIABLE",
    label: "Variable product",
    hint: "Options like size or colour, each with its own price, stock and barcode. Add them under Variants & pricing.",
  },
  {
    value: "GROUPED",
    label: "Grouped product",
    hint: "A set that lists the products it is made of. Choose them under Checkout Upsell Product; the page shows them as the group.",
  },
  {
    value: "EXTERNAL",
    label: "External / Affiliate product",
    hint: "Sold somewhere else. The page shows a button to that site instead of Add to cart, and it cannot be added to a cart here.",
  },
  {
    value: "GIFT_CARD",
    label: "Gift card",
    hint: "Each option is a gift card amount (edit them under Variants & pricing). The page asks who the card is for, and a code is emailed once the payment is confirmed.",
  },
] as const;

/**
 * The type the editor is currently set to.
 *
 * Shared through context so the cards further down the page - the variants
 * table, the simple price fields - can appear and disappear the moment the
 * type changes, without waiting for a save. Cards outside a provider always
 * render, so the "new product" page is unaffected.
 */
const TypeContext = createContext<{ type: string; setType: (t: string) => void } | null>(null);

export function ProductTypeProvider({
  initial,
  children,
}: {
  initial: string;
  children: ReactNode;
}) {
  const [type, setType] = useState(initial || "SIMPLE");
  return <TypeContext.Provider value={{ type, setType }}>{children}</TypeContext.Provider>;
}

/** The type currently chosen, for components that branch on it. */
export function useProductType(): string {
  return useContext(TypeContext)?.type ?? "SIMPLE";
}

/** Renders its children only for the listed product types. */
export function TypeOnly({ types, children }: { types: string[]; children: ReactNode }) {
  const ctx = useContext(TypeContext);
  if (!ctx) return <>{children}</>;
  return types.includes(ctx.type) ? <>{children}</> : null;
}

/**
 * The product type picker, and the two fields only an external product uses.
 *
 * Client-side so the external fields appear the moment the type is chosen,
 * rather than after a save - the same way WooCommerce's Product data panel
 * swaps its tabs.
 */
export function ProductTypeFields({
  defaultType = "SIMPLE",
  defaultUrl = "",
  defaultLabel = "",
  formId,
}: {
  defaultType?: string;
  defaultUrl?: string;
  defaultLabel?: string;
  /** Set when the fields sit outside the product <form>. */
  formId?: string;
}) {
  const shared = useContext(TypeContext);
  const [ownType, setOwnType] = useState(defaultType);
  const type = shared ? shared.type : ownType;
  const setType = shared ? shared.setType : setOwnType;
  const chosen = TYPES.find((t) => t.value === type) ?? TYPES[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
        <Field label="Product type" htmlFor="type">
          <select
            id="type"
            name="type"
            form={formId}
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldSelect}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="self-center rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          {chosen.hint}
        </p>
      </div>

      {type === "EXTERNAL" ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Product URL" htmlFor="externalUrl">
            <input
              id="externalUrl"
              name="externalUrl"
              form={formId}
              type="url"
              defaultValue={defaultUrl}
              placeholder="https://example.com/their-product"
              className={fieldInput}
            />
          </Field>
          <Field label="Button text" htmlFor="externalLabel">
            <input
              id="externalLabel"
              name="externalLabel"
              form={formId}
              defaultValue={defaultLabel}
              placeholder="Buy on their site"
              className={fieldInput}
            />
          </Field>
        </div>
      ) : (
        /* Keeps the saved values when another type is picked, so switching
           back does not lose the link. */
        <>
          <input type="hidden" name="externalUrl" form={formId} value={defaultUrl} />
          <input type="hidden" name="externalLabel" form={formId} value={defaultLabel} />
        </>
      )}
    </div>
  );
}
