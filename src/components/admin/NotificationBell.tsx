"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBell, IconChat } from "./Icons";
import { ORDER_TYPES } from "@/lib/notification-types";

export type AdminNotice = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * Live admin bell.
 *
 * Two delivery paths, because they cover different situations:
 *  - an SSE stream keeps the badge and list current while the admin is open;
 *  - Web Push reaches the browser when it isn't.
 *
 * The stream is the source of truth for the badge; push is best-effort.
 */
export function NotificationBell({
  initialUnread,
  initialItems,
  pushEnabled,
  vapidKey,
  kind = "system",
}: {
  initialUnread: number;
  initialItems: AdminNotice[];
  pushEnabled: boolean;
  vapidKey: string;
  /**
   * Which menu this is. Chat messages and system alerts are separate counts
   * on separate icons, so every request this component makes is scoped by it.
   */
  kind?: "system" | "chat";
}) {
  const isChat = kind === "chat";
  const Icon = isChat ? IconChat : IconBell;
  const menuTitle = isChat ? "Messages" : "Notifications";
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<AdminNotice[]>(initialItems);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<"idle" | "on" | "blocked" | "busy">("idle");
  const [soundOn, setSoundOn] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  /*
   * The last notification we already announced. The stream re-sends whenever
   * the unread count changes - including when you *read* something - so without
   * this the same notification chimes again every time the count moves.
   * Seeded with what is already on screen so nothing re-announces on mount.
   */
  const announcedIdRef = useRef<string | null>(initialItems[0]?.id ?? null);

  useEffect(() => {
    try {
      setSoundOn(window.localStorage.getItem("nl_notify_sound") !== "off");
    } catch {
      // Blocked storage - keep the default.
    }
  }, []);

  /*
   * A short two-note chime, synthesised rather than shipped as an audio file:
   * no extra request, nothing to 404, and it can't be silenced by a missing
   * asset. Browsers refuse audio until the page has been interacted with, so
   * the context is created lazily and failures are ignored.
   */
  const chime = useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;

      const ctx = (audioRef.current ??= new Ctx());
      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime;
      [880, 1174.7].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        // Quick fade in and out so it reads as a chime, not a beep.
        const start = now + i * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // Autoplay policy or no audio device - silence is an acceptable outcome.
    }
  }, []);

  /*
   * A new order rings an actual bell. The synthesised chime above still covers
   * everything else the bell carries - an order is the one worth looking up
   * for, and a shop owner should be able to tell the two apart without
   * checking the screen.
   */
  const bellRef = useRef<HTMLAudioElement | null>(null);

  /*
   * Loaded on mount rather than at the first order, so the sound is not
   * waiting on a download at the moment it should play. Only the
   * notifications icon does it - the messages icon never carries an order.
   */
  useEffect(() => {
    if (isChat) return;
    try {
      const audio = new Audio("/sounds/new-order.m4a");
      audio.preload = "auto";
      audio.volume = 0.7;
      audio.load();
      bellRef.current = audio;
    } catch {
      // No audio device, or a browser that will not build one - the badge
      // still moves.
    }
  }, [isChat]);

  const ringBell = useCallback(() => {
    try {
      const audio = (bellRef.current ??= new Audio("/sounds/new-order.m4a"));
      audio.volume = 0.7;
      audio.currentTime = 0;
      void audio.play().catch(() => chime());
    } catch {
      chime();
    }
  }, [chime]);

  // ---- Live updates ----
  useEffect(() => {
    const source = new EventSource(
      `/api/admin/notifications/stream?kind=${kind}`,
    );

    source.addEventListener("update", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        unread: number;
        latest: AdminNotice | null;
        isInitial: boolean;
      };
      setUnread(data.unread);

      if (data.latest) {
        setItems((current) =>
          current.some((n) => n.id === data.latest!.id)
            ? current
            : [data.latest!, ...current].slice(0, 15),
        );

        // Only a genuinely new notification is worth announcing.
        const isNew = data.latest.id !== announcedIdRef.current;
        announcedIdRef.current = data.latest.id;

        if (!data.isInitial && isNew) {
          // Read the toggle live: the effect only runs once, so closing over
          // `soundOn` here would freeze whatever it was at mount.
          let wantsSound = true;
          try {
            wantsSound = window.localStorage.getItem("nl_notify_sound") !== "off";
          } catch {
            // Keep the default.
          }
          /*
           * An order rings the actual bell; everything else keeps the quiet
           * chime, so the shop can tell an order from a review without
           * looking. This used to be played by the card in the corner - that
           * card is gone, and the sound belongs on the bell that is left.
           */
          if (wantsSound) {
            if (ORDER_TYPES.includes(data.latest.type as (typeof ORDER_TYPES)[number])) {
              ringBell();
            } else {
              chime();
            }
          }

          // A desktop notification for a tab that's open but not looked at.
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.hidden
          ) {
            new Notification(data.latest.title, { body: data.latest.body ?? "" });
          }
        }
      }
    });

    // EventSource retries on its own; nothing to do here but avoid noise.
    source.onerror = () => {};
    return () => source.close();
  }, [chime, ringBell, kind]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setPushState("on");
    }
  }, []);

  const markRead = useCallback(
    async (id?: string) => {
      const res = await fetch("/api/admin/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id, kind } : { all: true, kind }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unread: number };
        setUnread(data.unread);
        setItems((current) =>
          current.map((n) =>
            !id || n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        );
      }
    },
    [kind],
  );

  /** Delete the ones already read, so the list stops growing forever. */
  const clearRead = useCallback(async () => {
    const res = await fetch("/api/admin/notifications/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (res.ok) {
      const data = (await res.json()) as { unread: number };
      setUnread(data.unread);
      setItems((current) => current.filter((n) => !n.readAt));
      // The list is server-rendered on the next navigation; refresh so a page
      // change doesn't bring the deleted rows back.
      router.refresh();
    }
  }, [kind, router]);

  /** Turn browser push on for this device. */
  async function enablePush() {
    if (!pushEnabled || !vapidKey) return;
    setPushState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState("blocked");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
        }));

      await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setPushState("on");
    } catch {
      setPushState("blocked");
    }
  }

  return (
    /* data-notice-kind names which menu this is, in the markup rather than
       only in a label that appears once the menu is open - the deploy checks
       that all three are on the page. */
    <div ref={wrapRef} className="relative" data-notice-kind={kind}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${unread} unread ${isChat ? "message" : "notification"}${unread === 1 ? "" : "s"}`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Icon className="h-[21px] w-[21px]" />
        {unread > 0 ? (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-[var(--on-colour)] ${
              isChat ? "bg-[#B4802A]" : "bg-red-500"
            }`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{menuTitle}</p>
            <div className="flex items-center gap-3">
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void markRead()}
                  className="text-xs font-medium text-[var(--admin-accent)] hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
              {items.some((n) => n.readAt) ? (
                <button
                  type="button"
                  onClick={() => void clearRead()}
                  className="text-xs font-medium text-slate-400 hover:text-red-600 hover:underline"
                  title="Delete the ones already read"
                >
                  Clear read
                </button>
              ) : null}
            </div>
          </div>

          <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-slate-400">
                Nothing yet.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void markRead(n.id);
                      setOpen(false);
                      if (n.href) router.push(n.href);
                    }}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      n.readAt ? "" : "bg-[var(--admin-accent)]/5"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.readAt ? "bg-transparent" : "bg-[var(--admin-accent)]"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-slate-400">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
            <span className="text-xs text-slate-500">Sound on new notifications</span>
            <button
              type="button"
              role="switch"
              aria-checked={soundOn}
              aria-label="Notification sound"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                try {
                  window.localStorage.setItem("nl_notify_sound", next ? "on" : "off");
                } catch {
                  // Not persisting is survivable; the toggle still works now.
                }
                // Play on enable so it's obvious what you just turned on - and
                // it doubles as the user gesture that unlocks audio.
                if (next) ringBell();
              }}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                soundOn ? "bg-[var(--admin-accent)]" : "bg-slate-200"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  soundOn ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {pushEnabled ? (
            <div className="border-t border-slate-100 px-4 py-3">
              {pushState === "on" ? (
                <p className="text-xs text-slate-500">
                  Browser notifications are on for this device.
                </p>
              ) : pushState === "blocked" ? (
                <p className="text-xs text-amber-700">
                  Notifications are blocked. Allow them in your browser&rsquo;s site
                  settings.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void enablePush()}
                  disabled={pushState === "busy"}
                  className="text-xs font-medium text-[var(--admin-accent)] hover:underline disabled:opacity-60"
                >
                  {pushState === "busy"
                    ? "Enabling…"
                    : "Enable notifications on this device"}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** VAPID keys arrive base64url; the push API wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
