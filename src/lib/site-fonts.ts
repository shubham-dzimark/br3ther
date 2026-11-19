import { Archivo_Black, DM_Mono, Red_Hat_Display, Red_Hat_Text } from "next/font/google";

/*
 * The shop's typefaces, shared by the one-page site, its follow-up pages and
 * the staff sign-in. Archivo Black sets the poster-size display lines, Red Hat
 * Display the smaller headings, Red Hat Text everything read, and DM Mono the
 * small captions and counters.
 */
const poster = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-poster", display: "swap" });
const display = Red_Hat_Display({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-display", display: "swap" });
const text = Red_Hat_Text({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-text", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const siteFontVariables = `${poster.variable} ${display.variable} ${text.variable} ${mono.variable}`;
