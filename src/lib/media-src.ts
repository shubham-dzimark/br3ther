/**
 * Turns an upload path into something `next/image` can actually optimise.
 *
 * Next serves local `/...` paths from a snapshot of `public/` taken at startup,
 * so any file uploaded after the last restart 400s with "The requested resource
 * isn't a valid image" - which broke every newly uploaded picture until the
 * service happened to restart.
 *
 * Uploads are already served by Apache (same reason - the snapshot), so pointing
 * the optimiser at the absolute URL makes it fetch over HTTP and see the file
 * immediately. `remotePatterns` in next.config.ts allows exactly this host and
 * path, and nothing else.
 *
 * Client-safe: uses NEXT_PUBLIC_SITE_URL so client components can call it too.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

export function mediaSrc(url: string): string {
  if (!url.startsWith("/uploads/")) return url;
  if (!SITE_URL) return url;
  return `${SITE_URL}${url}`;
}
