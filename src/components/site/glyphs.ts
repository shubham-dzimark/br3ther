/*
 * The BR3THR wordmark's letters as SVG paths (cap height 120 units), generated
 * from brand/logo/build_concepts.py so the site uses the logo's own drawing.
 * Regenerate rather than edit by hand.
 */
export type Glyph = { w: number; paths: { d: string; evenodd: boolean }[] };

export const GLYPHS: Record<"B" | "R" | "3" | "T" | "H", Glyph> = {
  "B": {
    "w": 90,
    "paths": [
      {
        "d": "M0,0 H52 A28,28 0 0 1 52,56 H58 A32,32 0 0 1 58,120 H0 Z M24,24 H45 A10.5,10.5 0 0 1 45,45 H24 Z M24,67 H52 A14.5,14.5 0 0 1 52,96 H24 Z",
        "evenodd": true
      }
    ]
  },
  "R": {
    "w": 96,
    "paths": [
      {
        "d": "M0,0 H50 A33,33 0 0 1 50,66 H24 V120 H0 Z M24,24 H50 A9,9 0 0 1 50,42 H24 Z",
        "evenodd": true
      },
      {
        "d": "M44,60 H70 L96,120 H70 Z",
        "evenodd": false
      }
    ]
  },
  "3": {
    "w": 82,
    "paths": [
      {
        "d": "M0,0 H82 V120 H0 V96 H58 V72 H14 V48 H58 V24 H0 Z",
        "evenodd": false
      }
    ]
  },
  "T": {
    "w": 88,
    "paths": [
      {
        "d": "M0,0 H88 V24 H56 V120 H32 V24 H0 Z",
        "evenodd": false
      }
    ]
  },
  "H": {
    "w": 88,
    "paths": [
      {
        "d": "M0,0 H24 V48 H64 V0 H88 V120 H64 V72 H24 V120 H0 Z",
        "evenodd": false
      }
    ]
  }
};

/** Letter gaps in glyph units, as in the logo files. */
export const GAP = 14;
