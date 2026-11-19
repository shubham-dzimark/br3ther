import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/admin/actions";
import { getSessionUser } from "@/lib/auth";
import { AuthFrame } from "@/components/site/AuthFrame";
import { AdminLoginFields } from "./AdminLoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  invalid: "That email and password combination didn't match.",
  missing: "Enter both an email and a password.",
  // Deliberately vague about which limit was hit and for how long - a precise
  // countdown is a tuning aid for whoever is doing the guessing.
  locked: "Too many failed attempts. Wait a few minutes before trying again.",
  ip: "Sign-in is not allowed from this network.",
  expired: "That took too long. Enter your email and password again.",
  idle: "You were signed out because the admin wasn't used for a while. Sign in again.",
};

/** Staff sign-in, in the shop's design (see AuthFrame). The sign-in itself is loginAction, unchanged. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/admin");
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? "Sign in failed.") : null;

  return (
    <AuthFrame
      kicker="Br3thr admin"
      title="Staff sign in"
      lede="Use the email your account was created with."
      foot={
        <>
          <span>Signed out when idle or when the browser closes.</span>
          <Link href="/" className="link">Back to the shop</Link>
        </>
      }
    >
      {message ? <p role="alert" className="notice">{message}</p> : null}
      <form action={loginAction} className="authframe__form">
        <AdminLoginFields />
      </form>
    </AuthFrame>
  );
}
