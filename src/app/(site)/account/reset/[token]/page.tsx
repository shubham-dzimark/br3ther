import type { Metadata } from "next";
import Link from "next/link";
import { lookupResetToken } from "@/lib/password-reset";
import { Shell, PageHead, Field } from "@/components/site/Shell";
import { completePasswordReset } from "../../reset-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

const PROBLEMS: Record<string, string> = {
  unknown: "This reset link isn't valid.",
  used: "This reset link has already been used.",
  expired: "This reset link has expired.",
  weak: "Use a password of at least 8 characters.",
  mismatch: "The two passwords don't match.",
};

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  const found = await lookupResetToken(token);

  if (!found.ok) {
    return (
      <Shell>
        <PageHead title="Link not valid" lede={PROBLEMS[found.reason] ?? PROBLEMS.unknown} />
        <Link className="btn" href="/account/forgot">Send a new link</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHead title="Choose a new password" lede={`For ${found.email}.`} />
      <div className="panel" style={{ maxWidth: 560 }}>
        {error ? <p className="notice" role="alert">{PROBLEMS[error] ?? "Something went wrong."}</p> : null}
        <form action={completePasswordReset} className="form-narrow" style={{ marginTop: 16 }}>
          <input type="hidden" name="token" value={token} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." />
          <Field label="Repeat it" name="confirmPassword" type="password" autoComplete="new-password" />
          <button className="btn" type="submit">Save password</button>
        </form>
      </div>
    </Shell>
  );
}
