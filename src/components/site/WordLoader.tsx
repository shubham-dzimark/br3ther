/*
 * BR3THR spelled in self-drawing strokes (after the Uiverse "YOU" loader by
 * SelfMadeSystem): the letters draw on one after another, the whole word
 * holds, then they retract together, on a 3-second loop. The 3 keeps its
 * gradient that turns in steps. Colours are the shop's:
 * ink and Black cherry for the letters, Citrus salt to Black cherry for the 3.
 * With reduced motion the letters are simply drawn in full.
 *
 * Every path uses pathLength="360" so one set of keyframes fits all letters.
 */
const LETTERS: { d: string; grad: string; spin?: boolean }[] = [
  { d: "M16 58 V6 H33 a12 12 0 0 1 0 24 H16 M33 30 a14 14 0 0 1 0 28 H16", grad: "url(#br3-a)" }, // B
  { d: "M16 58 V6 H34 a13 13 0 0 1 0 26 H16 M31 32 L49 58", grad: "url(#br3-a)" }, // R
  { d: "M14 6 H50 V58 H14 M24 32 H50", grad: "url(#br3-b)", spin: true }, // 3 (the wordmark's squared 3)
  { d: "M10 6 H54 M32 6 V58", grad: "url(#br3-c)" }, // T
  { d: "M14 6 V58 M50 6 V58 M14 32 H50", grad: "url(#br3-c)" }, // H
  { d: "M16 58 V6 H34 a13 13 0 0 1 0 26 H16 M31 32 L49 58", grad: "url(#br3-c)" }, // R
];

export function WordLoader({ className = "" }: { className?: string }) {
  return (
    <span className={`wordloader ${className}`} aria-hidden="true">
      <svg width="0" height="0" viewBox="0 0 64 64" className="wordloader__defs">
        <defs>
          <linearGradient id="br3-a" gradientUnits="userSpaceOnUse" x1="0" y1="62" x2="0" y2="2">
            <stop stopColor="#0b0b0b" />
            <stop offset="1" stopColor="#6b1828" />
          </linearGradient>
          <linearGradient id="br3-b" gradientUnits="userSpaceOnUse" x1="0" y1="64" x2="0" y2="0">
            <stop stopColor="#b8a51c" />
            <stop offset="1" stopColor="#6b1828" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              dur="8s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0; 0.125; 0.25; 0.375; 0.5; 0.625; 0.75; 0.875; 1"
              keySplines=".42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1"
              values="0 32 32;-270 32 32;-270 32 32;-540 32 32;-540 32 32;-810 32 32;-810 32 32;-1080 32 32;-1080 32 32"
            />
          </linearGradient>
          <linearGradient id="br3-c" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="62">
            <stop stopColor="#6b1828" />
            <stop offset="1" stopColor="#0b0b0b" />
          </linearGradient>
        </defs>
      </svg>
      {LETTERS.map((l, i) => (
        <svg key={i} viewBox="0 0 64 64" fill="none" className="wordloader__letter">
          <path
            d={l.d}
            stroke={l.grad}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={360}
            className={l.spin ? "wl-spin" : "wl-dash"}
            style={{ animationDelay: `${i * 0.09}s` }}
          />
        </svg>
      ))}
    </span>
  );
}
