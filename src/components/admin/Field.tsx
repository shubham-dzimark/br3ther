/** Pill input with the label notched into its top border. */
export function Field({
  label,
  htmlFor,
  children,
  className = "",
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  /** A line under the field explaining how to fill it in. */
  hint?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <label
        htmlFor={htmlFor}
        /* Neutral, not the accent. Every field on a form carries one of these,
           so colouring them made a settings page read as a wall of brand
           colour - and in dark it was the blue showing up "everywhere".
           The accent still marks focus on the input itself. */
        className="absolute -top-2 left-4 z-10 bg-[var(--admin-surface)] px-1.5 text-xs font-medium text-slate-500"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 px-4 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export const fieldInput =
  "w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15";

export const fieldSelect =
  "w-full appearance-none rounded-full border border-slate-200 bg-white px-5 py-3 pr-10 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15";

export const fieldTextarea =
  "w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15";

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
