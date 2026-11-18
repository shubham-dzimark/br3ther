import { Anton, Bungee, Cinzel, Cormorant_Garamond, DM_Sans, Inter, Kaushan_Script, Lilita_One, Montserrat, Playfair_Display, Russo_One, Space_Grotesk, Titan_One } from "next/font/google";

/**
 * next/font loaders for the storefront's built-in faces (see
 * store-font-options.ts for the list and the CSS that applies them). Imported by
 * the storefront layout only, so none of these reach the admin panel.
 *
 * The logo-theme defaults are preloaded; the alternatives load only when a page
 * actually uses them.
 */
const bungee = Bungee({ weight: "400", subsets: ["latin"], variable: "--font-bungee", display: "swap" });
// Body text. Inter replaced Outfit site-wide on 2026-09-14 (user request).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
/*
 * DM Sans - the storefront's own face since 2026-10-01. One family for the
 * whole shop: body, headings and the display blocks that used to be set in a
 * serif. Preloaded, because it draws everything above the fold.
 */
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const titanOne = Titan_One({ weight: "400", subsets: ["latin"], variable: "--font-titan-one", display: "swap", preload: false });
const russoOne = Russo_One({ weight: "400", subsets: ["latin"], variable: "--font-russo-one", display: "swap", preload: false });
const lilitaOne = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita-one", display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap", preload: false });
// Preloaded: it draws the hero wordmark, which is the largest thing on the page
// and the first thing a visitor sees, so swapping it in late is very visible.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
// Preloaded: the showcase hero's headline and its script accent word are the
// first thing on the page, and a late swap on either is very visible.
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const kaushan = Kaushan_Script({ weight: "400", subsets: ["latin"], variable: "--font-kaushan", display: "swap" });
// The showcase hero's serif headline (the reference sets it in a Playfair-like face).
const playfair = Playfair_Display({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-playfair", display: "swap" });

/*
 * Cormorant Garamond - the main headings and the hero headline (2026-10-21,
 * user request; it replaced Nosifer). Google Fonts, OFL. Preloaded: it draws
 * the hero headline, the first thing on the page.
 */
const cormorant = Cormorant_Garamond({
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

/*
 * Cinzel - the Br3thr storefront's display face (headline, section titles).
 * Preloaded: it draws the hero headline.
 */
const cinzel = Cinzel({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-cinzel", display: "swap" });

/** Class names that define every --font-* variable, for the storefront wrapper. */
export const storeFontVariables = [bungee, inter, dmSans, titanOne, russoOne, lilitaOne, spaceGrotesk, anton, montserrat, kaushan, playfair, cormorant, cinzel]
  .map((f) => f.variable)
  .join(" ");

/** Just the Br3thr pair, for the admin when it wears the Br3thr theme. */
export const gfFontVariables = [montserrat, cinzel].map((f) => f.variable).join(" ");
