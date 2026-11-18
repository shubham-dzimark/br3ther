"use client";

import { useEffect, useState } from "react";

export type BulkAction = {
  label: string;
  /** Server action run on the ticked rows. */
  action?: (fd: FormData) => void | Promise<void>;
  /**
   * Instead of an action, open this URL in a new tab with the ticked ids
   * appended as `ids=a,b,c` - for things like printing, which happen in the
   * browser rather than on the server.
   */
  open?: string;
  /** Styles the button as destructive and asks before running. */
  danger?: boolean;
  /** Extra confirmation text; defaults to a generic one for danger actions. */
  confirm?: string;
};

/**
 * Selection toolbar for an admin table.
 *
 * The table itself is the form: rows carry `<input name="ids">` checkboxes and
 * this bar submits them. It watches the real DOM rather than holding its own
 * copy of the selection, so the count can never drift from what is ticked -
 * including after a filter or page change re-renders the rows.
 */
export function BulkBar({
  formId,
  actions,
  noun = "item",
}: {
  formId: string;
  actions: BulkAction[];
  noun?: string;
}) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    /*
     * A form cannot wrap table rows, so the checkboxes live in the table and
     * are tied to it with the `form` attribute. They are therefore not DOM
     * descendants - `form.elements` is what reflects form-associated controls
     * wherever they sit, so querySelectorAll on the form would find nothing.
     */
    const boxes = () =>
      Array.from(form.elements).filter(
        (el): el is HTMLInputElement =>
          el instanceof HTMLInputElement && el.name === "ids",
      );

    const sync = () => {
      const all = boxes();
      setTotal(all.length);
      setCount(all.filter((b) => b.checked).length);

      // Keep the header "select all" box in step, including its mixed state.
      const master = Array.from(form.elements).find(
        (el): el is HTMLInputElement =>
          el instanceof HTMLInputElement && el.dataset.bulkMaster !== undefined,
      );
      if (master) {
        const checked = all.filter((b) => b.checked).length;
        master.checked = all.length > 0 && checked === all.length;
        master.indeterminate = checked > 0 && checked < all.length;
      }
    };

    const onChange = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (el.dataset.bulkMaster !== undefined) {
        for (const b of boxes()) b.checked = el.checked;
      }
      if (el.name === "ids" || el.dataset.bulkMaster !== undefined) sync();
    };

    document.addEventListener("change", onChange);
    sync();
    return () => document.removeEventListener("change", onChange);
  }, [formId]);

  if (count === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-accent)]/25 bg-[var(--admin-accent)]/5 px-4 py-3">
      <p className="text-sm font-medium text-slate-800">
        {count} of {total} {noun}
        {count === 1 ? "" : "s"} selected
      </p>

      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((a) =>
          a.open ? (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                const form = document.getElementById(formId);
                if (!(form instanceof HTMLFormElement)) return;
                const ids = Array.from(form.elements)
                  .filter(
                    (el): el is HTMLInputElement =>
                      el instanceof HTMLInputElement && el.name === "ids" && el.checked,
                  )
                  .map((b) => b.value);
                if (!ids.length) return;
                const sep = a.open!.includes("?") ? "&" : "?";
                window.open(
                  `${a.open}${sep}ids=${encodeURIComponent(ids.join(","))}`,
                  "_blank",
                  "noopener",
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              {a.label}
            </button>
          ) : (
          <button
            key={a.label}
            type="submit"
            form={formId}
            formAction={a.action}
            onClick={(e) => {
              if (!a.danger && !a.confirm) return;
              const message =
                a.confirm ??
                `${a.label} ${count} ${noun}${count === 1 ? "" : "s"}? This cannot be undone.`;
              if (!window.confirm(message)) e.preventDefault();
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              a.danger
                ? "border border-red-200 text-red-600 hover:bg-red-50"
                : "border border-slate-200 text-slate-700 hover:bg-white"
            }`}
          >
            {a.label}
          </button>
          ),
        )}
      </div>
    </div>
  );
}

/** Header checkbox that ticks or clears every row. */
export function BulkMaster({
  formId,
  label = "Select all",
}: {
  formId: string;
  label?: string;
}) {
  return (
    <input
      type="checkbox"
      form={formId}
      data-bulk-master=""
      aria-label={label}
      className="h-4 w-4 accent-[var(--admin-accent)]"
    />
  );
}

/** Per-row checkbox. */
export function BulkCheckbox({
  id,
  label,
  formId,
}: {
  id: string;
  label: string;
  formId: string;
}) {
  return (
    <input
      type="checkbox"
      form={formId}
      name="ids"
      value={id}
      aria-label={`Select ${label}`}
      className="h-4 w-4 accent-[var(--admin-accent)]"
    />
  );
}
