/**
 * Payment gateway marks for the admin.
 *
 * Drawn tiles in each method's familiar colours rather than bundled trademark
 * artwork - the same approach as the carrier badges - so they stay sharp at any
 * size and need no licensed files.
 */
export function GatewayIcon({
  gateway,
  size = 44,
}: {
  gateway: string;
  size?: number;
}) {
  if (gateway === "emt") {
    return (
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-xl bg-[#FDB913] text-[#1A1A1A] shadow-sm ring-1 ring-black/5"
        style={{ width: size, height: size }}
      >
        {/* An envelope with a transfer arrow: e-Transfer. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.55, height: size * 0.55 }}>
          <rect x="2.5" y="5" width="15" height="11" rx="2" />
          <path d="m2.5 7 7.5 5 7.5-5" />
          <path d="M14 19.5h7.5M18.5 16.5l3 3-3 3" />
        </svg>
      </span>
    );
  }

  if (gateway === "crypto") {
    return (
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-xl text-[var(--on-colour)] shadow-sm ring-1 ring-black/5"
        style={{
          width: size,
          height: size,
          backgroundImage: "linear-gradient(135deg, #F7931A 0%, #E6007E 55%, #7B2FF7 100%)",
        }}
      >
        {/* A coin with the ₿ mark: crypto. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.58, height: size * 0.58 }}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.5 7.5v9M9.5 7.5h3.3a2.1 2.1 0 0 1 0 4.2H9.5M9.5 11.7h3.8a2.4 2.4 0 0 1 0 4.8H9.5M11 6v1.5M11 16.5V18M13 6v1.5M13 16.5V18" />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-black/5"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.55, height: size * 0.55 }}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
        <path d="M2.5 10h19M6.5 15h3" />
      </svg>
    </span>
  );
}
