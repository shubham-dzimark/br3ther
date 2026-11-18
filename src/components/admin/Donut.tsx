export type DonutSlice = {
  label: string;
  value: number;
  color: string;
  /** Pre-formatted value for the hover readout - money formatters cannot
   *  cross the server/client boundary, so the page formats and passes it. */
  display?: string;
};

/**
 * Pure-SVG donut. Uses stroke-dasharray on concentric circles so there is no
 * path maths and no client-side charting library.
 *
 * The hover readout lives inside the SVG: each segment sits in its own <g>
 * alongside the centre text it reveals, so a CSS group-hover is enough and the
 * chart still ships zero client JS. The -90deg rotation is applied per circle
 * rather than to a wrapping <g>, so the centre text stays upright.
 */
export function Donut({
  slices,
  size = 210,
  thickness = 34,
  centreLabel,
  centreValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Shown in the middle until a segment is hovered. */
  centreLabel?: string;
  centreValue?: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);

  if (total === 0) {
    return (
      <div
        style={{ height: size }}
        className="flex items-center justify-center text-sm text-slate-400"
      >
        No data yet
      </div>
    );
  }

  const c = size / 2;
  const r = (size - thickness) / 2;
  const inner = r - thickness / 2 - 1;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const visible = slices.filter((s) => s.value > 0);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: size, height: size }}
      role="img"
      className="shrink-0"
    >
      {centreValue ? (
        <>
          <text
            x={c}
            y={c - 4}
            textAnchor="middle"
            className="fill-slate-900"
            style={{ fontSize: 20, fontWeight: 600 }}
          >
            {centreValue}
          </text>
          <text
            x={c}
            y={c + 14}
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: 11 }}
          >
            {centreLabel ?? "total"}
          </text>
        </>
      ) : null}

      {visible.map((s) => {
        const fraction = s.value / total;
        const dash = fraction * circumference;
        const dashOffset = -offset;
        offset += dash;
        const pct = Math.round(fraction * 100);
        return (
          <g key={s.label} className="group" tabIndex={0}>
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${c} ${c})`}
              className="cursor-default transition-[stroke-width] duration-150 group-hover:[stroke-width:var(--thick)] group-focus-visible:[stroke-width:var(--thick)]"
              style={
                { "--thick": `${thickness + 6}px` } as React.CSSProperties
              }
            />

            {/* Masks the default centre text while this segment is hovered. */}
            <circle
              cx={c}
              cy={c}
              r={inner}
              fill="white"
              className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
            <g className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
              <text
                x={c}
                y={c - 10}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 11 }}
              >
                {s.label}
              </text>
              <text
                x={c}
                y={c + 10}
                textAnchor="middle"
                style={{ fontSize: 17, fontWeight: 600, fill: s.color }}
              >
                {s.display ?? String(s.value)}
              </text>
              <text
                x={c}
                y={c + 26}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 11 }}
              >
                {pct}%
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
