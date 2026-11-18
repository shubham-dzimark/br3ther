import type { Metadata } from "next";
import { Public_Sans, Nunito_Sans, Poppins } from "next/font/google";
import "./globals.css";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { mediaSrc } from "@/lib/media-src";

/**
 * Public Sans - the family the Sellzy reference uses. next/font self-hosts it
 * and generates a metric-matched fallback, so the computed stack is:
 *   "Public Sans", "Public Sans Fallback"
 */
const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-site",
  display: "swap",
  /*
   * Not preloaded: the admin is the only place that always renders it, while
   * every storefront page carries the shop's own fonts. Preloading it made
   * each of those pages fetch a font it never drew, which the browser then
   * warns about ("preloaded but not used"). The face is still declared, so
   * the admin - and a shop that picks "Public Sans (classic)" - loads it the
   * moment something is actually set in it.
   */
  preload: false,
});

/*
 * The admin's own pair. Nunito Sans carries the interface text; Poppins, a rounded
 * geometric, is reserved for headings and figures.
 *
 * Both follow Public Sans in not preloading: the storefront never draws them,
 * and preloading a face a page does not use earns a console warning on every
 * shop page. The admin pulls them the moment it renders.
 */
const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-admin",
  display: "swap",
  preload: false,
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-admin-display",
  display: "swap",
  preload: false,
});

/**
 * Title and favicon come from Settings rather than being hard-coded.
 *
 * The favicon used to be app/favicon.ico, a file convention Next turns into
 * its own <link rel="icon">. That tag would have competed with this one and
 * could not be changed without a deploy, so the file now lives in /public as
 * the fallback and the link is emitted here - one icon, chosen in the admin.
 *
 * Wrapped in try/catch because metadata is generated during the build, and a
 * database that is briefly unreachable should cost the shop its custom title,
 * not the whole build.
 */
export async function generateMetadata(): Promise<Metadata> {
  let name = "Br3thr";
  let tagline = "";
  let favicon = "";

  try {
    const s = await getSettings();
    name = s[SETTING_KEYS.storeName]?.trim() || name;
    tagline = s[SETTING_KEYS.storeTagline]?.trim() || "";
    favicon = s[SETTING_KEYS.faviconUrl]?.trim() || "";
  } catch {
    // Fall through to the defaults below.
  }

  const icon = favicon ? mediaSrc(favicon) : "/favicon.ico";

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com",
    ),
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: tagline || `${name} online store`,
    icons: {
      icon,
      shortcut: icon,
      apple: icon,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${nunito.variable} ${poppins.variable}`}
      /* The storefront's pre-paint script adds motion classes here before
         React loads (see StorefrontMotion); that is expected, not a bug. */
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
