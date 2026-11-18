import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { Shell, Field } from "@/components/site/Shell";
import { loginCustomer, registerCustomer } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  missing: "Fill in every field.",
  invalid: "That email and password didn't match.",
  locked: "Too many attempts. Wait a few minutes and try again.",
  weak: "Use a password of at least 8 characters.",
  exists: "There's already an account for that email. Sign in instead.",
};

/**
 * Customer sign-in and account creation on one page. An account keeps every
 * order placed with its email in one list; buying never requires one.
 */
export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; check?: string; changed?: string }>;
}) {
  if (await getCurrentCustomer()) redirect("/account");
  const sp = await searchParams;
  const register = sp.mode === "register";
  const error = sp.error ? ERRORS[sp.error] ?? "Something went wrong. Try again." : null;

  return (
    <Shell>
      <div className="two">
        <div>
          <h1 className="display page__title">{register ? "Create an account" : "Sign in"}</h1>
          <p className="lead muted" style={{ maxWidth: "34ch" }}>
            {register
              ? "Every order placed with your email, in one list. You never need an account to buy."
              : "See your orders and their payment and shipping status."}
          </p>
        </div>

        <div className="panel">
          <nav className="tabs" aria-label="Account">
            <Link href="/account/login" aria-current={register ? undefined : "page"}>Sign in</Link>
            <Link href="/account/login?mode=register" aria-current={register ? "page" : undefined}>Create account</Link>
          </nav>

          {sp.check ? (
            <p className="ok-note" role="status">Check your email. We sent a link to confirm the account.</p>
          ) : null}
          {sp.changed ? <p className="ok-note" role="status">Password changed. Sign in with the new one.</p> : null}
          {error ? <p className="notice" role="alert">{error}</p> : null}

          {register ? (
            <form action={registerCustomer} className="form-narrow" style={{ marginTop: 20 }}>
              <div className="fields" style={{ marginTop: 0 }}>
                <Field label="First name" name="firstName" autoComplete="given-name" />
                <Field label="Last name" name="lastName" autoComplete="family-name" required={false} />
              </div>
              <Field label="Email" name="email" type="email" autoComplete="email" />
              <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." />
              <button className="btn" type="submit" style={{ width: "100%" }}>Create account</button>
            </form>
          ) : (
            <form action={loginCustomer} className="form-narrow" style={{ marginTop: 20 }}>
              <Field label="Email" name="email" type="email" autoComplete="email" />
              <Field label="Password" name="password" type="password" autoComplete="current-password" />
              <button className="btn" type="submit" style={{ width: "100%" }}>Sign in</button>
              <Link className="link small" href="/account/forgot">Forgot your password?</Link>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
