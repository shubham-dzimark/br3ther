"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the support screens current without a reload.
 *
 * The inbox is a server component, so new messages only appeared on a manual
 * refresh - the bell would ring and the thread would still look empty. This
 * polls a signature endpoint and calls router.refresh() when it moves, which
 * re-renders the server component in place and leaves any half-typed reply
 * in the textarea alone.
 *
 * Polling rather than a socket, for the same reasons the customer widget
 * does: it survives the Apache reverse proxy with no extra configuration and
 * a support thread is low-traffic.
 */
export function ChatAutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const sigRef = useRef<string | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch("/api/admin/support/pulse", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig: string };
        if (stopped) return;
        // The first reading is just a baseline - refreshing on it would
        // reload the page the moment it opened.
        if (sigRef.current !== null && sig !== sigRef.current) router.refresh();
        sigRef.current = sig;
      } catch {
        // A dropped poll is not worth surfacing; the next tick retries.
      }
    }

    void tick();
    const timer = window.setInterval(() => {
      // A backgrounded tab does not need to keep pulling; it catches up when
      // it comes forward.
      if (!document.hidden) void tick();
    }, intervalMs);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [router, intervalMs, live]);

  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <input
        type="checkbox"
        checked={live}
        onChange={(e) => setLive(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
      />
      Live
    </label>
  );
}
