import type { NextConfig } from "next";

// The optimiser fetches uploads from the shop's own public address, so the
// allowed host follows NEXT_PUBLIC_SITE_URL rather than being pinned to a domain.
const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com");

const nextConfig: NextConfig = {
  images: {
    // Uploads are large originals (the hero was a 2.2 MB JPEG). Serving them
    // through the optimiser cuts them to a fraction and picks a modern format.
    formats: ["image/avif", "image/webp"],
    /*
     * Uploads are referenced by absolute URL so the optimiser fetches them from
     * Apache rather than Next's startup snapshot of public/ - see
     * src/lib/media-src.ts. Narrow on purpose: this host, this path, nothing else.
     */
    remotePatterns: [
      {
        protocol: SITE.protocol === "http:" ? "http" : "https",
        hostname: SITE.hostname,
        pathname: "/uploads/**",
      },
    ],
    // A year - filenames are UUIDs, so a URL's bytes never change.
    minimumCacheTTL: 31536000,
    // Local development only: Next 16 refuses to optimise images fetched from
    // a private IP, and locally the uploads are served from localhost.
    dangerouslyAllowLocalIP: ["localhost", "127.0.0.1"].includes(SITE.hostname),
  },
  /*
   * pdfkit ships an ESM build that pulls fontkit, whose module re-exports a
   * helper Turbopack cannot resolve - the bundle fails outright. Leaving the
   * package external means Node requires it at runtime, which is how it is
   * meant to be consumed on the server anyway.
   */
  // imapflow/mailparser (chat email replies) load optional modules at runtime,
  // so they are required from node_modules rather than bundled.
  serverExternalPackages: ["pdfkit", "imapflow", "mailparser"],
  // Hides the "X-Powered-By: Next.js" banner. Trivial on its own, but there is
  // no reason to advertise the framework and version to a scanner.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          /*
           * HSTS. Apache already redirects http to https, but a redirect still
           * involves one plaintext request that can be intercepted. This tells
           * the browser never to try http for this host again.
           *
           * Two years, subdomains included. Not submitted for preload, which is
           * effectively irreversible.
           */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Stops a browser second-guessing Content-Type - the trick that turns
          // an uploaded "image" into a script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer leaks the full URL to third parties by default; admin URLs
          // carry order ids and search terms.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here needs a camera, a microphone or a location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          /*
           * A deliberately partial CSP.
           *
           * frame-ancestors, base-uri, form-action and object-src are the
           * directives that stop clickjacking, base-tag injection and form
           * hijacking, and none of them affect how the app runs. script-src is
           * left out on purpose: Next inlines its own bootstrap scripts, so a
           * script policy needs per-request nonces, and shipping a broken CSP
           * that has to be relaxed to 'unsafe-inline' buys nothing. That is a
           * separate change, not a line in this list.
           */
          {
            key: "Content-Security-Policy",
            value: [
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
      {
        // The admin is stricter: never framed, never indexed, never cached by
        // a shared proxy.
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
        ],
      },
    ];
  },

  /*
   * The Pay Portal was built against the WooCommerce plugin, which WordPress
   * serves at a fixed /wp-json/ipp-sync/v1/... path. The portal derives that
   * address from the site URL alone and has no field for another one, so
   * without these its "transfer complete" callbacks landed on a 404. Both the
   * pretty-permalink form and WordPress's ?rest_route= form are answered.
   */
  /*
   * The old multi-page storefront was replaced by one page (2026-11-18). Its
   * addresses still appear in old emails, search results and admin links, so
   * each one lands somewhere useful instead of a 404. Temporary (307) on
   * purpose, in case any of them comes back.
   */
  async redirects() {
    const toHome = ["/shop", "/shop/:path*", "/products", "/products/:path*", "/blog", "/blog/:path*",
      "/reviews", "/referral", "/contact", "/lab-results", "/pages/:path*", "/cart", "/cart/:path*"];
    return [
      ...toHome.map((source) => ({ source, destination: "/", permanent: false })),
      { source: "/checkout", destination: "/#buy", permanent: false },
      {
        source: "/account/:section(orders|addresses|details|notifications|payment-methods|points|referrals|reviews|wishlist)",
        destination: "/account",
        permanent: false,
      },
      { source: "/account/register", destination: "/account/login?mode=register", permanent: false },
    ];
  },

  async rewrites() {
    const portalRoutes = ["update-order", "get-order"];
    return {
      beforeFiles: portalRoutes.flatMap((name) => [
        { source: `/wp-json/ipp-sync/v1/${name}`, destination: `/api/portal/${name}` },
        {
          source: "/",
          has: [{ type: "query" as const, key: "rest_route", value: `/ipp-sync/v1/${name}/?` }],
          destination: `/api/portal/${name}`,
        },
      ]),
    };
  },

  experimental: {
    // Media uploads go through server actions, whose body cap is 1 MB by
    // default - well under the 5.1 MB video limit the admin advertises.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
