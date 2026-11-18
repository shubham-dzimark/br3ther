import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";

/*
 * The admin's two faces (Contact Sheet theme, see DESIGN.md).
 *
 * Schibsted Grotesk sets everything people read: navigation, headings, forms,
 * tables. JetBrains Mono is kept for data that is read character by character:
 * order numbers, SKUs, codes, counts and dates in the edge-code labels.
 * Imported by the admin layout only, so neither reaches the storefront.
 */
const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cs-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-cs-mono",
  display: "swap",
});

export const adminFontVariables = `${grotesk.variable} ${mono.variable}`;
