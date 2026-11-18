"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useProductType } from "@/components/admin/ProductTypeFields";
import { fieldInput } from "@/components/admin/Field";
import { BACKORDER_OPTIONS, STOCK_STATUS_OPTIONS } from "@/lib/stock";
import {
  ATTRIBUTE_DISPLAY_OPTIONS,
  displayOf,
  type AttributeDisplay,
} from "@/lib/attribute-display";
import {
  AttributeValueRows,
  SwatchPreview,
  emptyRow,
  type ValueRow,
} from "@/components/admin/AttributeValueEditor";

export type AttributeOption = {
  id: string;
  name: string;
  /** Text, Colour or Image - how the shop shows these values. */
  display?: AttributeDisplay | string;
  values: {
    id: string;
    value: string;
    colour?: string | null;
    imageUrl?: string | null;
    icon?: string | null;
  }[];
};

type Row = {
  key: string;
  label: string;
  valueIds: string[];
  price: string;
  compareAt: string;
  stock: string;
  sku: string;
  /** Woo's per-variation inventory, set before the product exists. */
  manageStock: boolean;
  stockStatus: string;
  backorders: string;
  lowStock: string;
};

type Ctx = {
  attributes: AttributeOption[];
  setAttributes: (fn: (list: AttributeOption[]) => AttributeOption[]) => void;
  ticked: string[];
  setTicked: (fn: (list: string[]) => string[]) => void;
  /** The attributes on this product - the rest of the shop's are not shown. */
  used: string[];
  setUsed: (fn: (list: string[]) => string[]) => void;
  rows: Row[];
  setRows: (fn: (list: Row[]) => Row[]) => void;
};

/** Which attributes a set of ticked values belongs to. */
function attributesOf(attributes: AttributeOption[], valueIds: string[]): string[] {
  return attributes
    .filter((a) => a.values.some((v) => valueIds.includes(v.id)))
    .map((a) => a.id);
}

const AttrContext = createContext<Ctx | null>(null);

/**
 * Holds the attribute ticks and the built variation rows.
 *
 * They live in a provider because the picker and the builder sit in different
 * tabs of the Product data panel, and unmounting one must not lose the other's
 * work.
 */
export function AttributesProvider({
  attributes: initial,
  checkedIds = [],
  children,
}: {
  attributes: AttributeOption[];
  checkedIds?: string[];
  children: ReactNode;
}) {
  const [attributes, setAttributesState] = useState(initial);
  const [ticked, setTickedState] = useState<string[]>(checkedIds);
  const [used, setUsedState] = useState<string[]>(() => attributesOf(initial, checkedIds));
  const [rows, setRowsState] = useState<Row[]>([]);
  const value = useMemo<Ctx>(
    () => ({
      attributes,
      setAttributes: (fn) => setAttributesState((l) => fn(l)),
      ticked,
      setTicked: (fn) => setTickedState((l) => fn(l)),
      used,
      setUsed: (fn) => setUsedState((l) => fn(l)),
      rows,
      setRows: (fn) => setRowsState((l) => fn(l)),
    }),
    [attributes, ticked, used, rows],
  );
  return <AttrContext.Provider value={value}>{children}</AttrContext.Provider>;
}

/**
 * Attributes for the product, and - on a variable product being created - the
 * variations built from them.
 *
 * The variations are held in the browser and posted as JSON with the rest of
 * the form, so a new product can be given its options in one go. Building them
 * on the server would need the product to exist first, which is the two-step
 * dance this avoids.
 */
