"use client";

import { useTransition } from "react";

/**
 * Submit button for a form it isn't nested inside (joined via `form={formId}`).
 *
 * It calls the action itself inside a transition rather than letting the form
 * post. `useFormStatus` only reports the nearest ancestor form, and simply
 * flipping a flag on submit left the spinner running forever once the row
 * actions stopped redirecting - a transition's pending state ends when the
 * action *and* its revalidation finish, which is the thing worth waiting on.
 */
export function FormSubmitButton({
  formId,
  action,
  children,
  pendingLabel = "Saving…",
  className = "",
}: {
  formId: string;
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        const form = document.getElementById(formId);
        if (!(form instanceof HTMLFormElement)) return;
        // Mirrors a native submit: same fields, same validation.
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        startTransition(async () => {
          await action(data);
        });
      }}
      className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {pending ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3 w-3 animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
