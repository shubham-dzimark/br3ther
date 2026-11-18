import { getSettings, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Sitemap for search engines. The shop is one page (2026-11-18), so the map
 * lists that page and the one public tool beside it. It can still be switched
 * off in Settings → SEO for a store not ready to be indexed.
 */
export async function GET(): Promise<Response> {
  const settings = await getSettings();
  if (settings[SETTING_KEYS.sitemapEnabled] === "0") {
    return new Response("Sitemap is disabled.", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, "");
  const entries = [
    { loc: "/", priority: "1.0" },
    { loc: "/track-order", priority: "0.3" },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>\n    <loc>${base}${e.loc}</loc>\n    <priority>${e.priority}</priority>\n  </url>`).join("\n")}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
