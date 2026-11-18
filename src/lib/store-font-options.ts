/**
 * Built-in storefront typefaces - the "logo theme" pairing and the alternatives
 * offered in Settings > Fonts - plus the CSS that puts the chosen pair to work.
 *
 * Deliberately free of next/font imports: the admin font picker reads this list,
 * and importing the loaders there would ship every storefront font to the admin
 * panel. The loaders live in store-fonts.ts, imported by the storefront only.
 *
 * Values are hyphenated ("builtin-bungee") because saved font names go through
 * sanitizeFamily(), which strips anything but letters, digits, spaces, - and _.
 */

export type BuiltinFont = { value: string; label: string; cssVar: string };

export const BUILTIN_BODY_FONTS: BuiltinFont[] = [
  { value: "builtin-dm-sans", label: "DM Sans (default)", cssVar: "--font-dm-sans" },
  { value: "builtin-inter", label: "Inter", cssVar: "--font-inter" },
  { value: "builtin-space-grotesk", label: "Space Grotesk", cssVar: "--font-space-grotesk" },
  { value: "builtin-public-sans", label: "Public Sans (classic)", cssVar: "--font-site" },
  // Variable weight, so it lives here and not with the single-weight display
  // faces, whose rule pins headings to 400.
  { value: "builtin-montserrat", label: "Montserrat (geometric)", cssVar: "--font-montserrat" },
  { value: "builtin-playfair", label: "Playfair Display (serif)", cssVar: "--font-playfair" },
];

/** Chunky display faces in the spirit of the logo lettering. Single-weight. */
export const BUILTIN_DISPLAY_FONTS: BuiltinFont[] = [
  { value: "builtin-anton", label: "Anton (condensed)", cssVar: "--font-anton" },
  { value: "builtin-bungee", label: "Bungee (logo theme)", cssVar: "--font-bungee" },
  { value: "builtin-titan-one", label: "Titan One", cssVar: "--font-titan-one" },
  { value: "builtin-russo-one", label: "Russo One", cssVar: "--font-russo-one" },
  { value: "builtin-lilita-one", label: "Lilita One", cssVar: "--font-lilita-one" },
];

export const DEFAULT_BODY_FONT = "builtin-dm-sans";
/*
 * One family for the whole storefront: headings are the body face at a heavier
 * weight, not a second typeface. Was Bungee, then Playfair for headings.
 */
export const DEFAULT_HEADING_FONT = "same";
/** Heading setting value meaning "use the body font for headings too". */
export const HEADING_SAME_AS_BODY = "same";

const ALL = [...BUILTIN_BODY_FONTS, ...BUILTIN_DISPLAY_FONTS];

const clean = (raw: string) =>
  raw.replace(/[^A-Za-z0-9 \-_]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

/*
 * Outfit was the body face until 2026-09-14, when the user had it replaced by
 * Inter everywhere. A shop that saved "builtin-outfit" gets Inter too, so no
 * page keeps the old face just because of an old setting.
 */
const RETIRED: Record<string, string> = { "builtin-outfit": "builtin-inter" };

/** A CSS font-family value for a saved setting: a built-in var() or a quoted uploaded family. */
function familyFor(saved: string): string | null {
  const value = RETIRED[saved] ?? saved;
  const builtin = ALL.find((f) => f.value === value);
  if (builtin) return `var(${builtin.cssVar})`;
  const family = clean(value);
  return family ? `"${family}"` : null;
}

/**
 * Storefront font rules, scoped to .nl-store so the admin keeps its own face.
 * An empty setting means the logo-theme default. Headings cover page and
 * section titles (h1, h2) plus anything marked .nl-display; product names are
 * h3 and stay in the body face, where a display font would be hard to read.
 */
export function storefrontFontCss(bodySetting: string, headingSetting: string): string {
  const body = familyFor(bodySetting || DEFAULT_BODY_FONT) ?? "var(--font-dm-sans)";
  const headingValue = headingSetting || DEFAULT_HEADING_FONT;
  const heading =
    headingValue === HEADING_SAME_AS_BODY ? body : (familyFor(headingValue) ?? body);
  // The built-in display faces ship one weight; asking for bold makes the
  // browser smear a fake one, so they are pinned to their real weight.
  const singleWeight = BUILTIN_DISPLAY_FONTS.some((f) => f.value === headingValue);

  return (
    `.nl-store{--font-sans:${body},ui-sans-serif,system-ui,sans-serif;font-family:var(--font-sans);}` +
    `.nl-store :is(h1,h2,h3,h4,h5,h6,.nl-display){font-family:${heading},var(--font-sans);` +
    // Every heading is bold (user request, 2026-10-02). Unlayered, so it
    // beats a font-medium/font-semibold utility on the element itself.
    (singleWeight ? "font-weight:400;font-synthesis:none;letter-spacing:0.01em;" : "font-weight:700;") +
    "overflow-wrap:anywhere;}"
  );
}
