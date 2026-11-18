import Link from "next/link";

/*
 * Shared class strings so every admin screen stays visually consistent.
 *
 * Surfaces, hairlines and shadows come from the tokens defined under
 * `[data-admin]` in globals.css rather than from Tailwind colour utilities, so
 * the whole admin can be re-skinned from one place. Radii are deliberately
 * larger than the old design and shadows much softer - the previous look
 * leaned on full-round pills and hard borders.
 */
export const cardCls =
  "rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)]";

const fieldBase =
  "w-full rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] text-sm text-slate-900 outline-none transition placeholder:text-slate-400 adm-focus";

export const inputCls = `${fieldBase} px-3.5 py-2.5`;
export const textareaCls = `${fieldBase} px-3.5 py-3 leading-relaxed`;
export const selectCls = inputCls;

export const labelCls =
  "mb-1.5 block text-[13px] font-medium text-slate-700";
export const hintCls = "mt-1.5 text-xs text-slate-500";

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--admin-radius-sm)] px-4 py-2.5 text-sm font-medium transition adm-focus disabled:cursor-not-allowed disabled:opacity-55";

export const btnPrimary = `${btnBase} bg-[var(--admin-btn)] text-[var(--admin-btn-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:brightness-[1.08] active:brightness-95`;
export const btnGhost = `${btnBase} border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] text-slate-700 hover:bg-[var(--admin-inset)]`;
export const btnDanger = `${btnBase} border border-red-200 bg-white text-red-600 hover:bg-red-50`;

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${cardCls} ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="adm-display text-[24px] font-semibold text-slate-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Metric tile.
 *
 * Was a block of flat pastel. It is now a normal card with the colour pulled
 * back to a small accent bar and a tinted value, which keeps a row of eight
 * tiles from reading as a paint chart while still telling them apart.
 */
export function StatCard({
  label,
  value,
  href,
  delta,
  tone,
  exactValue,
}: {
  label: string;
  value: string;
  /** The full amount, shown on hover when `value` is shortened (e.g. $1.9k). */
  exactValue?: string;
  href?: string;
  /** Percent change vs the previous period. Null hides the pill entirely. */
  delta?: number | null;
  tone: "mint" | "yellow" | "peach" | "pink" | "lavender" | "orange" | "green" | "blue";
}) {
  /* Tone now drives a single accent hue per tile, not the whole background. */
  const tones = {
    mint: "#1F7A5C",
    yellow: "#9A6A12",
    peach: "#B4552F",
    pink: "#A8436B",
    lavender: "#3D6EA3",
    orange: "#A9651C",
    green: "#3C7F45",
    blue: "#1A6FB5",
  } as const;

  /*
   * Gradient tiles, per the reference dashboard: the figure sits on colour
   * rather than beside a coloured chip, with a watermark disc behind it.
   *
   * White-on-gradient needs the darker end of each ramp to clear 4.5:1 - the
   * pastel versions of these hues put white text at about 2:1, which is why
   * the label and the delta carry their own opacity rather than a lighter
   * tint.
   */
  const ramps = {
    mint:     ["#2BB598", "#12806C"],
    yellow:   ["#D79B2B", "#A56B0E"],
    peach:    ["#F09073", "#D2553A"],
    pink:     ["#E9799B", "#BE3F6A"],
    lavender: ["#6E8BE0", "#3F55B0"],
    orange:   ["#EE9A4D", "#C56A1B"],
    green:    ["#57AE5B", "#2F7D45"],
    blue:     ["#4E9FE0", "#1C6AAE"],
  } as const;

  const [from, to] = ramps[tone];

  const body = (
    <div
      className="adm-stat relative isolate overflow-hidden rounded-[var(--admin-radius)] p-5 text-[var(--on-colour)] transition hover:brightness-[1.04]"
      style={{ backgroundImage: `linear-gradient(115deg, ${from} 0%, ${to} 100%)` }}
    >
      {/* Watermark discs, bottom-right, clipped by the card. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-6 -z-10 h-36 w-36 rounded-full bg-white/12"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-2 right-10 -z-10 h-24 w-24 rounded-full bg-white/10"
      />

      <p className="text-[13px] font-semibold text-[var(--on-colour)]/85">{label}</p>
      <p
        className="adm-display mt-2.5 text-[28px] font-semibold leading-tight text-[var(--on-colour)]"
        title={exactValue}
      >
        {value}
      </p>
      {delta != null ? (
        <p className="mt-2.5 text-[12px] font-medium text-[var(--on-colour)]/85">
          {delta >= 0 ? "Increased" : "Decreased"} by {Math.abs(delta).toFixed(1)}%
        </p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "amber" | "emerald" | "sky" | "red";
}) {
  const tones = {
    slate: "bg-[var(--admin-inset)] text-slate-600 ring-[var(--admin-line-strong)]",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    red: "bg-red-50 text-red-700 ring-red-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--admin-radius)] border border-dashed border-[var(--admin-line-strong)] bg-[var(--admin-inset)] p-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export const thCls =
  "px-4 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400";
export const tdCls = "px-4 py-3 text-[13px] text-slate-700";
