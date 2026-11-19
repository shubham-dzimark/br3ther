import { Archivo_Black, DM_Mono, Red_Hat_Display, Red_Hat_Text } from "next/font/google";
import "@/components/site/site.css";

/*
 * The one-page Br3thr site and its follow-up pages (receipt, crypto payment,
 * order tracking, account). Archivo Black sets the poster-size display lines
 * (flavour names, section heads), Red Hat Display the smaller headings, Red
 * Hat Text everything read, and DM Mono the small captions and counters.
 */
const poster = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-poster", display: "swap" });
const display = Red_Hat_Display({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-display", display: "swap" });
const text = Red_Hat_Text({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-text", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`site ${poster.variable} ${display.variable} ${text.variable} ${mono.variable}`}>{children}</div>;
}
