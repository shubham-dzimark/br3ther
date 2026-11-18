import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { Card, btnPrimary } from "@/components/admin/ui";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { changeOwnPassword, updateOwnProfile } from "./actions";
import { getTimeZone, ymdhm } from "@/lib/timezone";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "Your current password didn't match.",
  weak: "New passwords must be at least 12 characters.",
  mismatch: "The two new passwords didn't match.",
  email: "That email is already used by another admin.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tz = await getTimeZone();
  const [{ saved, error }, me] = await Promise.all([searchParams, requireAdmin()]);
  const full = await prisma.adminUser.findUnique({
    where: { id: me.id },
    include: { _count: { select: { sessions: true } } },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Profile
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}

      <Card className="flex flex-wrap items-center gap-4 p-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--admin-btn)] text-xl font-semibold text-[var(--on-colour)]">
          {me.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="text-lg font-semibold text-slate-900">{me.name}</p>
          <p className="text-sm text-slate-500">{me.email}</p>
          <p className="mt-1 text-xs text-slate-400">
            {me.role === "OWNER" ? "Master" : "Staff"} ·{" "}
            {full?._count.sessions ?? 0} active session
            {(full?._count.sessions ?? 0) === 1 ? "" : "s"} · last login{" "}
            {full?.lastLoginAt
              ? ymdhm(full.lastLoginAt, tz)
              : "never"}
          </p>
        </div>
      </Card>

      <form action={updateOwnProfile}>
        <SectionCard title="Your details">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Full name" htmlFor="name">
              <input id="name" name="name" defaultValue={me.name} required className={fieldInput} />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" defaultValue={me.email} required className={fieldInput} />
            </Field>
          </div>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>
              Save details
            </button>
          </div>
        </SectionCard>
      </form>

      <form action={changeOwnPassword}>
        <SectionCard title="Change password">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
            <Field label="Current password" htmlFor="currentPassword">
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className={fieldInput}
              />
            </Field>
            <Field label="New password" htmlFor="newPassword">
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                className={fieldInput}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirmPassword">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-3 px-5 text-xs text-slate-400">
            At least 12 characters. Changing it signs you out everywhere, including
            this session, so you&rsquo;ll log back in with the new password.
          </p>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>
              Change password
            </button>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
