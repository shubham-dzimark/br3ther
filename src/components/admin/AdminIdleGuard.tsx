"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { btnGhost, btnPrimary } from "@/components/admin/ui";

/** Real use is reported at most this often, so typing is not a request per key. */
const PING_EVERY_MS = 30_000;
const TICK_MS = 1_000;
/** While the warning is up, re-check the server this often in case another tab is in use. */
const RESYNC_MS = 20_000;

type Status = { signedIn: boolean; remainingMs?: number };

/**
 * Signs the admin out after a stretch of no use, with a warning first.
 *
 * The server is the authority: it deletes a session whose last reported use
 * is older than the idle limit, whatever this component does. This only
 * reports real use (pointer, key, scroll, touch) and shows the countdown, so
 * a person is warned before the session goes rather than finding out on
 * their next click. Background refreshes never count as use.
 */
export function AdminIdleGuard({ idleMinutes }: { idleMinutes: number }) {
  const idleMs = idleMinutes * 60_000;
  const warnMs = Math.min(2 * 60_000, Math.floor(idleMs / 3));

  // Set on mount; render must not read the clock.
  const deadline = useRef(0);
  const lastPing = useRef(0);
  const lastSync = useRef(0);
  const warning = useRef(false);
  const busy = useRef(false);
  const done = useRef(false);
  const [left, setLeft] = useState<number | null>(null);

  const leave = useCallback(async (signOut: boolean, reason: "idle" | null) => {
    if (done.current) return;
    done.current = true;
    if (signOut) {
      await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    }
    window.location.assign(reason ? `/admin/login?error=${reason}` : "/admin/login");
  }, []);

  const call = useCallback(
    async (method: "GET" | "POST"): Promise<void> => {
      try {
        const res = await fetch("/api/admin/session", { method, cache: "no-store" });
        if (res.status === 401) {
          await leave(false, "idle");
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as Status;
        if (typeof body.remainingMs === "number") {
          deadline.current = Date.now() + body.remainingMs;
        }
        lastSync.current = Date.now();
      } catch {
        // Offline for a moment: keep the local clock and try again later.
      }
    },
    [leave],
  );

  const stay = useCallback(async () => {
    warning.current = false;
    setLeft(null);
    lastPing.current = Date.now();
    await call("POST");
  }, [call]);

  useEffect(() => {
    deadline.current = Date.now() + idleMs;
    // Opening a page is not use, but it does tell us where the clock stands.
    void call("GET");

    const onUse = () => {
      // Once the warning is up, only the button keeps the session.
      if (warning.current || done.current) return;
      const now = Date.now();
      if (now - lastPing.current < PING_EVERY_MS) return;
      lastPing.current = now;
      void call("POST");
    };

    const events = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onUse, { passive: true, capture: true });

    const tick = async () => {
      if (busy.current || done.current) return;
      busy.current = true;
      try {
        let remaining = deadline.current - Date.now();

        // Before warning or signing out, ask the server: another tab may be in use.
        const due = remaining <= warnMs && (!warning.current || Date.now() - lastSync.current > RESYNC_MS);
        if (due || remaining <= 0) {
          await call("GET");
          if (done.current) return;
          remaining = deadline.current - Date.now();
        }

        if (remaining <= 0) {
          await leave(true, "idle");
        } else if (remaining <= warnMs) {
          warning.current = true;
          setLeft(remaining);
        } else if (warning.current) {
          warning.current = false;
          setLeft(null);
        }
      } finally {
        busy.current = false;
      }
    };
    const timer = window.setInterval(() => void tick(), TICK_MS);
    // A tab coming back from the background catches up straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      for (const e of events) window.removeEventListener(e, onUse, { capture: true });
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [call, leave, warnMs, idleMs]);

  if (left === null) return null;

  const secs = Math.max(0, Math.ceil(left / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/60" aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
        className="fixed left-1/2 top-1/2 z-[91] w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="idle-title" className="text-base font-semibold text-slate-900">
          Are you still there?
        </h2>
        <p id="idle-body" className="mt-2 text-sm leading-relaxed text-slate-600">
          The admin hasn&rsquo;t been used for a while. For security you&rsquo;ll be signed
          out in{" "}
          <span className="font-semibold tabular-nums text-slate-900" aria-live="polite">
            {clock}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => void leave(true, null)}
            className={btnGhost}
          >
            Sign out now
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void stay()}
            className={btnPrimary}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </>
  );
}
