"use client";

import { useState } from "react";
import { SubmitButton } from "./SubmitButton";

/*
 * Email and password for the sign-in screen.
 *
 * A client component only for the show/hide toggle - typing a long password
 * blind, getting it wrong and being told "that didn't match" is the single
 * most annoying thing about an admin login.
 */

const classic =
  "peer w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#7b2ff7] focus:ring-4 focus:ring-[#7b2ff7]/12";
/* The Br3thr sign-in: the storefront's black fields with a gold focus. */
const br3thr =
  "peer w-full rounded-[3px] border border-[#d4ab5a]/30 bg-black py-3.5 pl-11 pr-4 text-sm text-[#f4efe6] outline-none transition placeholder:text-white/35 focus:border-[#d4ab5a] focus:ring-4 focus:ring-[#d4ab5a]/12";

function Icon({ children, gf }: { children: React.ReactNode; gf: boolean }) {
  return (
    <span className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${gf ? "text-[#d4ab5a]/70 peer-focus:text-[#d4ab5a]" : "text-slate-400 peer-focus:text-[#7b2ff7]"}`}>
      {children}
    </span>
  );
}

export function LoginFields({ gf = false }: { gf?: boolean }) {
  const [show, setShow] = useState(false);
  const wrap = gf ? br3thr : classic;
  const label = gf
    ? "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75"
    : "mb-1.5 block text-[13px] font-semibold text-slate-700";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="email" className={label}>
          Email
        </label>
        <div className="relative">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@example.com"
            className={wrap}
          />
          <Icon gf={gf}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
              <path d="m3 7.5 9 5.5 9-5.5" />
            </svg>
          </Icon>
        </div>
      </div>

      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            className={`${wrap} pr-12`}
          />
          <Icon gf={gf}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
          </Icon>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className={`absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition ${gf ? "text-white/50 hover:text-[#d4ab5a]" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
          >
            {show ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
                <path d="M2 12s3.6-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.6 7-10 7c-2 0-3.7-.6-5.1-1.5" />
                <path d="m3 3 18 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[18px] w-[18px]">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <SubmitButton
        className={
          gf
            ? "mt-2 w-full rounded-[3px] bg-gradient-to-b from-[#f0cf83] to-[#d9ad55] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            : "mt-2 w-full rounded-2xl bg-[linear-gradient(110deg,#7C2AD6_0%,#50119D_55%,#2E0A5C_100%)] px-5 py-3.5 text-sm font-bold text-[var(--on-colour)] shadow-lg shadow-[#50119D]/30 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        }
        pendingLabel="Signing in…"
      >
        Sign in
      </SubmitButton>
    </div>
  );
}
