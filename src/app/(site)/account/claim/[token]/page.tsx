import Link from "next/link";
import type { Metadata } from "next";
import { peekClaimToken } from "@/lib/customer-verify";
import { Shell, PageHead } from "@/components/site/Shell";
import { completeClaim } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your account", robots: { index: false, follow: false } };

/**
 * Confirms a new account from the emailed link. Rendering only checks the
 * token; the button's POST spends it, so a mail scanner opening the link
 * cannot.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = decodeURIComponent(token);
  const status = await peekClaimToken(raw);

  if (status !== "valid") {
    return (
      <Shell>
        <PageHead title="This link has expired" lede="Confirmation links work once and expire after two hours." />
        <Link className="btn" href="/account/login?mode=register">Start again</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHead title="Confirm your account" lede="One press and every order placed with your email is in your account." />
      <form action={completeClaim}>
        <input type="hidden" name="token" value={raw} />
        <button className="btn" type="submit">Confirm my account</button>
      </form>
    </Shell>
  );
}
