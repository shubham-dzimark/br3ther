"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/** Email, password with a show toggle, and a submit that says when it's working. */
export function AdminLoginFields() {
  const [show, setShow] = useState(false);
  return (
    <div className="grid gap-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-slate-800">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="h-12 w-full rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] px-3.5 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 adm-focus"
          placeholder="you@br3thr.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-slate-800">Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] pl-3.5 pr-20 text-[15px] text-slate-900 outline-none adm-focus"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-pressed={show}
            className="adm-focus absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-[3px] px-3 text-[13px] font-semibold text-slate-600 hover:bg-[var(--admin-inset)] hover:text-slate-900"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <Submit />
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="adm-focus mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--admin-btn)] text-[15px] font-semibold text-[var(--admin-btn-ink)] transition disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
