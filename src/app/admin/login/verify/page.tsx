import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyTwoFactorAction } from "@/app/admin/actions";
import { readChallenge } from "@/lib/two-factor";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
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

  const [{ error }, s] = await Promise.all([searchParams, getSettings()]);

  const brand = s[SETTING_KEYS.adminBrandText] || s[SETTING_KEYS.storeName] || "Br3thr";
  const sidebar = s[SETTING_KEYS.adminSidebarColor] || "#123C5E";
  const accent = s[SETTING_KEYS.adminAccentColor] || "#1A6FB5";

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F1F4F7] px-5 py-12"
      style={
        {
          "--admin-sidebar": sidebar,
          "--admin-accent": accent,
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-[400px]">
        <Link href="/" aria-label={`${brand} home`} className="mb-8 flex w-fit items-center gap-3 transition hover:opacity-80">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black text-[var(--on-colour)]"
            style={{ backgroundColor: "var(--admin-sidebar)" }}
          >
            {brand.charAt(0).toLowerCase()}
          </span>
          <span className="text-xl font-bold tracking-tight text-slate-900">{brand}</span>
        </Link>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-7 shadow-[0_20px_50px_-24px_rgba(15,76,65,0.35)] sm:p-9">
          <span
            className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--admin-accent)", opacity: 0.12 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--admin-accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 15v2" />
            </svg>
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Two-step verification
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Enter the 6-digit code from your authenticator app.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              That code wasn&apos;t right. Codes change every 30 seconds — try the current one.
            </p>
          ) : null}

          <form action={verifyTwoFactorAction} className="mt-7 space-y-4">
            <div>
              <label htmlFor="code" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                Verification code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="000000"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-center text-lg font-semibold tracking-[0.4em] text-slate-900 outline-none transition placeholder:tracking-[0.4em] placeholder:text-slate-300 focus:border-[var(--admin-accent)] focus:ring-4 focus:ring-[var(--admin-accent)]/12"
              />
            </div>

            <SubmitButton
              className="w-full rounded-2xl bg-[var(--admin-btn)] px-5 py-3.5 text-sm font-bold text-[var(--admin-btn-ink)] shadow-lg shadow-[var(--admin-accent)]/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              pendingLabel="Verifying…"
            >
              Verify and sign in
            </SubmitButton>
          </form>

          <p className="mt-5 border-t border-slate-100 pt-5 text-xs leading-relaxed text-slate-500">
            Lost your phone? Enter one of your recovery codes in the box above
            instead. Each one works once.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/admin/login" className="hover:text-slate-600">
            Start over
          </Link>
        </p>
      </div>
    </main>
  );
}
