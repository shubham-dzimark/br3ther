/**
 * The shop's public address, from NEXT_PUBLIC_SITE_URL. Shared so previews and
 * links follow the configured domain instead of each file carrying its own.
 * Safe in client components: NEXT_PUBLIC_ values are inlined at build time.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/+$/, "");

/** "br3thr.com" - the host as a search result shows it. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
