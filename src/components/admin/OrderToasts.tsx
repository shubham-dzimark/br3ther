"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell } from "./Icons";
import { ORDER_TYPES as ORDER_TYPE_LIST } from "@/lib/notification-types";

/*
 * A new order, announced while you are working.
 *
 * It listens to the same stream the bell does rather than opening a second
 * one: the server already pushes the newest notification there every few
 * seconds, so this costs nothing extra and the two can never disagree about
 * what arrived.
 *
 * Orders only. A review or a newsletter signup is worth a badge on the bell,
 * not a card sliding over whatever you were reading.
 */

type Notice = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
};

/** What counts as an order for this toast. */
const ORDER_TYPES = new Set<string>(ORDER_TYPE_LIST);

const SHOW_MS = 12_000;
const MAX_VISIBLE = 3;
/** Remembers what has been announced, so a reload does not re-announce it. */
const SEEN_KEY = "nl_admin_toasted";

export function OrderToasts() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const seen = useRef<Set<string>>(new Set());
  /*
   * The bell rings from here, not from the bell icon.
   *
   * Both listen to the same endpoint but over their own connection, and the
   * server ticks each one on its own five-second cycle - so the card and the
   * sound could land several seconds apart. Raising them from the same event
   * is the only way they arrive together.
   *
   * The file is loaded on mount rather than at the first order, so the sound
   * is not waiting on a download at the moment it should play.
   */
  const bell = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      if (raw) for (const id of JSON.parse(raw) as string[]) seen.current.add(id);
    } catch {
      // A private window with no storage still works, it just re-announces
      // after a reload.
    }
  }, []);

  const remember = useCallback((id: string) => {
    seen.current.add(id);
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen.current].slice(-50)));
    } catch {
      // See above.
    }
  }, []);

  useEffect(() => {
    try {
      const audio = new Audio("/sounds/new-order.m4a");
      audio.preload = "auto";
      audio.volume = 0.7;
      audio.load();
      bell.current = audio;
    } catch {
      // No audio device, or a browser that will not build one - the card
      // still appears.
    }
  }, []);

  const ring = useCallback(() => {
    let wanted = true;
    try {
      wanted = window.localStorage.getItem("nl_notify_sound") !== "off";
    } catch {
      // Blocked storage keeps the default.
    }
    if (!wanted || !bell.current) return;
    try {
      bell.current.currentTime = 0;
      void bell.current.play().catch(() => undefined);
    } catch {
      // Autoplay policy - the card is still there to be seen.
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/notifications/stream?kind=system");

    const onUpdate = (event: MessageEvent) => {
      let payload: { latest?: Notice | null; isInitial?: boolean };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const latest = payload.latest;
      // The first message is the stream syncing state, not news.
      if (!latest || payload.isInitial) {
        if (latest) remember(latest.id);
        return;
      }
      if (!ORDER_TYPES.has(latest.type)) return;
      if (seen.current.has(latest.id)) return;
      remember(latest.id);
      // Sound and card from the same event, so they arrive together.
      ring();
      setItems((current) => [latest, ...current].slice(0, MAX_VISIBLE));
    };

    source.addEventListener("update", onUpdate as EventListener);
    return () => {
      source.removeEventListener("update", onUpdate as EventListener);
      source.close();
    };
  }, [remember, ring]);

  // Each card clears itself; hovering does not pause it, because the bell keeps
  // the notification either way.
  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((n) => setTimeout(() => dismiss(n.id), SHOW_MS));
    return () => timers.forEach(clearTimeout);
  }, [items, dismiss]);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2.5"
    >
      {items.map((n) => (
        <div
          key={n.id}
          role="status"
          className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-start gap-3 border-l-4 border-l-[var(--admin-accent)] px-4 py-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-accent)]/10 text-[var(--admin-accent)]">
              <IconBell className="h-[18px] w-[18px]" />
            </span>

            <button
              type="button"
              onClick={() => {
                dismiss(n.id);
                if (n.href) router.push(n.href);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-semibold text-slate-900">
                {n.title}
              </span>
              {n.body ? (
                <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>
              ) : null}
              {n.href ? (
                <span className="mt-1.5 block text-xs font-semibold text-[var(--admin-accent)]">
                  View order →
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
