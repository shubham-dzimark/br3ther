/**
 * The "recently viewed" trail.
 *
 * A plain module, not the client component beside it: a value exported from a
 * "use client" file becomes a client reference when a server component imports
 * it, so reading the cookie by that name silently found nothing.
 */
export const VIEWED_COOKIE = "nl_viewed";

/** Thirty days is long enough to be a trail, short enough to stay relevant. */
export const VIEWED_MAX_AGE = 60 * 60 * 24 * 30;

/** How many products the trail remembers. */
export const VIEWED_LIMIT = 12;

/** The slugs in a cookie value, newest first. */
export function readViewed(raw: string | undefined): string[] {
  if (!raw) return [];
  /* The browser writes the list URL-encoded, so the separating commas arrive
     as %2C and splitting the raw value on "," would find nothing. */
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    /* Malformed: fall back to the raw value rather than throwing. */
  }
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, VIEWED_LIMIT);
}
