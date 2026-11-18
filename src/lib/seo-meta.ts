/**
 * Small helpers behind Settings → SEO and the storefront's <head>.
 *
 * Kept apart from seo-vars, which the admin preview imports in the browser -
 * nothing here needs to run client-side.
 */

export const ROBOTS_CHOICES = ["index,follow", "noindex,follow", "noindex,nofollow"] as const;
export type RobotsChoice = (typeof ROBOTS_CHOICES)[number];

/** The saved robots directive, or "index,follow" for anything unrecognised. */
export function robotsChoice(raw: string | null | undefined): RobotsChoice {
  const v = (raw ?? "").replace(/\s+/g, "").toLowerCase();
  return (ROBOTS_CHOICES as readonly string[]).includes(v) ? (v as RobotsChoice) : "index,follow";
}

/**
 * The Search Console verification code.
 *
 * Google shows it as a whole tag - <meta name="google-site-verification"
 * content="abc…" /> - and people paste the tag, the TXT record form
 * ("google-site-verification=abc…") or the bare code. All three give the code;
 * anything else gives "" so a stray value never reaches the page head.
 */
export function searchConsoleToken(raw: string | null | undefined): string {
  let v = (raw ?? "").trim();
  const tag = v.match(/content\s*=\s*["']([^"']*)["']/i);
  if (tag) v = tag[1].trim();
  v = v.replace(/^google-site-verification\s*[=:]\s*/i, "");
  return /^[A-Za-z0-9_-]{10,128}$/.test(v) ? v : "";
}

/** Shorten to a word boundary for a meta description. */
export function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/**
 * JSON-LD for a <script> tag. "<" is escaped so a product name containing
 * "</script>" cannot end the tag early.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
