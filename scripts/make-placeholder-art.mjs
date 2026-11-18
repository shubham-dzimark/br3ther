#!/usr/bin/env node
/*
 * Writes the placeholder artwork the demo catalogue uses.
 *
 * These are drawn here rather than fetched: the shop has no image generator
 * wired up, and a demo that links to a stock-photo host breaks the moment that
 * host rate-limits or disappears. Everything below is plain SVG on disk, so it
 * costs one request, scales to any tile size and can be replaced one file at a
 * time when real photography arrives - the database only ever stores the path.
 *
 *   node scripts/make-placeholder-art.mjs [outDir]
 *
 * Default outDir is public/uploads.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = process.argv[2] ?? path.join(process.cwd(), "public", "uploads");

/* Two-stop grounds, one per category family. Kept low-chroma so a grid of
   twenty-four of them reads as a catalogue rather than a paint chart. */
const GROUNDS = {
  sky:    ["#E3EEF7", "#C9DEEF"],
  mint:   ["#E1F0EA", "#C6E3D7"],
  sand:   ["#F4EDE1", "#E7DAC5"],
  blush:  ["#F6E7E9", "#EBD0D4"],
  lilac:  ["#EAE7F5", "#D6D1EC"],
  citrus: ["#F6F0DC", "#EDE2BC"],
  clay:   ["#F4E7DF", "#E6CFC1"],
  slate:  ["#E9EDF1", "#D3DBE3"],
};

/* Simple line glyphs. Drawn on a 64x64 box, centred in the tile. */
const GLYPHS = {
  bottle: '<path d="M26 8h12v7l5 8v33a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V23l5-8Z"/><path d="M21 33h22"/>',
  pill:   '<rect x="8" y="24" width="48" height="18" rx="9"/><path d="M32 24v18"/>',
  device: '<rect x="12" y="14" width="40" height="30" rx="5"/><path d="M20 52h24M24 44v8M40 44v8"/><path d="M20 26h10l4 8 4-14 4 12h6"/>',
  leaf:   '<path d="M50 12C30 12 16 24 16 42c0 5 2 9 2 9s18 2 26-8c7-9 6-31 6-31Z"/><path d="M18 51C26 40 36 30 46 24"/>',
  drop:   '<path d="M32 8s16 18 16 28a16 16 0 0 1-32 0C16 26 32 8 32 8Z"/>',
  cross:  '<rect x="10" y="18" width="44" height="30" rx="5"/><path d="M32 26v14M25 33h14"/>',
  baby:   '<circle cx="32" cy="26" r="12"/><path d="M14 54c3-9 10-14 18-14s15 5 18 14"/>',
  heart:  '<path d="M32 52S10 39 10 25a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 14-22 27-22 27Z"/>',
  dumbbell: '<path d="M14 24v16M22 20v24M42 20v24M50 24v16M22 32h20"/>',
  brush:  '<path d="M38 10 54 26 30 50H14V34Z"/><path d="M34 14 50 30"/>',
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One tile: ground, soft blob, glyph, optional caption. */
function tile({ w, h, ground, glyph, label = "", ink = "#3C4755" }) {
  const [a, b] = GROUNDS[ground] ?? GROUNDS.slate;
  const s = Math.min(w, h);
  const gs = s * 0.42;                       // glyph box
  const gx = (w - gs) / 2;
  const gy = (h - gs) / 2 - (label ? s * 0.06 : 0);
  const cap = label
    ? `<text x="${w / 2}" y="${h - s * 0.11}" text-anchor="middle" fill="${ink}" fill-opacity="0.62"
         font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-size="${Math.round(s * 0.072)}"
         font-weight="600" letter-spacing="0.02em">${esc(label)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label || "Placeholder")}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.78}" cy="${h * 0.2}" r="${s * 0.26}" fill="#ffffff" fill-opacity="0.34"/>
  <circle cx="${w * 0.17}" cy="${h * 0.84}" r="${s * 0.19}" fill="#ffffff" fill-opacity="0.22"/>
  <g transform="translate(${gx} ${gy}) scale(${gs / 64})" fill="none" stroke="${ink}" stroke-opacity="0.5"
     stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph] ?? GLYPHS.bottle}</g>
  ${cap}
</svg>`;
}

/** Wide hero banner: ground, drifting blobs, no glyph. */
function hero({ ground, heading }) {
  const [a, b] = GROUNDS[ground] ?? GROUNDS.slate;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 640" width="1600" height="640" role="img" aria-label="${esc(heading)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="640" fill="url(#g)"/>
  <circle cx="1240" cy="180" r="260" fill="#ffffff" fill-opacity="0.30"/>
  <circle cx="1430" cy="470" r="170" fill="#ffffff" fill-opacity="0.20"/>
  <circle cx="1060" cy="520" r="110" fill="#ffffff" fill-opacity="0.16"/>
</svg>`;
}

export const CATEGORY_ART = [
  ["vitamins-supplements", "mint", "pill"],
  ["medical-devices", "sky", "device"],
  ["personal-care", "blush", "drop"],
  ["first-aid", "clay", "cross"],
  ["diabetic-care", "slate", "device"],
  ["herbal-natural", "mint", "leaf"],
  ["baby-care", "lilac", "baby"],
  ["fitness-nutrition", "citrus", "dumbbell"],
  ["skin-hair", "blush", "brush"],
  ["elderly-care", "sand", "heart"],
];

const PRODUCT_GLYPHS = ["bottle", "pill", "device", "leaf", "drop", "cross", "heart", "brush"];
const PRODUCT_GROUNDS = Object.keys(GROUNDS);

async function main() {
  await mkdir(OUT, { recursive: true });
  let n = 0;

  for (const [slug, ground, glyph] of CATEGORY_ART) {
    await writeFile(path.join(OUT, `cat-${slug}.svg`), tile({ w: 400, h: 400, ground, glyph }));
    n++;
  }

  // 24 product tiles, cycling ground and glyph so neighbours never match.
  for (let i = 1; i <= 24; i++) {
    const ground = PRODUCT_GROUNDS[i % PRODUCT_GROUNDS.length];
    const glyph = PRODUCT_GLYPHS[(i * 3) % PRODUCT_GLYPHS.length];
    await writeFile(path.join(OUT, `prod-${i}.svg`), tile({ w: 800, h: 800, ground, glyph }));
    n++;
  }

  const heroes = [
    ["hero-1", "sky", "Everyday health, delivered"],
    ["hero-2", "mint", "Supplements that keep up"],
    ["hero-3", "citrus", "Monitors and devices"],
  ];
  for (const [name, ground, heading] of heroes) {
    await writeFile(path.join(OUT, `${name}.svg`), hero({ ground, heading }));
    n++;
  }

  console.log(`wrote ${n} files to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
