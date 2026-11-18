"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PickerOption = {
  id: string;
  name: string;
  /** A short flag such as "Draft", shown on the chip and in the results. */
  note?: string | null;
};

/**
 * Searchable multi-select.
 *
 * Replaces a native multi-select, which needed ⌘-click and became unusable past
 * a few dozen products. Type to filter, click to add, chips show the current
 * set. Selections post as repeated hidden inputs, so the server action still
 * reads them with `formData.getAll(name)`.
 */
export function ProductPicker({
  name,
  options,
  defaultValue = [],
  minChars = 3,
  placeholder = "Type at least 3 letters to search…",
  formId,
  single = false,
}: {
  name: string;
  options: PickerOption[];
  defaultValue?: string[];
  minChars?: number;
  placeholder?: string;
  /** Join a form rendered elsewhere on the page. */
  formId?: string;
  /** Only one pick: choosing another replaces it. */
  single?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < minChars) return [];
    return options
      .filter((o) => !selected.includes(o.id) && o.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, options, selected, minChars]);

  // Close on outside click so the list can't hover over the rest of the form.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function add(id: string) {
    setSelected((s) => (s.includes(id) ? s : single ? [id] : [...s, id]));
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  return (
    <div ref={wrapRef} className="relative">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} form={formId} />
      ))}

      {selected.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {selected.map((id) => (
            <li key={id}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-accent)]/10 py-1.5 pl-3 pr-1.5 text-sm text-slate-800">
                {byId.get(id)?.name ?? "Unknown product"}
                {byId.get(id)?.note ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {byId.get(id)?.note}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected((s) => s.filter((x) => x !== id))}
                  aria-label={`Remove ${byId.get(id)?.name ?? "product"}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-red-600"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3 w-3">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {selected.some((id) => byId.get(id)?.note === "Draft") ? (
        /* A draft pick is saved but skipped in the shop - say so, rather than
           leave the admin wondering why fewer items show than were chosen. */
        <p className="-mt-1 mb-3 text-xs text-amber-700">
          Items marked Draft are saved here but not shown in the shop until they are published.
        </p>
      ) : null}

      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(matches.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && matches[highlight]) {
            // Enter would otherwise submit the whole product form.
            e.preventDefault();
            add(matches[highlight].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[var(--admin-accent)]"
      />

      {open && query.trim().length >= minChars ? (
        <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-slate-400">No matches.</li>
          ) : (
            matches.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => add(o.id)}
                  className={`block w-full px-4 py-2.5 text-left text-sm transition ${
                    i === highlight
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.name}
                  {o.note ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      {o.note}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
