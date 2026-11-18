/**
 * Recovered against recoverable revenue, day by day.
 *
 * Both series are money in the same currency, so they share one axis - the
 * point of the chart is how the two compare, which a second scale would
 * destroy. Drawn as plain SVG with no client JavaScript: hovering a day is a
 * native <title>, which also reads out to a screen reader.
 */

const RECOVERED = "#12A184";
const RECOVERABLE = "#C77800";

/** "$1.9k CAD" is right for a tile and far too wide for an axis tick. */
function tick(compact: (cents: number) => string, cents: number): string {
  return compact(cents).split(" ")[0] ?? "";
}

/** A round number at or above the highest value, so the top tick reads cleanly. */
function niceMax(cents: number): number {
  if (cents <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(cents));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= cents) return candidate;
  }
  return 10 * magnitude;
}

export function RecoveryChart({
  series,
  format,
  compact,
}: {
  series: { day: string; recoverableCents: number; recoveredCents: number }[];
  format: (cents: number) => string;
  compact: (cents: number) => string;
}) {
  const points = series.length;
  const peak = Math.max(0, ...series.map((d) => Math.max(d.recoverableCents, d.recoveredCents)));

  const totals = series.reduce(
    (acc, d) => ({
      recoverable: acc.recoverable + d.recoverableCents,
      recovered: acc.recovered + d.recoveredCents,
    }),
    { recoverable: 0, recovered: 0 },
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RECOVERABLE }} />
        Recoverable
        <span className="font-semibold tabular-nums text-slate-900">{format(totals.recoverable)}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RECOVERED }} />
        Recovered
        <span className="font-semibold tabular-nums text-slate-900">{format(totals.recovered)}</span>
      </span>
    </div>
  );

  /*
   * Nothing has happened yet. A chart of flat zero lines invites people to read
   * a trend into an empty axis, so say what is missing instead of drawing it.
   */
  if (peak === 0) {
    return (
      <figure className="m-0">
        {legend}
        <div className="mt-3 grid h-40 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
          <p className="text-sm text-slate-500">
            No carts have been abandoned or recovered in this period yet. The
            chart fills in as soon as there is something to plot.
          </p>
        </div>
      </figure>
    );
  }

  const W = 960;
  const H = 260;
  const PAD = { top: 16, right: 84, bottom: 34, left: 72 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = niceMax(peak);

  const x = (i: number) => PAD.left + (points <= 1 ? plotW / 2 : (i / (points - 1)) * plotW);
  const y = (cents: number) => PAD.top + plotH - (cents / max) * plotH;

  const line = (key: "recoverableCents" | "recoveredCents") =>
    series.map((d, i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");

  const last = series[points - 1];
  const label = (day: string) => day.slice(5).replace("-", "/");

  return (
    <figure className="m-0">
      {legend}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-auto w-full"
        style={{ maxHeight: 280 }}
        role="img"
        aria-label={`Recoverable and recovered revenue over the last ${points} days`}
      >
        {[0, max / 2, max].map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth="1" />
            <text x={PAD.left - 12} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#94A3B8">
              {tick(compact, t)}
            </text>
          </g>
        ))}

        <polyline
          points={line("recoverableCents")}
          fill="none"
          stroke={RECOVERABLE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line("recoveredCents")}
          fill="none"
          stroke={RECOVERED}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* The last value of each line, named where the eye already is. */}
        <circle cx={x(points - 1)} cy={y(last.recoverableCents)} r="4" fill={RECOVERABLE} />
        <circle cx={x(points - 1)} cy={y(last.recoveredCents)} r="4" fill={RECOVERED} />
        <text
          x={x(points - 1) + 10}
          y={y(last.recoverableCents) + 4}
          fontSize="12"
          fontWeight="600"
          fill={RECOVERABLE}
        >
          {tick(compact, last.recoverableCents)}
        </text>
        <text
          x={x(points - 1) + 10}
          y={y(last.recoveredCents) + 4}
          fontSize="12"
          fontWeight="600"
          fill={RECOVERED}
        >
          {tick(compact, last.recoveredCents)}
        </text>

        {series.map((d, i) =>
          i === 0 || i === points - 1 || i === Math.floor((points - 1) / 2) ? (
            <text key={d.day} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#94A3B8">
              {label(d.day)}
            </text>
          ) : null,
        )}

        {/* Invisible per-day columns, so hovering anywhere over a day names it. */}
        {series.map((d, i) => (
          <rect
            key={`hit-${d.day}`}
            x={x(i) - plotW / Math.max(1, points * 2)}
            y={PAD.top}
            width={plotW / Math.max(1, points)}
            height={plotH}
            fill="transparent"
          >
            <title>
              {`${d.day} - recoverable ${format(d.recoverableCents)}, recovered ${format(d.recoveredCents)}`}
            </title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
