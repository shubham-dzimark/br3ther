import "server-only";
import { prisma } from "@/lib/prisma";
import type { CustomFont } from "@/generated/prisma";

/**
 * Uploaded web fonts.
 *
 * The family name is written straight into a stylesheet, so it is the one
 * value here that has to be constrained: an unfiltered name could close the
 * @font-face block and inject arbitrary rules. Letters, digits, spaces and
 * hyphens are enough for every real font name and can't escape a quoted
 * string.
 */

export const FONT_FORMATS: Record<string, { ext: string; format: string }> = {
  woff2: { ext: ".woff2", format: "woff2" },
  woff: { ext: ".woff", format: "woff" },
  ttf: { ext: ".ttf", format: "truetype" },
  otf: { ext: ".otf", format: "opentype" },
};

export const FONT_MAX_BYTES = 3_000_000;

export function sanitizeFamily(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9 \-_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Identify a font by its magic bytes rather than the browser's MIME guess.
 *
 * Browsers report .ttf and .otf inconsistently - often as
 * application/octet-stream - so trusting file.type would reject valid fonts
 * and accept anything renamed. The first four bytes are unambiguous.
 */
export function sniffFontFormat(head: Uint8Array): keyof typeof FONT_FORMATS | null {
  const tag = String.fromCharCode(...head.slice(0, 4));
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "otf";
  // TrueType: version 1.0 as 0x00010000, or the legacy 'true' tag.
  if (tag === "true" || tag === "ttcf") return "ttf";
  if (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00) {
    return "ttf";
  }
  return null;
}

export const FONT_WEIGHTS = [
  { value: 100, label: "100 Thin" },
  { value: 200, label: "200 Extra light" },
  { value: 300, label: "300 Light" },
  { value: 400, label: "400 Regular" },
  { value: 500, label: "500 Medium" },
  { value: 600, label: "600 Semi bold" },
  { value: 700, label: "700 Bold" },
  { value: 800, label: "800 Extra bold" },
  { value: 900, label: "900 Black" },
] as const;

export async function listFonts(): Promise<CustomFont[]> {
  return prisma.customFont.findMany({
    orderBy: [{ family: "asc" }, { weight: "asc" }, { style: "asc" }],
  });
}

/** Distinct families, each with the files it has, for the pickers. */
export function groupFamilies(fonts: CustomFont[]): { family: string; files: CustomFont[] }[] {
  const map = new Map<string, CustomFont[]>();
  for (const f of fonts) {
    const list = map.get(f.family) ?? [];
    list.push(f);
    map.set(f.family, list);
  }
  return [...map.entries()].map(([family, files]) => ({ family, files }));
}

/**
 * @font-face rules for every uploaded file.
 *
 * font-display:swap so text is readable while the font downloads - a blank
 * page for a second is worse than a moment of the fallback face.
 */
export function fontFaceCss(fonts: CustomFont[]): string {
  return fonts
    .map((f) => {
      const family = sanitizeFamily(f.family);
      if (!family) return "";
      return `@font-face{font-family:"${family}";src:url("${f.url}") format("${f.format}");font-weight:${f.weight};font-style:${f.style};font-display:swap;}`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * The variable overrides that put a chosen family to work.
 *
 * --font-site is what globals.css already feeds into --font-sans, so setting
 * it re-fonts the whole storefront without touching a component. Headings get
 * their own rule only when a different family is chosen for them.
 */
export function fontVariableCss(bodyFamily: string, headingFamily: string): string {
  const body = sanitizeFamily(bodyFamily);
  const heading = sanitizeFamily(headingFamily);
  const parts: string[] = [];

  if (body) parts.push(`:root{--font-site:"${body}";}`);
  if (heading) {
    parts.push(
      `h1,h2,h3,h4,h5,h6{font-family:"${heading}",var(--font-sans);}`,
    );
  }
  return parts.join("");
}
