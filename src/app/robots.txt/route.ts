import { getSettings, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * robots.txt, driven by the same SEO settings. When indexing is set to
 * noindex the file disallows everything, so the two controls cannot disagree.
 */
export async function GET(): Promise<Response> {
  const settings = await getSettings();
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(
    /\/$/,
    "",
  );

  const noindex = (settings[SETTING_KEYS.seoRobots] ?? "").includes("noindex");
  const sitemapOn = settings[SETTING_KEYS.sitemapEnabled] !== "0";

  const lines = [
    "User-agent: *",
    noindex ? "Disallow: /" : "Disallow: /admin",
    !noindex ? "Disallow: /account" : null,
    !noindex ? "Disallow: /checkout" : null,
    !noindex ? "Disallow: /cart" : null,
    "",
    sitemapOn && !noindex ? `Sitemap: ${base}/sitemap.xml` : null,
  ].filter((l) => l !== null);

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
