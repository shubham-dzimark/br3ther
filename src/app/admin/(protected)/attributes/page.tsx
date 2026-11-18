import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput } from "@/components/admin/Field";
import { requireCapability } from "@/lib/permissions";
import { AttributeHeading, AttributeValueChip } from "./AttributeInlineEdit";
import {
  addAttributeValue,
  createAttribute,
  setAttributeDisplay,
  setAttributeValueSwatch,
} from "./actions";
import { ATTRIBUTE_DISPLAY_OPTIONS, displayOf } from "@/lib/attribute-display";
import {
  AttributeValueRows,
  NewAttributeFields,
  SwatchPreview,
} from "@/components/admin/AttributeValueEditor";
import { ValueSwatchForm } from "@/components/admin/ValueSwatchForm";

export const metadata: Metadata = { title: "Attributes" };
export const dynamic = "force-dynamic";

export default async function AttributesPage() {
  await requireCapability("catalog");
  const attributes = await prisma.attribute.findMany({
    orderBy: { name: "asc" },
    include: {
      values: { orderBy: { sortOrder: "asc" } },
      _count: { select: { values: true } },
    },
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Attributes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Attributes define what a product can vary by &mdash; Size, Colour,
            Volume. Add values here, then combine them into variants on a product.
          </p>
        </div>

        {attributes.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-sm text-slate-500">
              No attributes yet. Add one on the right to start building product
              variations.
            </p>
          </Card>
        ) : (
          attributes.map((attr) => (
            <Card key={attr.id} className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <AttributeHeading
                  id={attr.id}
                  name={attr.name}
                  slug={attr.slug}
                  valueCount={attr._count.values}
                />
              </div>

              {/* How shoppers see these values: label, colour circle or picture. */}
              <form action={setAttributeDisplay} className="mb-5 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={attr.id} />
                <label htmlFor={`display-${attr.id}`} className="text-xs font-medium text-slate-600">
                  Show as
                </label>
                <select
                  id={`display-${attr.id}`}
                  name="display"
                  defaultValue={attr.display}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                >
                  {ATTRIBUTE_DISPLAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  Apply
                </button>
              </form>

              {attr.values.length > 0 ? (
                /*
                 * Values sit in a wrapping row, not one per line - three sizes
                 * down the left of an empty card read as a list of problems
                 * rather than a set of three. Values that carry a swatch
                 * editor get a box of their own so the row stays readable.
                 */
                <ul className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {attr.values.map((v) => (
                    <li
                      key={v.id}
                      className={`flex items-center gap-2 ${
                        displayOf(attr.display) === "TEXT"
                          ? ""
                          : "rounded-2xl border border-slate-200 px-2.5 py-1.5"
                      }`}
                    >
                      {/* The swatch exactly as the shopper will see it. */}
                      <SwatchPreview display={attr.display} row={v} size={24} />

                      <AttributeValueChip id={v.id} value={v.value} />

                      {displayOf(attr.display) !== "TEXT" ? (
                        <ValueSwatchForm
                          action={setAttributeValueSwatch}
                          id={v.id}
                          display={displayOf(attr.display)}
                          colour={v.colour}
                          imageUrl={v.imageUrl}
                          icon={v.icon}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-slate-400">No values yet.</p>
              )}

              <form action={addAttributeValue} className="space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="attributeId" value={attr.id} />
                <AttributeValueRows
                  display={displayOf(attr.display)}
                  label={`Add ${attr.name.toLowerCase()} values`}
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-medium text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                  >
                    Add values
                  </button>
                </div>
              </form>
            </Card>
          ))
        )}
      </div>

      <Card className="h-fit p-6">
        <h2 className="mb-6 text-lg font-semibold text-slate-900">New attribute</h2>
        <form action={createAttribute} className="space-y-7">
          <Field label="Attribute name" htmlFor="attr-name">
            <input
              id="attr-name"
              name="name"
              required
              placeholder="Size, Colour, Volume"
              className={fieldInput}
            />
          </Field>
          <NewAttributeFields />
          <button type="submit" className={btnPrimary}>
            Create attribute
          </button>
        </form>
      </Card>
    </div>
  );
}
