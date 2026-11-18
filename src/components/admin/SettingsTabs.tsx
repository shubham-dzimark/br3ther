"use client";

import { useState } from "react";

export type SettingsTab = { id: string; label: string; content: React.ReactNode };

/**
 * Left-hand tabs for a long settings form.
 *
 * Every panel stays mounted and inactive ones are hidden, rather than being
 * conditionally rendered. That matters: this is one form that posts every
 * field at once, and an unrendered input submits nothing - so rendering only
 * the open tab would silently blank every setting on the tabs you had not
 * opened. Hiding keeps them in the form.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav
        aria-label="Settings sections"
        className="lg:sticky lg:top-24 lg:self-start"
      >
        <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActive(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-left text-sm transition ${
                    on
                      ? "bg-[var(--admin-btn)] font-medium text-[var(--admin-btn-ink)] shadow-sm"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        {tabs.map((t) => (
          <div key={t.id} hidden={t.id !== active}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
