"use client";

/**
 * Submit button that asks first.
 *
 * A row-level delete is one click away from destroying something, with no
 * undo, so it gets a confirmation. Client-side only - the server action is
 * still the thing that checks the caller may do it.
 */
export function ConfirmSubmit({
  message,
  children,
  className = "",
  title,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      title={title}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
