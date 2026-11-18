import { Red_Hat_Display, Red_Hat_Text } from "next/font/google";
import "@/components/site/site.css";

/*
 * The one-page Br3thr site and its follow-up pages (receipt, crypto payment,
 * order tracking, account). Red Hat Display at its black weight carries the
 * headings; Red Hat Text carries everything read.
 */
const display = Red_Hat_Display({ subsets: ["latin"], weight: ["800", "900"], variable: "--font-display", display: "swap" });
const text = Red_Hat_Text({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-text", display: "swap" });

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${display.variable} ${text.variable}`}>
      {/* The wordmark font draws the hero; fetch it with the page, not after the CSS. */}
      <link rel="preload" href="/site/br3thr-display.woff" as="font" type="font/woff" crossOrigin="" />
      {children}
    </div>
  );
}
