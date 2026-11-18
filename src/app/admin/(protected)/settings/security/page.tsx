import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getSecurityConfig } from "@/lib/login-guard";
import { describeDevice } from "@/lib/security-mail";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary, btnGhost, btnDanger, thCls, tdCls } from "@/components/admin/ui";
import { clientIp } from "@/lib/client-ip";
import {
  clearOldAttempts,
  revokeAnySession,
  revokeEveryAdminSession,
  saveSecuritySettings,
} from "./actions";
import { getTimeZone } from "@/lib/timezone";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  ok: "Signed in",
  recovery_code: "Signed in with a recovery code",
  bad_password: "Wrong password",
  unknown_user: "No such account",
  inactive: "Account disabled",
  locked: "Blocked — too many attempts",
  ip_blocked: "Blocked — network not allowed",
  bad_totp: "Wrong 2FA code",
};

function when(d: Date, timeZone: string): string {
  return d.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string; show?: string }>;
}) {
  const me = await requireCapability("settings");
  const tz = await getTimeZone();
  const sp = await searchParams;
  const showAll = sp.show === "all";

  const [s, config, attempts, sessions, twoFactorUsers, myIp, totals] =
    await Promise.all([
      getSettings(),
      getSecurityConfig(),
      prisma.loginAttempt.findMany({
        where: showAll ? {} : { kind: "ADMIN" },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.adminSession.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        include: { adminUser: { select: { name: true, email: true } } },
      }),
      prisma.adminUser.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, totpEnabledAt: true, role: true },
        orderBy: { name: "asc" },
      }),
      clientIp(),
      prisma.loginAttempt.groupBy({
        by: ["success"],
        _count: { _all: true },
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

  const isOwner = me.role === "OWNER";
  const failed24h = totals.find((t) => t.success === false)?._count._all ?? 0;
  const ok24h = totals.find((t) => t.success === true)?._count._all ?? 0;
  const without2fa = twoFactorUsers.filter((u) => !u.totpEnabledAt);

  const said =
    sp.saved === "revoked"
      ? "Session revoked. That browser is signed out."
      : sp.saved === "pruned"
        ? `Removed ${sp.detail ?? "0"} old sign-in records.`
        : "Saved.";

  const bad =
    sp.error === "forbidden"
      ? "Only a Master can change security settings."
      : sp.error === "lockout"
        ? `That allowlist doesn't include the address you're on right now (${sp.detail ?? "unknown"}), so saving it would lock you out. Add your own address first.`
        : "Something went wrong.";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Security
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Who signed in, from where, and what stands between the panel and
          someone guessing a password.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {said}
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {bad}
        </p>
      ) : null}

      {/* The three numbers worth glancing at. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Sign-ins, last 24h" value={String(ok24h)} tone="ok" />
        <Stat
          label="Failed attempts, last 24h"
          value={String(failed24h)}
          tone={failed24h > 20 ? "warn" : "ok"}
        />
        <Stat
          label="Admins without 2FA"
          value={String(without2fa.length)}
          tone={without2fa.length ? "warn" : "ok"}
        />
      </div>

      {without2fa.length ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">
            {without2fa.length === 1 ? "One account has" : `${without2fa.length} accounts have`}{" "}
            no second factor:
          </strong>{" "}
          {without2fa.map((u) => u.name).join(", ")}. A stolen password is
          enough to sign in as {without2fa.length === 1 ? "them" : "any of them"}.{" "}
          <Link href="/admin/profile/security" className="font-semibold underline">
            Set up yours
          </Link>
          .
        </p>
      ) : null}

      {/* ---------- Sign-in history ---------- */}
      <SectionCard
        title="Sign-in history"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={showAll ? "/admin/settings/security" : "/admin/settings/security?show=all"}
              className={btnGhost}
            >
              {showAll ? "Admin only" : "Include customers"}
            </Link>
            {isOwner ? (
              <form action={clearOldAttempts}>
                <button type="submit" className={btnGhost}>
                  Prune old records
                </button>
              </form>
            ) : null}
          </div>
        }
      >
        {attempts.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Nothing recorded yet. Every sign-in from now on lands here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>When</th>
                  <th className={thCls}>Account</th>
                  <th className={thCls}>Result</th>
                  <th className={thCls}>IP address</th>
                  <th className={thCls}>Location</th>
                  <th className={thCls}>Device</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className={`${tdCls} whitespace-nowrap`}>{when(a.createdAt, tz)}</td>
                    <td className={tdCls}>
                      <span className="block">{a.email}</span>
                      {a.kind === "CUSTOMER" ? (
                        <span className="text-xs text-slate-400">Customer</span>
                      ) : null}
                    </td>
                    <td className={tdCls}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          a.success
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {REASONS[a.reason] ?? a.reason}
                      </span>
                    </td>
                    <td className={`${tdCls} font-mono text-xs`}>{a.ip ?? "—"}</td>
                    <td className={tdCls}>
                      {[a.city, a.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className={tdCls}>{describeDevice(a.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400">
          Newest 100 shown. Records older than {config.logRetentionDays} days are
          removed when you prune.
        </p>
      </SectionCard>

      {/* ---------- Live sessions ---------- */}
      <SectionCard
        title="Signed in right now"
        action={
          isOwner && sessions.length > 1 ? (
            <form action={revokeEveryAdminSession}>
              <button type="submit" className={btnDanger}>
                Sign everyone out
              </button>
            </form>
          ) : null
        }
      >
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No active sessions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>Account</th>
                  <th className={thCls}>Last active</th>
                  <th className={thCls}>Signed in</th>
                  <th className={thCls}>IP address</th>
                  <th className={thCls}>Device</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => (
                  <tr key={sess.id} className="border-b border-slate-100 last:border-0">
                    <td className={tdCls}>
                      <span className="block font-medium text-slate-900">
                        {sess.adminUser.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {sess.adminUser.email}
                      </span>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{when(sess.lastSeenAt, tz)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{when(sess.createdAt, tz)}</td>
                    <td className={`${tdCls} font-mono text-xs`}>
                      {sess.ipAddress ?? "—"}
                      {sess.ipAddress && sess.ipAddress === myIp ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          This device
                        </span>
                      ) : null}
                    </td>
                    <td className={tdCls}>{describeDevice(sess.userAgent)}</td>
                    <td className={`${tdCls} text-right`}>
                      {isOwner ? (
                        <form action={revokeAnySession}>
                          <input type="hidden" name="sessionId" value={sess.id} />
                          <button type="submit" className={btnGhost}>
                            Revoke
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ---------- Policy ---------- */}
      {isOwner ? (
        <form action={saveSecuritySettings} className="space-y-5">
          <SectionCard title="Sign-in protection">
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
              <Field label="Failed attempts allowed" htmlFor="maxAttempts">
                <input
                  id="maxAttempts"
                  name="maxAttempts"
                  type="number"
                  min={3}
                  max={100}
                  defaultValue={config.maxAttempts}
                  className={fieldInput}
                />
              </Field>
              <Field label="Counted over (minutes)" htmlFor="windowMinutes">
                <input
                  id="windowMinutes"
                  name="windowMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={config.windowMinutes}
                  className={fieldInput}
                />
              </Field>
              <Field label="Then blocked for (minutes)" htmlFor="lockoutMinutes">
                <input
                  id="lockoutMinutes"
                  name="lockoutMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={config.lockoutMinutes}
                  className={fieldInput}
                />
              </Field>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              An account is blocked after {config.maxAttempts} failures inside{" "}
              {config.windowMinutes} minutes. A single IP address gets{" "}
              {config.maxAttempts * 3} before it is blocked outright — looser on
              purpose, because one office can share an address.
            </p>

            <label className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="throttleCustomers"
                defaultChecked={config.throttleCustomers}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Apply the same limit to customer accounts
                <span className="mt-0.5 block text-xs text-slate-500">
                  Customer logins hold order history and saved addresses, so they
                  are worth protecting too.
                </span>
              </span>
            </label>
          </SectionCard>

          <SectionCard title="Sessions">
            <p className="mb-5 text-xs leading-relaxed text-slate-500">
              Closing the browser always signs out. These limits cover a browser
              that is left open.
            </p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label="Admin: sign out after idle (minutes)" htmlFor="idleMinutes">
                <input
                  id="idleMinutes"
                  name="idleMinutes"
                  type="number"
                  min={5}
                  max={480}
                  defaultValue={config.idleMinutes}
                  className={fieldInput}
                />
              </Field>
              <Field label="Admin: longest sign-in (hours)" htmlFor="sessionHours">
                <input
                  id="sessionHours"
                  name="sessionHours"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={config.sessionHours}
                  className={fieldInput}
                />
              </Field>
              <Field label="Customers: sign out after idle (hours)" htmlFor="customerIdleHours">
                <input
                  id="customerIdleHours"
                  name="customerIdleHours"
                  type="number"
                  min={1}
                  max={72}
                  defaultValue={config.customerIdleHours}
                  className={fieldInput}
                />
              </Field>
              <Field label="Customers: longest sign-in (days)" htmlFor="customerSessionDays">
                <input
                  id="customerSessionDays"
                  name="customerSessionDays"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={config.customerSessionDays}
                  className={fieldInput}
                />
              </Field>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              The idle limit is the one that matters for a laptop left open in a
              café. Two minutes before it runs out the admin asks whether you are
              still there. Only clicks, typing and scrolling count as use, not
              the panel refreshing itself. After {config.sessionHours} hours you
              sign in again however busy the session has been.
            </p>
          </SectionCard>

          <SectionCard title="Two-step verification">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="require2fa"
                defaultChecked={config.require2fa}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Require 2FA for every admin account
                <span className="mt-0.5 block text-xs text-slate-500">
                  Anyone who has not enrolled is sent to set it up on their next
                  sign-in, rather than being locked out.
                </span>
              </span>
            </label>

            <ul className="mt-5 space-y-2">
              {twoFactorUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-900">{u.name}</span>{" "}
                    <span className="text-slate-400">{u.email}</span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      u.totpEnabledAt
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {u.totpEnabledAt ? "2FA on" : "Password only"}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Alerts and records">
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="alertNewIp"
                  defaultChecked={config.alertNewIp}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Email me when an admin signs in from a new place
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Goes to the account holder and to the admin addresses on the
                    Email page. Needs outgoing mail to be working.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="geoLookup"
                  defaultChecked={config.geoLookup}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Look up the city and country for each IP
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Sends the IP address — and nothing else — to ipwho.is to
                    resolve it. Turn this off to keep every lookup on this server;
                    the IP itself is still recorded either way.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-7 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label="Keep sign-in records for (days)" htmlFor="logRetentionDays">
                <input
                  id="logRetentionDays"
                  name="logRetentionDays"
                  type="number"
                  min={1}
                  max={3650}
                  defaultValue={config.logRetentionDays}
                  className={fieldInput}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Restrict the admin by network">
            <Field label="Allowed IP addresses" htmlFor="adminIpAllowlist">
              <textarea
                id="adminIpAllowlist"
                name="adminIpAllowlist"
                rows={4}
                defaultValue={config.adminIpRules.join("\n")}
                placeholder={"203.0.113.45\n203.0.113.0/24\n198.51.100.*"}
                className={`${fieldTextarea} font-mono text-xs`}
              />
            </Field>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Leave empty to allow sign-in from anywhere. With addresses listed,
              everything else is refused before a password is even checked — the
              strongest control on this page, and the easiest to lock yourself
              out with. One per line; single addresses, CIDR ranges and trailing
              wildcards all work. Your address right now is{" "}
              <span className="font-mono font-semibold text-slate-700">
                {myIp ?? "unknown"}
              </span>
              , and a list that excludes it will be refused.
            </p>
          </SectionCard>

          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>
              Save security settings
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only a Master can change these settings. You can still see the history
          above.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-bold tracking-tight ${
          tone === "warn" ? "text-amber-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
