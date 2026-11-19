import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyTwoFactorAction } from "@/app/admin/actions";
import { readChallenge } from "@/lib/two-factor";
import { AuthFrame } from "@/components/site/AuthFrame";
import { SubmitButton } from "@/components/admin/SubmitButton";

export const metadata: Metadata = {
  title: "Two-step verification",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // No valid challenge means no password was accepted, so there is nothing to
  // verify - back to the start rather than showing a code box to a stranger.
  if (!(await readChallenge())) redirect("/admin/login");

  const { error } = await searchParams;

  return (
    <AuthFrame
      kicker="Br3thr admin"
      title="Two-step check"
      lede="Enter the 6-digit code from your authenticator app."
      foot={
        <>
          <span>Lost your phone? Enter one of your recovery codes instead. Each one works once.</span>
          <Link href="/admin/login" className="link">Start over</Link>
        </>
      }
    >
      {error ? (
        <p role="alert" className="notice">
          That code wasn&apos;t right. Codes change every 30 seconds, so try the current one.
        </p>
      ) : null}
      <form action={verifyTwoFactorAction} className="authframe__form form-narrow" style={{ maxWidth: "none" }}>
        <div className="field">
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            placeholder="000000"
            className="codefield"
          />
        </div>
        <SubmitButton className="btn authframe__submit" pendingLabel="Verifying…">
          Verify and sign in
        </SubmitButton>
      </form>
    </AuthFrame>
  );
}
