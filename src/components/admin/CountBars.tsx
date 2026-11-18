export type CountPoint = { label: string; value: number; caption?: string };

/**
 * Small bar chart for plain counts.
 *
 * Same server-rendered SVG approach as the revenue charts - no charting
 * library, no client JS - with the hover readout as an HTML layer so it can be
 * styled and reached by keyboard.
 */
export function CountBars({
  points,
  height = 190,
  unit = "",
}: {
  points: CountPoint[];
  height?: number;
  /** Word after the number in the tooltip, e.g. "conversations". */
  unit?: string;
}) {
  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-400">Nothing yet.</p>
    );
  }

  const W = 900;
  const H = height;
  const padL = 30;
  const padR = 8;
  const padTop = 10;
  const padBottom = 26;

  // Even and at least 2, so the middle gridline is a whole number too - a peak
  // of 1 used to label the axis "0, 1, 1".
  const peak = Math.max(2, Math.ceil(Math.max(0, ...points.map((p) => p.value)) / 2) * 2);
  const plotH = H - padTop - padBottom;
  const plotW = W - padL - padR;
  const band = plotW / points.length;
  const barW = Math.min(30, band * 0.5);
  const pc = (n: number, of: number) => `${(n / of) * 100}%`;

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[520px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Daily counts">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={padL}
                x2={W - padR}
                y1={padTop + (1 - f) * plotH}
                y2={padTop + (1 - f) * plotH}
                stroke="rgb(226 232 240)"
                strokeDasharray="3 4"
              />
              <text
                x={padL - 8}
                y={padTop + (1 - f) * plotH + 3.5}
                textAnchor="end"
                className="fill-slate-400"
                style={{ fontSize: 10 }}
              >
                {Math.round(peak * f)}
              </text>
            </g>
          ))}

          {points.map((p, i) => {
            const h = (p.value / peak) * plotH;
            const cx = padL + band * i + band / 2;
            return (
              <g key={p.label}>
                {h > 0 ? (
                  <rect
                    x={cx - barW / 2}
                    y={padTop + plotH - h}
                    width={barW}
                    height={h}
                    rx="4"
                    fill="var(--admin-accent)"
                  />
                ) : null}
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0">
          {points.map((p, i) => {
            const h = (p.value / peak) * plotH;
            const first = i <= 1;
            const last = i >= points.length - 2;
            const anchor = first
              ? "left-1 translate-x-0"
              : last
                ? "right-1 translate-x-0"
                : "left-1/2 -translate-x-1/2";
            return (
              <div
                key={p.label}
                tabIndex={0}
                aria-label={`${p.caption ?? p.label}: ${p.value} ${unit}`}
                className="group absolute bottom-0 top-0 outline-none"
                style={{ left: pc(padL + band * i, W), width: pc(band, W) }}
              >
                <div
                  className="pointer-events-none absolute inset-x-[15%] rounded-md bg-slate-900/[0.045] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ top: pc(padTop, H), bottom: pc(padBottom, H) }}
                />
                <div
                  className={`pointer-events-none absolute z-10 w-max whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
                    /* Above a full-height bar the tooltip is clipped by the
                       chart's own scroll box, so it hangs below instead. */
                    padTop + plotH - h < 70
                      ? "translate-y-2"
                      : "-translate-y-[calc(100%+8px)]"
                  } ${anchor}`}
                  style={{ top: pc(padTop + plotH - h, H) }}
                >
                  <span className="font-semibold text-slate-900">{p.value}</span>{" "}
                  <span className="text-slate-500">{unit}</span>
                  <span className="ml-1.5 text-slate-400">{p.caption ?? p.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
