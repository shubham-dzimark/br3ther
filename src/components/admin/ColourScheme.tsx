"use client";

import { useState } from "react";

/**
 * The three admin colours plus the presets, in one place.
 *
 * Presets used to be a reference list you copied hex codes out of by hand.
 * Selecting one now sets all three pickers at once - it's still just the same
 * three form fields underneath, so the save action is unchanged.
 */

export type Swatch = {
  label: string;
  sidebar: string;
  accent: string;
  heading: string;
};

type Key = "sidebar" | "accent" | "heading";

export type ColourField = { key: Key; name: string; label: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ColourScheme({
  swatches,
  initial,
  fields,
}: {
  swatches: Swatch[];
  initial: { sidebar: string; accent: string; heading: string };
  /** Which three form fields this block writes to. */
  fields: ColourField[];
}) {
  const [colours, setColours] = useState(initial);

  const activePreset = swatches.find(
    (sw) =>
      same(sw.sidebar, colours.sidebar) &&
      same(sw.accent, colours.accent) &&
      same(sw.heading, colours.heading),
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.name} className="mb-1.5 block text-sm font-medium text-slate-700">
              {f.label}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={f.name}
                name={f.name}
                type="color"
                value={colours[f.key]}
                onChange={(e) =>
                  setColours((c) => ({ ...c, [f.key]: e.target.value }))
                }
                className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              <span className="font-mono text-xs uppercase text-slate-500">
                {colours[f.key]}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 mb-3 text-sm font-medium text-slate-700">Presets</p>

      <ul className="flex flex-wrap gap-3">
        {swatches.map((sw) => {
          const selected = activePreset?.label === sw.label;
          return (
            <li key={sw.label}>
              <button
                type="button"
                onClick={() =>
                  setColours({
                    sidebar: sw.sidebar,
                    accent: sw.accent,
                    heading: sw.heading,
                  })
                }
                aria-pressed={selected}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-[var(--admin-accent)] ring-2 ring-[var(--admin-accent)]/25"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="mb-2 flex gap-1.5">
                  <span className="h-6 w-6 rounded-md" style={{ background: sw.sidebar }} />
                  <span className="h-6 w-6 rounded-md" style={{ background: sw.accent }} />
                  <span className="h-6 w-6 rounded-md" style={{ background: sw.heading }} />
                </div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  {sw.label}
                  {selected ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3 w-3 text-[var(--admin-accent)]">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </p>
                <p className="mt-1 font-mono text-[10px] text-slate-400">
                  {sw.sidebar} · {sw.accent}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-slate-400">
        Choosing a preset fills all three pickers &mdash; adjust any of them
        afterwards. Only <code>#rgb</code> and <code>#rrggbb</code> values are
        accepted, so nothing else can be injected into the page styles.
      </p>
    </>
  );
}
