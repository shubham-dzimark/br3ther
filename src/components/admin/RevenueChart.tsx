import { formatCents } from "@/lib/money";

export type ChartPoint = {
  date: string;
  cents: number;
  /** Pre-formatted money for the hover readout. Falls back to CAD when the
   *  caller does not pass one - money formatters cannot cross the RSC
   *  boundary, so the page has to format it. */
  display?: string;
  /** Overrides the tooltip's heading, e.g. "August 2026" for monthly buckets. */
  label?: string;
};

/**
 * Hand-rolled SVG area chart. Deliberately not a charting library: this is a
 * server component with no client JS, so the dashboard stays fast and the
 * bundle stays small.
 */
export function RevenueChart({
  points,
  height = 220,
}: {
  points: ChartPoint[];
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-slate-400"
      >
        No revenue data yet
      </div>
    );
  }

  const W = 760;
  const H = height;
  const padX = 8;
  const padTop = 16;
  const padBottom = 26;

  const max = Math.max(...points.map((p) => p.cents), 1);
  const stepX =
    points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;

  const x = (i: number) => padX + i * stepX;
  const y = (cents: number) =>
    padTop + (1 - cents / max) * (H - padTop - padBottom);

  const line = points.map((p, i) => `${x(i)},${y(p.cents)}`).join(" ");
  const area = `${padX},${H - padBottom} ${line} ${x(points.length - 1)},${
    H - padBottom
  }`;

  // Four horizontal guide lines.
  const guides = [0, 0.25, 0.5, 0.75].map(
    (f) => padTop + f * (H - padTop - padBottom),
  );

  // Half a step either side, so the hover zones tile the plot with no gaps.
  const zoneW = points.length > 1 ? stepX : W - padX * 2;
  const pc = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div className="overflow-x-auto">
      {/*
       * Tooltips are an HTML layer over the SVG rather than <title> elements:
       * a native tooltip cannot be styled, lags a second behind the cursor and
       * shows nothing on keyboard focus. Percentage positioning tracks the
       * viewBox as the chart scales.
       */}
      <div className="relative min-w-[560px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Revenue over the last ${points.length} points`}
        >
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(14 124 102)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="rgb(14 124 102)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {guides.map((gy) => (
            <line
              key={gy}
              x1={padX}
              x2={W - padX}
              y1={gy}
              y2={gy}
              stroke="rgb(226 232 240)"
              strokeDasharray="3 4"
            />
          ))}

          <polygon points={area} fill="url(#revFill)" />
          <polyline
            points={line}
            fill="none"
            stroke="rgb(14 124 102)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.cents)}
              r="3"
              fill="white"
              stroke="rgb(14 124 102)"
              strokeWidth="1.8"
            />
          ))}

          {points.map((p, i) =>
            // Label roughly every fifth point so the axis never crowds.
            i % Math.ceil(points.length / 6) === 0 ? (
              <text
                key={`l-${p.date}`}
                x={x(i)}
                y={H - 8}
                textAnchor={
                  i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
                }
                className="fill-slate-400"
                style={{ fontSize: 10 }}
              >
                {p.date.slice(5)}
              </text>
            ) : null,
          )}
        </svg>

        <div className="absolute inset-0">
          {points.map((p, i) => {
            const first = i <= 1;
            const last = i >= points.length - 2;
            const anchor = first
              ? "left-1 translate-x-0"
              : last
                ? "right-1 translate-x-0"
                : "left-1/2 -translate-x-1/2";
            return (
              <div
                key={p.date}
                tabIndex={0}
                aria-label={`${p.label ?? p.date}: ${p.display ?? formatCents(p.cents)}`}
                className="group absolute bottom-0 top-0 outline-none"
                /*
                 * Clamped to the chart: the end zones reach half a step past
                 * the first and last points, and that overhang was enough to
                 * push a horizontal scrollbar onto every chart on the page.
                 */
                style={{
                  left: pc(Math.max(0, x(i) - zoneW / 2), W),
                  width: pc(
                    Math.min(W, x(i) + zoneW / 2) - Math.max(0, x(i) - zoneW / 2),
                    W,
                  ),
                }}
              >
                {/* Vertical crosshair, so it is obvious which point is read. */}
                <div
                  className="pointer-events-none absolute left-1/2 w-px -translate-x-1/2 bg-[rgb(14_124_102)]/25 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ top: pc(padTop, H), bottom: pc(padBottom, H) }}
                />
                <div
                  className="pointer-events-none absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgb(14_124_102)] bg-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ top: pc(y(p.cents), H) }}
                />
                <div
                  className={`pointer-events-none absolute z-10 w-max rounded-xl border border-slate-200 bg-white px-3 py-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
                    // Same clipping trap as the bars below: hang it under a
                    // point that sits too near the top to have room above.
                    y(p.cents) < 78 ? "translate-y-3" : "-translate-y-[calc(100%+10px)]"
                  } ${anchor}`}
                  style={{ top: pc(y(p.cents), H) }}
                >
                  <p className="text-xs font-semibold text-slate-900">
                    {p.label ?? p.date}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[rgb(14_124_102)]" />
                    Revenue:
                    <span className="font-semibold text-slate-900">
                      {p.display ?? formatCents(p.cents)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Axis ceiling split into four equal, whole-number steps (1, 2, 2.5, 5 x 10^n),
 * so every gridline gets a distinct, readable label. With no revenue at all
 * the axis shows 0-100 rather than dividing $1 into quarters, which rounded
 * to a column of "0, 0, 1, 1, 1".
 */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  // 2.5 only from 25 up, where it still gives whole-number labels.
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && mag >= 10 ? 2.5 : n <= 5 ? 5 : 10;
  const step = Math.max(1, nice * mag);
  return step * 4;
}

/** Axis label: 100000 -> "100k", 800 -> "800". */
function axisLabel(dollars: number): string {
  if (dollars >= 1000) {
    const k = dollars / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(dollars));
}

export type MonthPoint = {
  /** Short month name, e.g. "Jan". */
  label: string;
  cents: number;
  /** Pre-formatted money for the hover tooltip - formatters cannot cross the
   *  server/client boundary, so the page formats and passes the string. */
  formatted: string;
};

/**
 * Twelve-month revenue bars in the reference dashboard's alternating amber and
 * teal. Server-rendered SVG for the same reason as the area chart above: no
 * charting library, no client JS.
 */
export function MonthlyBars({
  months,
  height = 300,
}: {
  months: MonthPoint[];
  height?: number;
}) {
  const W = 900;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padTop = 12;
  const padBottom = 30;

  const maxDollars = niceMax(Math.max(0, ...months.map((m) => m.cents / 100)));
  const plotH = H - padTop - padBottom;
  const plotW = W - padL - padR;
  const band = plotW / months.length;
  const barW = Math.min(38, band * 0.42);

  // Five gridlines including the baseline, matching the reference's 0..100k.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    y: padTop + (1 - f) * plotH,
    label: axisLabel(maxDollars * f),
  }));

  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div className="overflow-x-auto">
      {/*
       * The hover tooltips are an HTML layer over the SVG rather than SVG
       * <title> elements: a native tooltip cannot be styled, takes a second to
       * appear, and shows nothing on keyboard focus. Positioning is in
       * percentages so it tracks the viewBox as the chart scales.
       */}
      <div className="relative min-w-[620px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Revenue by month"
        >
          {ticks.map((t) => (
            <g key={t.f}>
              <line
                x1={padL}
                x2={W - padR}
                y1={t.y}
                y2={t.y}
                stroke="rgb(226 232 240)"
                strokeDasharray="3 4"
              />
              <text
                x={padL - 10}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-slate-400"
                style={{ fontSize: 11 }}
              >
                {t.label}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const h = (m.cents / 100 / maxDollars) * plotH;
            const cx = padL + band * i + band / 2;
            // Alternating fills are the reference's signature; they carry no
            // meaning beyond making adjacent months easy to tell apart.
            const fill = i % 2 === 0 ? "#B4802A" : "#2E8B7A";
            return (
              <g key={m.label}>
                {h > 0 ? (
                  <rect
                    x={cx - barW / 2}
                    y={padTop + plotH - h}
                    width={barW}
                    height={h}
                    rx="5"
                    fill={fill}
                  />
                ) : null}
                <text
                  x={cx}
                  y={H - 9}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 11 }}
                >
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0">
          {months.map((m, i) => {
            const h = (m.cents / 100 / maxDollars) * plotH;
            const barTop = padTop + plotH - h;
            const dot = i % 2 === 0 ? "#B4802A" : "#2E8B7A";
            // Tooltips at the two ends would be cut off by the chart's own
            // scroll box, so they anchor to that edge instead of centring.
            const first = i <= 1;
            const last = i >= months.length - 2;
            const anchor = first
              ? "left-1 translate-x-0"
              : last
                ? "right-1 translate-x-0"
                : "left-1/2 -translate-x-1/2";
            /*
             * A tooltip above a full-height bar is cut off: the chart scrolls
             * sideways, and a box that scrolls on one axis clips on the other
             * too, so all that showed was an empty white sliver. Near the top
             * it hangs below the bar's head instead.
             */
            const below = barTop < 78;
            const lift = below ? "translate-y-2" : "-translate-y-[calc(100%+8px)]";
            return (
              <div
                key={m.label}
                tabIndex={0}
                aria-label={`${m.label}: ${m.formatted}`}
                className="group absolute bottom-0 top-0 outline-none"
                style={{ left: pct(padL + band * i, W), width: pct(band, W) }}
              >
                <div
                  className="pointer-events-none absolute inset-x-[12%] rounded-lg bg-slate-900/[0.045] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{
                    top: pct(padTop, H),
                    bottom: pct(padBottom, H),
                  }}
                />
                <div
                  className={`pointer-events-none absolute z-10 w-max rounded-xl border border-slate-200 bg-white px-3 py-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${lift} ${anchor}`}
                  style={{ top: pct(barTop, H) }}
                >
                  <p className="text-xs font-semibold text-slate-900">
                    {m.label}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: dot }}
                    />
                    Revenue:
                    <span className="font-semibold text-slate-900">
                      {m.formatted}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Fulfilment progress bars - one row per stage, each on a tinted track of its
 * own colour so the panel reads at a glance.
 */
export function StatusBars({
  rows,
}: {
  rows: { label: string; count: number; color: string }[];
}) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const pct = total === 0 ? 0 : Math.round((r.count / total) * 100);
        return (
          <li key={r.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{r.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                {r.count}
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  ({String(pct).padStart(2, "0")}%)
                </span>
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: `${r.color}33` }}
            >
              <div
                className="h-full rounded-full"
                /*
                 * A stage that has orders but rounds to 0% still shows a
                 * sliver, so "1 stuck order" is never an invisible bar.
                 */
                style={{
                  width: `${r.count > 0 ? Math.max(pct, 3) : 0}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
