import Link from "next/link";

export type TopProductRow = {
  id: string;
  name: string;
  /** Null once the product has been deleted - the row still counts, but it
   *  cannot be linked to. */
  href: string | null;
  units: number;
  cents: number;
  /** Pre-formatted revenue; formatters cannot cross the RSC boundary. */
  revenue: string;
  /** The full amount, shown on hover when `revenue` is shortened (e.g. $1.9k). */
  exact?: string;
};

/**
 * Ranked horizontal bars. HTML rather than SVG so each row can be a real link
 * and the hover readout is an ordinary tooltip - no client JS either way.
 */
export function TopProductsBars({ rows }: { rows: TopProductRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-14 text-center text-sm text-slate-400">
        No sales in this period yet.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.cents), 1);
  // Warm-to-cool ramp so rank is readable even without the numbers.
  const palette = ["var(--admin-accent)", "#2E8B7A", "#3FA08C", "#59B49F", "#B4802A", "#F3C55C"];

  return (
    <ol className="space-y-3.5">
      {rows.map((r, i) => {
        const width = Math.max((r.cents / max) * 100, 2);
        const color = palette[i] ?? palette[palette.length - 1];
        const body = (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                  {i + 1}
                </span>
                <span className="truncate text-sm font-medium text-slate-700">
                  {r.name}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900" title={r.exact}>
                {r.revenue}
              </span>
            </div>
            <div className="ml-6 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {r.units} sold
              </span>
            </div>
          </>
        );

        return (
          <li key={r.id} className="group">
            {r.href ? (
              <Link
                href={r.href}
                className="block rounded-xl px-2 py-1.5 -mx-2 transition group-hover:bg-slate-50"
              >
                {body}
              </Link>
            ) : (
              <div className="px-2 py-1.5 -mx-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
