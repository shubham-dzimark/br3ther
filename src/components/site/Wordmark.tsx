import { GAP, GLYPHS, type Glyph } from "./glyphs";

type Letter = keyof typeof GLYPHS;

/** One letter of the BR3THR wordmark at cap height 120 units. */
export function GlyphSvg({ letter, className }: { letter: Letter; className?: string }) {
  const g: Glyph = GLYPHS[letter];
  return (
    <svg viewBox={`0 0 ${g.w} 120`} className={className} aria-hidden="true" focusable="false" fill="currentColor">
      {g.paths.map((p, i) => (
        <path key={i} d={p.d} fillRule={p.evenodd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}

/** A run of letters as one SVG, spaced like the logo. */
export function WordSvg({
  letters,
  className,
  title,
}: {
  letters: Letter[];
  className?: string;
  /** Accessible name; omit when the word is decorative. */
  title?: string;
}) {
  const offsets = letters.map((_, i) =>
    letters.slice(0, i).reduce((sum, l) => sum + GLYPHS[l].w + GAP, 0),
  );
  const x = letters.length ? offsets[letters.length - 1] + GLYPHS[letters[letters.length - 1]].w : 0;
  const parts = letters.map((l, i) => {
    const g = GLYPHS[l];
    const at = offsets[i];
    return (
      <g key={i} transform={`translate(${at},0)`}>
        {g.paths.map((p, j) => (
          <path key={j} d={p.d} fillRule={p.evenodd ? "evenodd" : undefined} />
        ))}
      </g>
    );
  });
  return (
    <svg
      viewBox={`0 0 ${x} 120`}
      className={className}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {parts}
    </svg>
  );
}

export const BR3THR: Letter[] = ["B", "R", "3", "T", "H", "R"];
