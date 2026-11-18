import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listSessions, requireAdmin } from "@/lib/auth";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getSecurityConfig } from "@/lib/login-guard";
import { otpauthUri, qrSvg } from "@/lib/totp";
import { recoveryCodesLeft } from "@/lib/two-factor";
import { describeDevice } from "@/lib/security-mail";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary, btnGhost, btnDanger, thCls, tdCls } from "@/components/admin/ui";
import {
  beginEnrolment,
  cancelEnrolment,
  confirmEnrolmentAction,
  disableTwoFactorAction,
  revokeOtherSessions,
  revokeOwnSession,
} from "./actions";
import { getTimeZone } from "@/lib/timezone";

export const metadata: Metadata = { title: "My security" };
export const dynamic = "force-dynamic";

function when(d: Date, timeZone: string): string {
  return d.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

export default async function MySecurityPage({
  searchParams,
}: {
  searchParams: Promise<{
    setup?: string;
    codes?: string;
    error?: string;
    saved?: string;
    detail?: string;
    enrol?: string;
  }>;
}) {
  /*
   * The one page an unenrolled admin may reach while the shop requires
   * two-factor - without this exemption it would redirect to itself.
   */
  const [sp, me] = await Promise.all([
    searchParams,
    requireAdmin({ allowUnenrolled: true }),
  ]);
  const tz = await getTimeZone();

  const [user, sessions, attempts, codesLeft, settings, config] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { id: me.id },
      select: { email: true, name: true, totpSecret: true, totpEnabledAt: true },
    }),
    listSessions(me.id),
    prisma.loginAttempt.findMany({
      where: { email: me.email },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    recoveryCodesLeft(me.id),
    getSettings(),
    getSecurityConfig(),
  ]);

  const enabled = Boolean(user?.totpEnabledAt);
  const setupMode = sp.setup === "1" && Boolean(user?.totpSecret) && !enabled;
  const freshCodes = sp.codes ? sp.codes.split(",").filter(Boolean) : [];

  const issuer = settings[SETTING_KEYS.storeName] || "Br3thr";
  const uri =
    setupMode && user?.totpSecret
      ? otpauthUri({ secret: user.totpSecret, account: user.email, issuer })
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          My security
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Two-step verification, and every device signed in as you.
        </p>
      </div>

      {sp.enrol === "required" ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">Two-step verification is required</strong>{" "}
          on this store. Set it up below — it takes about a minute.
        </p>
      ) : null}
      {sp.error === "code" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          That code wasn&apos;t right. Make sure the phone&apos;s clock is
          correct, then try the code showing now.
        </p>
      ) : null}
      {sp.error === "password" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          That password didn&apos;t match, so nothing was changed.
        </p>
      ) : null}
      {sp.saved === "off" ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Two-step verification is off. Your password is now the only thing
          protecting this account.
        </p>
      ) : null}
      {sp.saved === "all" ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Signed out of {sp.detail ?? "0"} other{" "}
          {sp.detail === "1" ? "device" : "devices"}.
        </p>
      ) : null}

      {/* The recovery codes, shown exactly once. */}
      {freshCodes.length ? (
        <SectionCard title="Save your recovery codes">
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong className="font-semibold">This is the only time these are shown.</strong>{" "}
            Only their hashes are stored, so they cannot be shown again — print
            them or put them in a password manager now. Each one works once, and
            gets you in if the phone is lost.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {freshCodes.map((c) => (
              <li
                key={c}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center font-mono text-sm tracking-wide text-slate-800"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end">
            <Link href="/admin/profile/security" className={btnPrimary}>
              I&apos;ve saved them
            </Link>
          </div>
        </SectionCard>
      ) : null}

      {/* ---------- Two-step verification ---------- */}
      <SectionCard title="Two-step verification">
        {setupMode && uri ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-3">
              <div
                className="rounded-2xl border border-slate-200 bg-white p-3 [&>svg]:h-[190px] [&>svg]:w-[190px]"
                // The QR is generated on this server by bwip-js; nothing about
                // the secret leaves the machine to render it.
                dangerouslySetInnerHTML={{ __html: qrSvg(uri) }}
              />
              <p className="text-xs text-slate-400">Scan with your authenticator app</p>
            </div>

            <div>
              <ol className="space-y-3 text-sm text-slate-700">
                <li>
                  <strong className="font-semibold">1.</strong> Open Google
                  Authenticator, Authy, 1Password or similar.
                </li>
                <li>
                  <strong className="font-semibold">2.</strong> Scan the code, or
                  enter this key by hand:
                  <code className="mt-1.5 block break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
                    {user?.totpSecret}
                  </code>
                </li>
                <li>
                  <strong className="font-semibold">3.</strong> Type the 6-digit
                  code it shows:
                </li>
              </ol>

              <form action={confirmEnrolmentAction} className="mt-5 flex flex-wrap items-end gap-3">
                <Field label="Code from the app" htmlFor="code" className="w-44">
                  <input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    placeholder="000000"
                    className={`${fieldInput} text-center tracking-[0.3em]`}
                  />
                </Field>
                <button type="submit" className={btnPrimary}>
                  Turn on
                </button>
              </form>

              <form action={cancelEnrolment} className="mt-3">
                <button type="submit" className="text-xs text-slate-400 hover:text-slate-600">
                  Cancel setup
                </button>
              </form>
            </div>
          </div>
        ) : enabled ? (
          <div>
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                On
              </span>
              Turned on {user?.totpEnabledAt ? when(user.totpEnabledAt, tz) : ""}.{" "}
              {codesLeft} recovery {codesLeft === 1 ? "code" : "codes"} left.
            </p>
            {codesLeft <= 2 ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                You are nearly out of recovery codes. Turn 2FA off and back on to
                get a fresh set.
              </p>
            ) : null}

            <form action={disableTwoFactorAction} className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-6">
              <Field label="Your password" htmlFor="password" className="w-64">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={fieldInput}
                />
              </Field>
              <button type="submit" className={btnDanger}>
                Turn off
              </button>
              <p className="w-full text-xs text-slate-400">
                Your password is asked for here so that a borrowed session
                can&apos;t quietly remove the second factor.
              </p>
            </form>
          </div>
        ) : (
          <div>
            <p className="text-sm leading-relaxed text-slate-600">
              With this on, signing in needs your password{" "}
              <em>and</em> a code from your phone. It is the single biggest
              difference between &ldquo;someone learned the password&rdquo; and
              &ldquo;someone is in the admin&rdquo;.
              {config.require2fa ? " This store requires it." : ""}
            </p>
            <form action={beginEnrolment} className="mt-5">
              <button type="submit" className={btnPrimary}>
                Set up two-step verification
              </button>
            </form>
          </div>
        )}
      </SectionCard>

      {/* ---------- Sessions ---------- */}
      <SectionCard
        title="Where you're signed in"
        action={
          sessions.length > 1 ? (
            <form action={revokeOtherSessions}>
              <button type="submit" className={btnGhost}>
                Sign out everywhere else
              </button>
            </form>
          ) : null
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={thCls}>Device</th>
                <th className={thCls}>IP address</th>
                <th className={thCls}>Last active</th>
                <th className={thCls}>Signed in</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => (
                <tr key={sess.id} className="border-b border-slate-100 last:border-0">
                  <td className={tdCls}>
                    {describeDevice(sess.userAgent)}
                    {sess.id === me.sessionId ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        This device
                      </span>
                    ) : null}
                  </td>
                  <td className={`${tdCls} font-mono text-xs`}>{sess.ipAddress ?? "—"}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{when(sess.lastSeenAt, tz)}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{when(sess.createdAt, tz)}</td>
                  <td className={`${tdCls} text-right`}>
                    <form action={revokeOwnSession}>
                      <input type="hidden" name="sessionId" value={sess.id} />
                      <button type="submit" className={btnGhost}>
                        {sess.id === me.sessionId ? "Sign out" : "Revoke"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ---------- Recent activity on this account ---------- */}
      <SectionCard title="Recent sign-in attempts on your account">
        {attempts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    a.success ? "bg-emerald-500" : "bg-red-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-slate-700">{when(a.createdAt, tz)}</span>
                <span className="font-mono text-xs text-slate-500">{a.ip ?? "—"}</span>
                <span className="text-slate-500">
                  {[a.city, a.country].filter(Boolean).join(", ")}
                </span>
                <span className="text-slate-400">{describeDevice(a.userAgent)}</span>
                {!a.success ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    failed
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-400">
          A run of failures you did not cause means someone is guessing your
          password.{" "}
          <Link href="/admin/profile" className="underline">
            Change it
          </Link>{" "}
          and turn on two-step verification.
        </p>
      </SectionCard>
    </div>
  );
}
