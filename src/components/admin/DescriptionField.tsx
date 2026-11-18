"use client";

import { useRef, useState } from "react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { SpecRow } from "@/lib/spec-table";

/**
 * A description that can be prose or a spec table.
 *
 * Both editors stay mounted and the inactive one is hidden rather than
 * unmounted. The product form posts every field at once, so an unrendered
 * input submits nothing - switching to Table and saving would otherwise wipe
 * the prose the shop spent an afternoon writing, with no way back.
 */
export function DescriptionField({
  name,
  label,
  initialHtml,
  initialRows,
  initialFormat,
  placeholder,
  minHeight = 200,
}: {
  /** Base field name: posts `${name}`, `${name}Format` and `${name}Table`. */
  name: string;
  label: string;
  initialHtml: string;
  initialRows: SpecRow[];
  initialFormat: "text" | "table";
  placeholder?: string;
  minHeight?: number;
}) {
  const [format, setFormat] = useState<"text" | "table">(initialFormat);
  /*
   * Rows carry an id that never goes to the server. Each row owns an editor
   * that keeps its own text, so React has to be told which row is which:
   * keyed by position, moving row 2 up would swap the labels and leave the
   * two editors where they were.
   */
  const [rows, setRows] = useState<(SpecRow & { id: string })[]>(() =>
    (initialRows.length ? initialRows : [{ label: "", value: "" }]).map((r, i) => ({
      ...r,
      id: `row-${i}`,
    })),
  );
  const nextId = useRef(rows.length);

  const update = (i: number, patch: Partial<SpecRow>) =>
    setRows((current) =>
      current.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );

  const move = (i: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      const target = i + by;
      if (target < 0 || target >= next.length) return current;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="ml-auto inline-flex rounded-full border border-slate-200 p-0.5">
          {(["text", "table"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                format === f
                  ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {f === "text" ? "Text" : "Table"}
            </button>
          ))}
        </div>
      </div>

      <input type="hidden" name={`${name}Format`} value={format} />
      {/* The rows travel as one JSON field, so adding or removing a row does
          not have to renumber a set of inputs. */}
      <input
        type="hidden"
        name={`${name}Table`}
        value={JSON.stringify(
          rows.filter((r) => r.label.trim() || r.value.trim()),
        )}
      />

      <div hidden={format !== "text"}>
        <RichTextEditor
          name={name}
          initialHtml={initialHtml}
          placeholder={placeholder}
          minHeight={minHeight}
        />
      </div>

      <div hidden={format !== "table"}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-3 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Title</span>
            <span>Description</span>
            <span className="w-16" />
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-start gap-3 px-4 py-3"
              >
                <input
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Material"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[var(--admin-accent)]"
                />
                {/* The same editor as every other field in the admin, with
                    the same toolbar - a cell is shown as HTML in the shop, so
                    whatever can be written elsewhere can be written here. */}
                <RichTextEditor
                  key={row.id}
                  initialHtml={row.value}
                  onChange={(html) => update(i, { value: html })}
                  placeholder="100% cotton, pre-shrunk"
                  minHeight={110}
                />
                <span className="flex w-16 shrink-0 items-center justify-end gap-1 pt-1.5">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move row up"
                    className="text-slate-300 transition hover:text-slate-700 disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                      <path d="m6 15 6-6 6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="Move row down"
                    className="text-slate-300 transition hover:text-slate-700 disabled:opacity-30"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((c) =>
                        c.length === 1
                          ? [{ label: "", value: "", id: `row-${nextId.current++}` }]
                          : c.filter((_, idx) => idx !== i),
                      )
                    }
                    aria-label="Remove row"
                    className="text-slate-300 transition hover:text-red-600"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-slate-100 px-4 py-3">
            <button
              type="button"
              onClick={() =>
                setRows((c) => [...c, { label: "", value: "", id: `row-${nextId.current++}` }])
              }
              className="rounded-full border border-[var(--admin-accent)] px-4 py-1.5 text-xs font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
            >
              Add row
            </button>
            <span className="ml-3 text-xs text-slate-400">
              {rows.filter((r) => r.label.trim() || r.value.trim()).length} row
              {rows.filter((r) => r.label.trim() || r.value.trim()).length === 1
                ? ""
                : "s"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
