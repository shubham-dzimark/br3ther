"use client";

import { useState } from "react";
import { ADMIN_SCHEME_COOKIE, type AdminSchemePref } from "@/lib/admin-scheme";

const OPTIONS: { value: AdminSchemePref; label: string; Icon: () => React.ReactElement }[] = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "auto", label: "Match system", Icon: IconAuto },
];

/**
 * Light / dark / auto for this browser. Applies instantly by updating the
 * admin root's attributes, and stores the choice in a cookie for the next
 * server render. A year, path-wide, readable by the server only as a hint.
 */
export function SchemeToggle({ initial }: { initial: AdminSchemePref }) {
  const [pref, setPref] = useState<AdminSchemePref>(initial);

  function choose(next: AdminSchemePref) {
    setPref(next);
    document.cookie = `${ADMIN_SCHEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const root = document.querySelector<HTMLElement>("[data-admin]");
    if (!root) return;
    root.setAttribute("data-scheme-pref", next);
    const dark =
      next === "dark" ||
      (next === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-scheme", dark ? "dark" : "light");
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour scheme"
      className="hidden h-9 items-center rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] p-0.5 sm:inline-flex"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`adm-focus inline-flex h-full w-8 items-center justify-center rounded-[3px] transition-colors ${
              on
                ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                : "text-slate-500 hover:bg-[var(--admin-inset)] hover:text-slate-900"
            }`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function IconAuto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
      <path d="M12 7.5v6.5a3.25 3.25 0 0 0 0-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
