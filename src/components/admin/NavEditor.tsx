"use client";

import { useState } from "react";

export type NavRow = {
  id: string;
  label: string;
  url: string;
  depth: number;
  isActive: boolean;
  newTab: boolean;
};

/**
 * Menu editor.
 *
 * The menu is held as a flat ordered list with a depth per row rather than a
 * nested tree: dragging then only has to move one array element, and nesting is
 * a depth change on one row. Parent links are derived on save - a depth-1 row
 * belongs to the nearest depth-0 row above it - so the two can never disagree.
 *
 * Depth is capped at one level, which is all a header dropdown can show.
 */
export function NavEditor({
  initial,
  menu,
}: {
  initial: NavRow[];
  /**
   * Which page it sits on. The editor lives inside the Header or Footer
   * page's form, whose own Save button submits the menu with everything
   * else; this only changes how the hint describes nesting.
   */
  menu: "header" | "footer";
}) {
  const [rows, setRows] = useState<NavRow[]>(initial);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<NavRow>) =>
    setRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  /** A row may only be a child if there is a top-level row above it. */
  function canIndent(index: number): boolean {
    if (index === 0) return false;
    if (rows[index].depth === 1) return false;
    return rows[index - 1].depth === 0 || rows[index - 1].depth === 1;
  }

  function indent(index: number) {
    if (!canIndent(index)) return;
    setRows((r) => r.map((row, n) => (n === index ? { ...row, depth: 1 } : row)));
  }

  function outdent(index: number) {
    setRows((r) => r.map((row, n) => (n === index ? { ...row, depth: 0 } : row)));
  }

  function move(from: number, to: number) {
    if (from === to) return;
    setRows((r) => {
      const next = [...r];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      // A child can't lead the menu - it would have no parent to hang from.
      if (next[0]) next[0] = { ...next[0], depth: 0 };
      return next;
    });
  }

  function remove(index: number) {
    setRows((r) => {
      const next = r.filter((_, n) => n !== index);
      // Orphaned children are promoted rather than silently disappearing.
      return next.map((row, n) =>
        n === 0 || (row.depth === 1 && next[n - 1] === undefined)
          ? { ...row, depth: 0 }
          : row,
      );
    });
  }

  function addRow() {
    setRows((r) => [
      ...r,
      {
        id: `new-${Date.now()}-${r.length}`,
        label: "",
        url: "",
        depth: 0,
        isActive: true,
        newTab: false,
      },
    ]);
  }

  return (
    <div className="space-y-5">
      {/* The whole menu is submitted as one JSON field - the order is the
          data, so posting rows individually would lose it. */}
      <input type="hidden" name="tree" value={JSON.stringify(rows)} />

      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li
            key={row.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            style={{ marginLeft: row.depth * 32 }}
            className={`flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2.5 transition ${
              overIndex === i && dragIndex !== null && dragIndex !== i
                ? "border-[var(--admin-accent)] ring-2 ring-[var(--admin-accent)]/20"
                : "border-slate-200"
            } ${dragIndex === i ? "opacity-50" : ""}`}
          >
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

            <input
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label"
              aria-label="Menu label"
              // Blocks Save with a message rather than the row vanishing on save.
              required
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--admin-accent)]"
            />
            <input
              value={row.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="Link, e.g. /reviews"
              aria-label="Menu link"
              required
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-[var(--admin-accent)]"
            />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => outdent(i)}
                disabled={row.depth === 0}
                aria-label="Move out one level"
                title="Move out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => indent(i)}
                disabled={!canIndent(i)}
                aria-label="Nest under the item above"
                title="Nest under the item above"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              <label
                title="Visible on the storefront"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500"
              >
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(e) => update(i, { isActive: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--admin-accent)]"
                />
                Live
              </label>

              <label
                title="Open in a new tab"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-500"
              >
                <input
                  type="checkbox"
                  checked={row.newTab}
                  onChange={(e) => update(i, { newTab: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--admin-accent)]"
                />
                New tab
              </label>

              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${row.label || "item"}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No menu items yet. The storefront falls back to its built-in menu until
          you add some.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Add item
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Drag the handle to reorder. Use the arrows to nest an item under the one
        above it &mdash;{" "}
        {menu === "footer"
          ? "top-level items are the column headings and nested items are the links under them."
          : "nested items appear as a dropdown in the header."}{" "}
        Every item needs a label and a link. Links can be a page on this shop
        (&ldquo;/reviews&rdquo; or just &ldquo;reviews&rdquo;) or a full web address.
      </p>
    </div>
  );
}
