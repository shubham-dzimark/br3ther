"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCustomers, IconDashboard, IconLogout, IconSettings } from "./Icons";

/**
 * Account dropdown. Was a <details> element, which has no notion of an
 * outside click - it stayed open until you hit the summary again.
 */
export function ProfileMenu({
  user,
  initials,
  roleLabel,
  logoutAction,
}: {
  user: { name: string; email: string };
  initials: string;
  roleLabel: string;
  logoutAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-sidebar)] text-xs font-semibold text-[var(--on-colour)]">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-slate-900">
            {user.name}
          </span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg"
        >
          <Link href="/admin/profile" className={item} role="menuitem">
            <IconCustomers className="h-[17px] w-[17px] text-slate-400" />
            Profile
          </Link>
          <Link href="/admin/profile/security" className={item} role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[17px] w-[17px] text-slate-400">
              <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
            </svg>
            My security
          </Link>
          <Link href="/admin" className={item} role="menuitem">
            <IconDashboard className="h-[17px] w-[17px] text-slate-400" />
            Dashboard
          </Link>
          <Link href="/admin/settings" className={item} role="menuitem">
            <IconSettings className="h-[17px] w-[17px] text-slate-400" />
            Settings
          </Link>
          <div className="my-1.5 border-t border-slate-100" />
          <form action={logoutAction}>
            <button type="submit" className={`${item} w-full text-left`} role="menuitem">
              <IconLogout className="h-[17px] w-[17px] text-slate-400" />
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