export function ProductAttributesField({
  attributes: initialAttributes = [],
  checkedIds = [],
  section = "both",
}: {
  attributes?: AttributeOption[];
  checkedIds?: string[];
  /** "picker" and "variations" render one half each, for the tabbed panel. */
  section?: "both" | "picker" | "variations";
}) {
  const type = useProductType();
  const shared = useContext(AttrContext);
  const [ownAttributes, setOwnAttributes] = useState<AttributeOption[]>(initialAttributes);
  const [ownTicked, setOwnTicked] = useState<string[]>(checkedIds);
  const [ownUsed, setOwnUsed] = useState<string[]>(() =>
    attributesOf(initialAttributes, checkedIds),
  );
  const [ownRows, setOwnRows] = useState<Row[]>([]);
  const attributes = shared ? shared.attributes : ownAttributes;
  const setAttributes = shared ? shared.setAttributes : setOwnAttributes;
  const ticked = shared ? shared.ticked : ownTicked;
  const setTicked = shared ? shared.setTicked : setOwnTicked;
  const used = shared ? shared.used : ownUsed;
  const setUsed = shared ? shared.setUsed : setOwnUsed;
  const rows = shared ? shared.rows : ownRows;
  const setRows = shared ? shared.setRows : setOwnRows;

  // Adding an attribute without leaving the page, so a half-built product survives.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState<AttributeDisplay>("TEXT");
  const [newRows, setNewRows] = useState<ValueRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const addAttribute = async () => {
    setSaving(true);
    setAddError("");
    try {
      const res = await fetch("/api/admin/attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          display: newDisplay,
          values: newRows.filter((r) => r.value.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(String(data.error ?? "That did not save."));
        return;
      }
      const created = data.attribute as AttributeOption;
      setAttributes((list) => [...list, created]);
      // It was created for this product, so attach it and tick what it has.
      setUsed((list) => [...list, created.id]);
      setTicked((list) => [...list, ...created.values.map((v) => v.id)]);
      setNewName("");
      setNewRows([emptyRow()]);
      setNewDisplay("TEXT");
      setAdding(false);
    } catch {
      setAddError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const labelFor = useMemo(() => {
    const map = new Map<string, { attribute: string; value: string }>();
    for (const a of attributes) {
      for (const v of a.values) map.set(v.id, { attribute: a.name, value: v.value });
    }
    return map;
  }, [attributes]);

  const toggle = (id: string) =>
    setTicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  /** The attributes on this product, and the ones it could still be given. */
  const mine = attributes.filter((a) => used.includes(a.id));
  const spare = attributes.filter((a) => !used.includes(a.id));
  const [toAttach, setToAttach] = useState("");
  /** Which built options are open for editing. */
  const [openRows, setOpenRows] = useState<string[]>([]);

  const attach = () => {
    const attr = attributes.find((a) => a.id === toAttach);
    if (!attr) return;
    setUsed((list) => (list.includes(attr.id) ? list : [...list, attr.id]));
    // Everything ticked to start with: it was added because it applies.
    setTicked((list) => [
      ...list,
      ...attr.values.map((v) => v.id).filter((id) => !list.includes(id)),
    ]);
    setToAttach("");
  };

  /*
   * Off this product, not out of the shop. The ticks go with it, which is what
   * tells the server to prune the options built from them, and any variation
   * rows waiting to be created lose their reference to it too.
   */
  const detach = (attr: AttributeOption) => {
    const ids = attr.values.map((v) => v.id);
    setUsed((list) => list.filter((id) => id !== attr.id));
    setTicked((list) => list.filter((id) => !ids.includes(id)));
    setRows((list) => list.filter((row) => !row.valueIds.some((id) => ids.includes(id))));
  };

    /** Values added to an attribute from here land in the shared list too. */
  const addValues = async (attributeId: string, rows: ValueRow[]) => {
    const res = await fetch("/api/admin/attributes/values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributeId, values: rows.filter((r) => r.value.trim()) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(String(data.error ?? "That did not save."));
    const added = (data.values ?? []) as AttributeOption["values"];
    setAttributes((list) =>
      list.map((a) =>
        a.id === attributeId
          ? {
              ...a,
              values: [
                ...a.values.filter((v) => !added.some((n) => n.id === v.id)),
                ...added,
              ],
            }
          : a,
      ),
    );
    // Tick what was just added - it was added because this product needs it.
    setTicked((list) => [...list, ...added.map((v) => v.id).filter((id) => !list.includes(id))]);
    setUsed((list) => (list.includes(attributeId) ? list : [...list, attributeId]));
  };

/** One row per combination of the ticked values, one value per attribute. */
  const build = () => {
    const groups = attributes
      .filter((a) => used.includes(a.id))
      .map((a) => a.values.filter((v) => ticked.includes(v.id)))
      .filter((g) => g.length > 0);
    if (groups.length === 0) return;

    let combos: { id: string; value: string }[][] = [[]];
    for (const group of groups) {
      combos = combos.flatMap((c) => group.map((v) => [...c, v]));
    }
    if (combos.length > 100) return;

    setRows((existing) =>
      combos.map((combo) => {
        const key = combo.map((c) => c.id).sort().join("|");
        const already = existing.find((r) => r.key === key);
        return (
          already ?? {
            key,
            label: combo.map((c) => c.value).join(" / "),
            valueIds: combo.map((c) => c.id),
            price: "",
            compareAt: "",
            stock: "0",
            sku: "",
            manageStock: false,
            stockStatus: "IN_STOCK",
            backorders: "NO",
            lowStock: "",
          }
        );
      }),
    );
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const isVariable = type === "VARIABLE";

  const showPicker = section !== "variations";
  const showVariations = section !== "picker" && isVariable;

  return (
    <div className="space-y-5">
      {showPicker ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Attributes</p>
          <p className="mt-1 text-xs text-slate-500">
            Only the attributes this product comes in.
            {isVariable ? " Its options are built from them below." : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
           * Attach one the shop already has, rather than listing every
           * attribute in the shop against every product - a product that does
           * not come in sizes should not have a Size row at all.
           */}
          {spare.length > 0 ? (
            <>
              <select
                value={toAttach}
                onChange={(e) => setToAttach(e.target.value)}
                aria-label="Add an existing attribute"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                <option value="">Add existing&hellip;</option>
                {spare.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={attach}
                disabled={!toAttach}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)] disabled:opacity-40"
              >
                Add
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            {adding ? "Close" : "New attribute"}
          </button>
        </div>
      </div>

      ) : null}

      {showPicker && adding ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name, e.g. Colour"
              aria-label="New attribute name"
              className={fieldInput}
            />
            <select
              value={newDisplay}
              onChange={(e) => setNewDisplay(e.target.value as AttributeDisplay)}
              aria-label="Show values as"
              className={fieldInput}
            >
              {ATTRIBUTE_DISPLAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Show as {o.label.toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {/* The same colour picker, upload and icon library as the
              Categories & attributes screen - no typed shorthand. */}
          <AttributeValueRows
            display={newDisplay}
            name=""
            rows={newRows}
            onRowsChange={setNewRows}
          />
          {addError ? <p className="text-xs text-red-600">{addError}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addAttribute}
              disabled={saving || !newName.trim() || newRows.every((r) => !r.value.trim())}
              className="rounded-full bg-[var(--admin-btn)] px-5 py-2 text-sm font-semibold text-[var(--admin-btn-ink)] disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save attribute"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            It is added to the shop&rsquo;s attributes, so other products can use
            it too.
          </p>
        </div>
      ) : null}

      {!showPicker ? null : mine.length === 0 ? (
        <p className="text-sm text-slate-500">
          No attributes on this product yet &mdash; add one the shop already has,
          or make a <strong>New attribute</strong>.
        </p>
      ) : (
        mine.map((attr) => (
          <div key={attr.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                {attr.name}
                {displayOf(attr.display) !== "TEXT" ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    shown as {displayOf(attr.display).toLowerCase()}
                  </span>
                ) : null}
              </p>
              {/* Removes it from this product only - the shop keeps it. */}
              <button
                type="button"
                onClick={() => detach(attr)}
                className="text-xs font-medium text-slate-400 transition hover:text-red-600"
              >
                Remove from this product
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {attr.values.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-[var(--admin-accent)]"
                >
                  <input
                    type="checkbox"
                    name="attributeValueIds"
                    value={v.id}
                    checked={ticked.includes(v.id)}
                    onChange={() => toggle(v.id)}
                    className="h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  <SwatchPreview display={attr.display} row={v} size={18} />
                  {v.value}
                </label>
              ))}
            </div>

            {/* A missing size or flavour can be added right here. */}
            <AddValuesInline
              attribute={attr}
              onSave={(rows) => addValues(attr.id, rows)}
            />
          </div>
        ))
      )}

      {showVariations ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">
              Variations
              <span className="ml-2 text-xs font-normal text-slate-500">
                {rows.length > 0 ? `${rows.length} option${rows.length === 1 ? "" : "s"}` : "none yet"}
              </span>
            </p>
            <button
              type="button"
              onClick={build}
              disabled={ticked.length === 0}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)] disabled:opacity-40"
            >
              Build from ticked attributes
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              Tick the values above, then build the options. Each one gets its own
              price and stock, and they are created with the product &mdash; no
              need to save first.
            </p>
          ) : (
            <div className="space-y-3">
              {/*
                One line per option with the rest behind Edit, and one tracking
                decision for the whole product - the same shape as a saved
                product's options table, so the two screens do not teach two
                different layouts.
              */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={rows.every((r) => r.manageStock)}
                    onChange={(e) =>
                      setRows((list) => list.map((r) => ({ ...r, manageStock: e.target.checked })))
                    }
                    className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  <span className="text-sm text-slate-700">
                    Track quantity for every option
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Off means every option is always in stock. On adds a
                      quantity, backorder rule and low-stock threshold, under
                      Edit.
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setOpenRows((list) =>
                      list.length === rows.length ? [] : rows.map((r) => r.key),
                    )
                  }
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  {openRows.length === rows.length ? "Collapse all" : "Expand all"}
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {rows.map((r) => {
                  const expanded = openRows.includes(r.key);
                  return (
                    <div key={r.key} className="border-b border-slate-100 last:border-0">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        {/* At least 10rem, so on a narrow screen the name takes its
                            own line instead of being squeezed to "…". */}
                        <p className="min-w-[10rem] flex-1 break-words text-sm font-medium text-slate-700">
                          {r.label}
                        </p>
                        <input
                          value={r.price}
                          onChange={(e) => update(r.key, { price: e.target.value })}
                          placeholder="Price"
                          aria-label={`Price for ${r.label}`}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[var(--admin-accent)]"
                        />
                        {/* Beside the price: the two are one decision, and a
                            sale set out of sight of the price gets forgotten. */}
                        <input
                          value={r.compareAt}
                          onChange={(e) => update(r.key, { compareAt: e.target.value })}
                          placeholder="Compare at"
                          aria-label={`Compare at for ${r.label}`}
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[var(--admin-accent)]"
                        />
                        <select
                          value={r.stockStatus}
                          onChange={(e) => update(r.key, { stockStatus: e.target.value })}
                          aria-label={`Stock status for ${r.label}`}
                          className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-[var(--admin-accent)]"
                        >
                          {STOCK_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenRows((list) =>
                              list.includes(r.key)
                                ? list.filter((k) => k !== r.key)
                                : [...list, r.key],
                            )
                          }
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
                        <button
                          type="button"
                          onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                          aria-label={`Remove ${r.label}`}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          &times;
                        </button>
                      </div>

                      {expanded ? (
                        <div className="grid grid-cols-1 gap-3 bg-slate-50/60 px-3 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="text-xs text-slate-600">
                            SKU
                            <input
                              value={r.sku}
                              onChange={(e) => update(r.key, { sku: e.target.value })}
                              placeholder="auto"
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--admin-accent)]"
                            />
                          </label>
                          {r.manageStock ? (
                            <>
                              <label className="text-xs text-slate-600">
                                Quantity
                                <input
                                  value={r.stock}
                                  onChange={(e) => update(r.key, { stock: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                                />
                              </label>
                              <label className="text-xs text-slate-600">
                                Allow backorders
                                <select
                                  value={r.backorders}
                                  onChange={(e) => update(r.key, { backorders: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                                >
                                  {BACKORDER_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-slate-600">
                                Low stock at
                                <input
                                  value={r.lowStock}
                                  onChange={(e) => update(r.key, { lowStock: e.target.value })}
                                  placeholder="none"
                                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                Leave a price blank and that option is skipped. SKUs are generated
                when left empty.
              </p>
            </div>
          )}

          {/* Posted with the form; the server turns it into the product's options. */}
          <input type="hidden" name="variations" value={JSON.stringify(rows)} />
        </div>
      ) : null}
    </div>
  );
}

/** "Add value" for one attribute, with that attribute's own swatch control. */
function AddValuesInline({
  attribute,
  onSave,
}: {
  attribute: AttributeOption;
  onSave: (rows: ValueRow[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ValueRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(rows);
      setRows([emptyRow()]);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-[var(--admin-accent)] hover:underline"
      >
        {open ? "Cancel" : `+ Add ${attribute.name.toLowerCase()} value`}
      </button>
      {open ? (
        <div className="mt-2 space-y-3 rounded-2xl border border-slate-200 p-3">
          <AttributeValueRows
            display={displayOf(attribute.display)}
            name=""
            rows={rows}
            onRowsChange={setRows}
            label={`New ${attribute.name.toLowerCase()} values`}
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving || rows.every((r) => !r.value.trim())}
              className="rounded-full bg-[var(--admin-btn)] px-4 py-2 text-xs font-semibold text-[var(--admin-btn-ink)] disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save values"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
