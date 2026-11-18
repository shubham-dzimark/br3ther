import type { Metadata } from "next";
import Link from "next/link";
import { suppressEmail, verifyUnsubscribe } from "@/lib/abandoned-cart";
import { Shell, PageHead } from "@/components/site/Shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/**
 * One-click unsubscribe from marketing email: acted on when opened (CASL wants
 * it easy). The token is signed per address, so it can't unsubscribe anyone else.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ email?: string; t?: string }> }) {
  const { email = "", t = "" } = await searchParams;
  const valid = Boolean(email && t && (await verifyUnsubscribe(email, t)));
  if (valid) await suppressEmail(email);

  return (
    <Shell>
      <PageHead
        title={valid ? "You're unsubscribed" : "That link isn't valid"}
        lede={
          valid
            ? `We won't send marketing email to ${email} again. Receipts, payment details and shipping updates still come, because you need them.`
            : "It may have been changed on the way here. Use the link in the email exactly as it is, or write to help@br3thr.com."
        }
      />
      <Link className="btn" href="/">Back to the shop</Link>
    </Shell>
  );
}
