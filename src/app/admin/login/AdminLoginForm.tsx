"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/** Email, password with a show toggle, and a submit that says when it's working. */
export function AdminLoginFields() {
  const [show, setShow] = useState(false);
  return (
    <div className="form-narrow" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus placeholder="you@br3thr.com" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="pwfield">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required />
          <button type="button" className="pwfield__toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>
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
    <button type="submit" className="btn authframe__submit" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in…" : "Sign in"} <span className="arrow" aria-hidden="true">→</span>
    </button>
  );
}
