"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects its parent form's pending state.
 * Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`relative inline-flex items-center justify-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {pending ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5 animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {pendingLabel ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
