import type { Metadata } from "next";
import Link from "next/link";
import { Shell, PageHead, Field } from "@/components/site/Shell";
import { requestPasswordReset } from "../reset-actions";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <Shell>
      <PageHead title="Reset your password" lede="Enter the email on your account and we'll send a link to choose a new password." />
      <div className="panel" style={{ maxWidth: 560 }}>
        {sent ? (
          <p className="ok-note" role="status">If there's an account for that email, the link is on its way. It works for one hour.</p>
        ) : null}
        {error ? <p className="notice" role="alert">Enter a valid email address.</p> : null}
        <form action={requestPasswordReset} className="form-narrow" style={{ marginTop: 16 }}>
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <button className="btn" type="submit">Send the link</button>
          <Link className="link small" href="/account/login">Back to sign in</Link>
        </form>
      </div>
    </Shell>
  );
}
