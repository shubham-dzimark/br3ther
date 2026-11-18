"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { describeFeedback, stripFeedback, type Feedback } from "@/lib/admin-feedback";

type Toast = Feedback & { id: number };

const TONES = {
  ok: { ring: "border-emerald-200", dot: "bg-emerald-500", path: "M5 12.5l4.5 4.5L19 7.5" },
  warn: { ring: "border-amber-200", dot: "bg-amber-500", path: "M12 7v6M12 16.5v.5" },
  bad: { ring: "border-rose-200", dot: "bg-rose-500", path: "M8 8l8 8M16 8l-8 8" },
} as const;

/**
 * One toast for every admin screen, mounted in the admin layout.
 *
 * Each save redirects with a flag (?saved=1, ?deleted=1, ?error=…). The toast
 * announces it, then removes the flags from the address bar with
 * history.replaceState - no reload, the page's own message stays - so saving
 * again lands on a new URL and is announced again. Before this, a second save
 * redirected to the URL already open and the screen looked unchanged.
 */
export function ActionToast() {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [toast, setToast] = useState<Toast | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const feedback = describeFeedback(params);
    if (!feedback) return;

    setToast({ ...feedback, id: Date.now() });
    setShown(false);

    const rest = stripFeedback(params);
    window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }, [pathname, query]);

  useEffect(() => {
    if (!toast) return;
    const enter = requestAnimationFrame(() => setShown(true));
    const leave = setTimeout(() => setShown(false), toast.tone === "ok" ? 4000 : 7000);
    const clear = setTimeout(() => setToast(null), toast.tone === "ok" ? 4300 : 7300);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leave);
      clearTimeout(clear);
    };
  }, [toast]);

  const tone = toast ? TONES[toast.tone] : null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-20 z-50 flex justify-end md:right-6 print:hidden">
      {toast && tone ? (
        <div
          key={toast.id}
          role="status"
          className={`nl-action-toast pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border bg-white py-3 pl-3 pr-2 text-sm font-medium text-slate-800 shadow-lg shadow-slate-900/10 transition duration-300 ease-out ${tone.ring} ${
            shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--on-colour)] ${tone.dot}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d={tone.path} />
            </svg>
          </span>
          <span className="min-w-0">{toast.text}</span>
          <button
            type="button"
            onClick={() => setShown(false)}
            aria-label="Dismiss"
            className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
