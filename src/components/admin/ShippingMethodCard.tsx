"use client";

import { useState, type ReactNode } from "react";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * One shipping method, edited the way WooCommerce does it: a name the customer
 * sees, a tax status, a cost, and "Add shipping class costs" for the extra that
 * each class adds.
 *
 * A client component because the fields on offer depend on the type - free
 * shipping has no cost to set - and because the class costs stay folded away
 * until they are wanted, which is most of the time.
 */
export type MethodFields = {
  id: string;
  name: string;
  type: string;
  taxable: boolean;
  cost: string;
  freeOver: string;
  minOrder: string;
  note: string;
  isActive: boolean;
};

export function ShippingMethodCard({
  method,
  classes,
  action,
  remove,
}: {
  method: MethodFields;
  classes: { id: string; name: string; cost: string }[];
  action: (formData: FormData) => void | Promise<void>;
  remove: ReactNode;
}) {
  const [type, setType] = useState(method.type);
  const [showClasses, setShowClasses] = useState(
    classes.some((c) => c.cost !== ""),
  );
  const charges = type === "FLAT";

  return (
    <SectionCard title={method.name || "Shipping method"} action={remove}>
      <form action={action} className="space-y-6">
        <input type="hidden" name="id" value={method.id} />

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field
            label="Name"
            htmlFor={`name-${method.id}`}
            hint="Your customers will see the name of this shipping method during checkout."
          >
            <input
              id={`name-${method.id}`}
              name="name"
              defaultValue={method.name}
              required
              className={fieldInput}
            />
          </Field>

          <Field label="Type" htmlFor={`type-${method.id}`}>
            <select
              id={`type-${method.id}`}
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={fieldSelect}
            >
              <option value="FLAT">Flat rate</option>
              <option value="FREE">Free shipping</option>
              <option value="PICKUP">Local pickup</option>
            </select>
          </Field>

          <Field label="Tax status" htmlFor={`taxable-${method.id}`}>
            <select
              id={`taxable-${method.id}`}
              name="taxable"
              defaultValue={method.taxable ? "on" : ""}
              className={fieldSelect}
            >
              <option value="on">Taxable</option>
              <option value="">None</option>
            </select>
          </Field>

          <Field
            label="Note at checkout"
            htmlFor={`note-${method.id}`}
            hint="Optional, e.g. 2-4 business days."
          >
            <input
              id={`note-${method.id}`}
              name="note"
              defaultValue={method.note}
              className={fieldInput}
            />
          </Field>

          {charges ? (
            <>
              <Field
                label="Cost"
                htmlFor={`cost-${method.id}`}
                hint="Charged once per order, before any class costs."
              >
                <input
                  id={`cost-${method.id}`}
                  name="cost"
                  inputMode="decimal"
                  defaultValue={method.cost}
                  className={fieldInput}
                />
              </Field>
              <Field
                label="Free over"
                htmlFor={`freeOver-${method.id}`}
                hint="Leave empty to always charge."
              >
                <input
                  id={`freeOver-${method.id}`}
                  name="freeOver"
                  inputMode="decimal"
                  defaultValue={method.freeOver}
                  className={fieldInput}
                />
              </Field>
            </>
          ) : (
            /* Kept in the form so switching type back does not lose them. */
            <>
              <input type="hidden" name="cost" value={method.cost} />
              <input type="hidden" name="freeOver" value={method.freeOver} />
            </>
          )}

          <Field
            label="Minimum order"
            htmlFor={`minOrder-${method.id}`}
            hint="Not offered below this. Leave empty to always offer it."
          >
            <input
              id={`minOrder-${method.id}`}
              name="minOrder"
              inputMode="decimal"
              defaultValue={method.minOrder}
              className={fieldInput}
            />
          </Field>
        </div>

        {charges ? (
          <div>
            <button
              type="button"
              onClick={() => setShowClasses((v) => !v)}
              className="text-sm font-medium text-[var(--admin-accent)] hover:underline"
            >
              {showClasses ? "Hide shipping class costs" : "Add shipping class costs"}
            </button>

            {showClasses ? (
              classes.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  No shipping classes yet &mdash; add one below and it will
                  appear here.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
                  {classes.map((c) => (
                    <Field
                      key={c.id}
                      label={`${c.name} adds`}
                      htmlFor={`classCost-${method.id}-${c.id}`}
                      hint="Once per order, on top of the cost above."
                    >
                      <input
                        id={`classCost-${method.id}-${c.id}`}
                        name={`classCost_${c.id}`}
                        inputMode="decimal"
                        defaultValue={c.cost}
                        placeholder="0.00"
                        className={fieldInput}
                      />
                    </Field>
                  ))}
                </div>
              )
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={method.isActive}
              className="h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">Offer this at checkout</span>
          </label>
          <SubmitButton className={btnPrimary} pendingLabel="Saving…">
            Save method
          </SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}
