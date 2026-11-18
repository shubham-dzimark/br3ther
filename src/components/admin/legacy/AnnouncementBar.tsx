"use client";

import { useEffect, useState } from "react";

/**
 * The strip above the header.
 *
 * Deliberately louder than the usual thin black bar: it uses the brand
 * highlight rather than a neutral, the offer is the biggest text on the line,
 * and the coupon is a real control you can click rather than a code to
 * memorise. A bar people skip is just a row of pixels that pushed the shop
 * down the page.
 */

export type AnnouncementProps = {
  messages: string[];
  eyebrow: string;
  coupon: string;
  linkUrl: string;
  linkLabel: string;
  style: "highlight" | "dark" | "custom";
  bg: string;
  fg: string;
  endsAt: string;
  dismissible: boolean;
  hideDays: number;
  rotateSeconds: number;
  /*
   * "rotate" cycles one message at a time (the original). "strip" lays every
   * message out on one line with a small icon each and a dot between, the way
   * a classic shop notice bar does - no motion, everything readable at once.
   */
  layout?: "rotate" | "strip";
};

/* An icon per message, chosen from its wording; anything unrecognised gets
   the heart. Kept deliberately small - it is decoration, not meaning. */
function StripIcon({ text }: { text: string }) {
  const t = text.toLowerCase();
  const cls = "h-4 w-4 shrink-0";
  if (/ship|deliver|dispatch|order/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cls}>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" />
      </svg>
    );
  }
  if (/save|discount|%|off|deal|sale|coupon/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cls}>
        <circle cx="12" cy="12" r="9" /><path d="m9 15 6-6" /><circle cx="9.5" cy="9.5" r="0.8" /><circle cx="14.5" cy="14.5" r="0.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cls}>
      <path d="M12 21s-7-4.5-9.2-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.2 12C19 16.5 12 21 12 21Z" />
    </svg>
  );
}

const KEY = "nl_announce_hidden_until";

export function AnnouncementBar(props: AnnouncementProps) {
  /*
   * Rendered by the server and present in the first HTML, so the page does not
   * jump as the bar drops in after hydration.
   *
   * Hiding it from someone who already closed it cannot be decided here -
   * localStorage does not exist during SSR, and reading it in a state
   * initialiser would be a hydration mismatch. A tiny blocking script in the
   * layout does that instead, before the first paint, so a dismissed bar is
   * never visible for even a frame.
   */
  const [gone, setGone] = useState(false);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState<string | null>(null);

  // Rotate through the messages, if there is more than one.
  useEffect(() => {
    if (props.messages.length < 2 || props.layout === "strip") return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % props.messages.length),
      props.rotateSeconds * 1000,
    );
    return () => window.clearInterval(id);
  }, [props.messages.length, props.rotateSeconds]);

  // Countdown, when the offer has an end.
  useEffect(() => {
    if (!props.endsAt) return;
    const end = new Date(props.endsAt).getTime();
    if (!Number.isFinite(end)) return;

    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) {
        setLeft(null);
        return;
      }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      setLeft(
        d > 0
          ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [props.endsAt]);

  function dismiss() {
    setGone(true);
    document.documentElement.setAttribute("data-announce-hidden", "");
    try {
      const days = props.hideDays;
      // 0 days means "back on the next visit", so nothing is written.
      if (days > 0) {
        window.localStorage.setItem(KEY, String(Date.now() + days * 86400000));
      }
    } catch {
      // Not fatal - it just reappears next time.
    }
  }

  async function copyCoupon() {
    try {
      await navigator.clipboard.writeText(props.coupon);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (insecure context, or denied). The code is visible
      // on the button either way, so there is still something to type.
    }
  }

  if (gone) return null;

  const dark = props.style === "dark";
  const custom = props.style === "custom";

  const background = custom && props.bg ? props.bg : undefined;
  const foreground = custom && props.fg ? props.fg : undefined;

  return (
    <div
      role="region"
      aria-label="Store announcement"
      data-announce-bar=""
      className={`relative overflow-hidden ${
        dark
          ? "border-b border-white/10 bg-[#000000] text-white" /* pure black, with the same hairline as under the header (user request, 2026-10-10) */
          : custom
            ? ""
            : "bg-[var(--brand-highlight)] text-[var(--brand-surface)]"
      }`}
      style={{ backgroundColor: background, color: foreground }}
    >
      {/* A slow sheen across the bar. Pure decoration, and it stops entirely
          for anyone who has asked for reduced motion. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[nlSheen_5s_ease-in-out_infinite] bg-white/20 blur-xl motion-reduce:hidden"
      />

      <div className="relative mx-auto flex max-w-page items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center sm:gap-x-3">
          {props.eyebrow ? (
            <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] opacity-75 sm:inline-flex">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8Z" />
              </svg>
              {props.eyebrow}
            </span>
          ) : null}

          {/* The offer itself: the loudest thing on the line. */}
          {props.layout === "strip" ? (
            props.messages.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-[12px] font-medium sm:text-[15px]">
                {i > 0 ? <span aria-hidden="true" className="mx-2 hidden opacity-70 sm:inline lg:mx-5">&bull;</span> : null}
                <StripIcon text={m} />
                {props.linkUrl ? (
                  <a href={props.linkUrl} className="underline-offset-2 hover:underline">{m}</a>
                ) : (
                  m
                )}
              </span>
            ))
          ) : props.linkUrl ? (
            /*
             * On a phone the standalone call-to-action is hidden to keep the
             * bar short, so the message itself carries the link - otherwise
             * mobile visitors would have nothing to tap.
             */
            <a
              key={index}
              href={props.linkUrl}
              className="animate-[nlFade_.45s_ease-out] text-[12px] font-extrabold leading-snug tracking-tight underline-offset-2 hover:underline sm:text-sm"
            >
              {props.messages[index]}
            </a>
          ) : (
            <span
              key={index}
              className="animate-[nlFade_.45s_ease-out] text-[12px] font-extrabold leading-snug tracking-tight sm:text-sm"
            >
              {props.messages[index]}
            </span>
          )}

          {left ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-bold tabular-nums sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="h-3.5 w-3.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {left}
            </span>
          ) : null}

          {props.coupon ? (
            <button
              type="button"
              onClick={copyCoupon}
              className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-current/30 bg-black/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition hover:bg-black/20 active:scale-95 sm:gap-1.5 sm:px-3 sm:py-1 sm:text-[11px]"
              aria-label={`Copy coupon code ${props.coupon}`}
            >
              {copied ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <rect x="9" y="9" width="12" height="12" rx="2.5" />
                    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
                  </svg>
                  {props.coupon}
                </>
              )}
            </button>
          ) : null}

          {props.linkUrl && props.linkLabel ? (
            <a
              href={props.linkUrl}
              className="hidden shrink-0 items-center gap-1 rounded-full bg-black/85 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-black sm:inline-flex"
            >
              {props.linkLabel}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3 w-3">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </a>
          ) : null}
        </div>

        {props.dismissible ? (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/15"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
