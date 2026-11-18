import Link from "next/link";
import type { Metadata } from "next";
import { Shell, PageHead } from "@/components/site/Shell";

export const metadata: Metadata = { title: "Link not valid", robots: { index: false, follow: false } };

export default function ClaimInvalidPage() {
  return (
    <Shell>
      <PageHead title="That link didn't work" lede="It may have been used already or expired. Start again and we'll send a fresh one." />
      <Link className="btn" href="/account/login?mode=register">Start again</Link>
    </Shell>
  );
}
