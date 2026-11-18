"use client";

import { useMemo, useState } from "react";
import Image from "@/components/Image";
import Link from "next/link";
import { BulkCheckbox, BulkMaster } from "@/components/admin/BulkBar";
import { IconTrash } from "@/components/admin/Icons";
import {
  buildTree,
  canDrop,
  flatten,
  groupOf,
  moveTo,
  siblingsOf,
  step,
  type Tree,
} from "@/lib/category-tree-order";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  imageSrc: string | null;
  productCount: number;
  /** Null for a top-level category - and for an orphan whose parent is gone. */
  parentId: string | null;
};

/**
 * The Categories list, in the order the storefront shows them, arranged by
 * dragging.
 *
 * The tree stays intact while it moves: a top-level category carries its
 * sub-categories with it, and a sub-category only moves among its siblings -
 * dropping one under a different parent would be a change of parent, which is
 * what the edit form is for.
 *
 * Dragging does not work on a phone or tablet, so each row also has up and
 * down arrows. They are the keyboard route as well.
 *
 * The whole order posts as one hidden JSON field, like the menu editor: the
 * order is the data, so rows cannot be sent one by one.
 */
export function CategoryTable({
  rows,
  editingId,
  deleteAction,
  saveOrderAction,
}: {
  rows: CategoryRow[];
  editingId: string | null;
  deleteAction: (fd: FormData) => void | Promise<void>;
  saveOrderAction: (fd: FormData) => void | Promise<void>;
}) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const initial = useMemo(() => buildTree(rows), [rows]);

  const [tree, setTree] = useState<Tree>(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // The rules live in lib/category-tree-order.ts, where they are tested.
  const flat = flatten(tree);
  const initialFlat = flatten(initial);
  const changed = flat.some((id, i) => id !== initialFlat[i]);

  const arrow =
    "flex h-8 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent";

  return (
    <>
      <form
        id="category-order"
        action={saveOrderAction}
        className={`mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs ${
          changed ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500"
        }`}
      >
        <input type="hidden" name="order" value={JSON.stringify(flat)} />
        <span aria-live="polite">
          {changed
            ? "Order changed - save it to show it on the storefront."
            : "Drag a category by its handle, or use the arrows. The storefront shows categories in this order."}
        </span>
        <button
          type="submit"
          disabled={!changed}
          className="rounded-full bg-[var(--admin-btn)] px-4 py-1.5 text-xs font-semibold text-[var(--admin-btn-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save order
        </button>
      </form>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="w-8 py-3.5 pl-3 lg:pl-5" aria-label="Reorder" />
              <th className="w-10 px-3 py-3.5 text-left lg:px-5">
                <BulkMaster formId="bulk-categories" label="Select all categories" />
              </th>
              {["Image", "Name", "Slug", "Products", "Action"].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:px-5 ${
                    h === "Action" ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flat.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              const depth = groupOf(byId, c) === null ? 0 : 1;
              const siblings = siblingsOf(tree, byId, id);
              const at = siblings.indexOf(id);
              const target = over === id && drag !== null && canDrop(byId, drag, id);

              return (
                <tr
                  key={id}
                  draggable
                  onDragStart={(e) => {
                    setDrag(id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    if (drag && canDrop(byId, drag, id)) {
                      e.preventDefault();
                      setOver(id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag) setTree((t) => moveTo(t, byId, drag, id));
                    setDrag(null);
                    setOver(null);
                  }}
                  className={`transition ${
                    target
                      ? "bg-[var(--admin-accent)]/10 outline outline-2 -outline-offset-2 outline-[var(--admin-accent)]"
                      : editingId === id
                        ? "bg-[#E2EEEA]/40"
                        : "hover:bg-slate-50/60"
                  } ${drag === id ? "opacity-50" : ""}`}
                >
                  <td className="py-3 pl-3 lg:pl-5">
                    <span
                      aria-hidden="true"
                      title="Drag to reorder"
                      className="flex h-8 w-6 cursor-grab items-center justify-center text-slate-300 active:cursor-grabbing"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <circle cx="9" cy="6" r="1.6" />
                        <circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" />
                        <circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" />
                        <circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </span>
                  </td>
                  <td className="px-3 py-3 lg:px-5">
                    <BulkCheckbox formId="bulk-categories" id={c.id} label={c.name} />
                  </td>
                  <td className="py-3 pr-2" style={{ paddingLeft: depth ? 24 : 0 }}>
                    <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {c.imageSrc ? (
                        <Image src={c.imageSrc} alt="" fill sizes="44px" className="object-cover" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-5 w-5 text-slate-300">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm font-medium text-slate-900 lg:px-5">
                    {depth > 0 ? (
                      <span aria-hidden="true" className="mr-1.5 text-slate-300">
                        &#9492;
                      </span>
                    ) : null}
                    {c.name}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate-400 lg:px-5">/{c.slug}</td>
                  <td className="px-3 py-4 text-sm text-slate-600 lg:px-5">{c.productCount}</td>
                  <td className="px-3 py-4 lg:px-5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        className={arrow}
                        onClick={() => setTree((t) => step(t, byId, id, -1))}
                        disabled={at <= 0}
                        aria-label={`Move ${c.name} up`}
                        title="Move up"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 19V5M6 11l6-6 6 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={arrow}
                        onClick={() => setTree((t) => step(t, byId, id, 1))}
                        disabled={at < 0 || at >= siblings.length - 1}
                        aria-label={`Move ${c.name} down`}
                        title="Move down"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 5v14M6 13l6 6 6-6" />
                        </svg>
                      </button>
                      <Link
                        href={`/admin/categories?edit=${c.id}`}
                        className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                      >
                        Edit
                      </Link>
                      <form action={deleteAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          aria-label={`Delete ${c.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <IconTrash className="h-[17px] w-[17px]" />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
