import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/admin/actions";
import { getSessionUser } from "@/lib/auth";
import { adminFontVariables } from "@/lib/admin-fonts";
import { ADMIN_SCHEME_COOKIE, parseSchemePref, SCHEME_BOOT_SCRIPT } from "@/lib/admin-scheme";
import { AdminLoginFields } from "./AdminLoginForm";
import "@/components/admin/contact-sheet.css";

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

/**
 * Staff sign-in, in the admin's Contact Sheet theme: the film-black rail
 * widened into the left half with the BR3THR mark, the white sheet on the right
 * with the form. Follows the same light/dark choice as the admin.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/admin");
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? "Sign in failed.") : null;
  const pref = parseSchemePref((await cookies()).get(ADMIN_SCHEME_COOKIE)?.value);

  return (
    <div
      data-admin=""
      data-cs=""
      data-scheme={pref === "dark" ? "dark" : "light"}
      data-scheme-pref={pref}
      suppressHydrationWarning
      className={`grid min-h-[100svh] bg-[var(--admin-canvas)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] ${adminFontVariables}`}
    >
      <script dangerouslySetInnerHTML={{ __html: SCHEME_BOOT_SCRIPT }} />

      {/* The film edge */}
      <section className="adm-rail relative hidden flex-col justify-between p-12 text-white lg:flex" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/br3thr/wordmark-reversed.svg" alt="" className="h-6 w-auto self-start" />
        <div className="flex items-end gap-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/br3thr/icon-reversed.svg" alt="" className="h-[clamp(160px,22vw,300px)] w-auto" />
          <p className="max-w-[24ch] pb-3 text-[22px] font-semibold leading-snug text-white/90">
            Orders, stock and support for the one product Br3thr makes.
          </p>
        </div>
        <p className="text-[13px] text-white/55">© {new Date().getFullYear()} Br3thr</p>
      </section>

      {/* The sheet */}
      <main className="flex items-center justify-center px-5 py-14 sm:px-10">
        <div className="w-full max-w-[400px]">
          <Link href="/" aria-label="Br3thr home" className="mb-10 block w-fit lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/br3thr/icon-reversed.svg" alt="" className="h-14 w-auto rounded-[var(--admin-radius-sm)] bg-[#0b0b0b] p-2" />
          </Link>

          <h1 className="adm-display text-[40px] font-bold leading-none text-slate-900">Staff sign in</h1>
          <p className="mt-3 text-[15px] text-slate-600">The Br3thr admin. Use the email your account was created with.</p>

          {message ? (
            <p role="alert" className="mt-7 rounded-[var(--admin-radius-sm)] bg-red-50 px-4 py-3 text-[14px] font-medium text-red-700">
              {message}
            </p>
          ) : null}

          <form action={loginAction} className="mt-8">
            <AdminLoginFields />
          </form>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
            <span>Signed out when idle or when the browser closes.</span>
            <Link href="/" className="font-semibold text-slate-800 underline-offset-4 hover:underline">
              Back to the shop
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
