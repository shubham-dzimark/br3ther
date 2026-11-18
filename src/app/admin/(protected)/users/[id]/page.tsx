import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { deleteAdmin, resetAdminPassword, updateAdmin } from "../actions";

export const metadata: Metadata = { title: "Edit staff account" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  missing: "Name and email are both required.",
  duplicate: "Another account already uses that email.",
  weak: "Passwords must be at least 12 characters.",
  last_owner: "This is the last active Master — promote someone else first.",
  forbidden: "You don't have permission to change that.",
};

const ROLES = ["OWNER", "STORE_MANAGER", "ACCOUNTANT", "EDITOR"] as const;

export default async function EditAdminPage({
  params,
  searchParams,
  /*
   * Which list this editor is being served under. Next only passes params and
   * searchParams, so the staff route supplies this explicitly - it keeps the
   * sidebar on Staff and sends saves back to the staff list.
   */
  scope = "admins",
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
  scope?: "admins" | "staff";
}) {
  const base = scope === "staff" ? "/admin/staff" : "/admin/users";
  const me = await requireCapability("admins");
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);

  const user = await prisma.adminUser.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true } } },
  });
  if (!user) notFound();

  const isSelf = user.id === me.id;
  const canChangeRole = me.role === "OWNER" && !isSelf;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={base}
          aria-label="Back to staff accounts"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {user.name}
        </h1>
        <span className="rounded-full bg-[#E2EEEA] px-3 py-1 text-xs font-medium text-[var(--admin-accent)]">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        {isSelf ? (
          <span className="text-xs text-slate-400">this is you</span>
        ) : null}
        {saved ? (
          <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            {saved === "password" ? "Password changed" : "Saved"}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      ) : null}

      <form action={updateAdmin}>
        <input type="hidden" name="backTo" value={base} />
        <SectionCard title="Account details">
          <input type="hidden" name="id" value={user.id} />

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Full name" htmlFor="name">
              <input id="name" name="name" defaultValue={user.name} required className={fieldInput} />
            </Field>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" defaultValue={user.email} required className={fieldInput} />
            </Field>

            <Field label="Role" htmlFor="role">
              <select
                id="role"
                name="role"
                defaultValue={user.role}
                disabled={!canChangeRole}
                className={`${fieldSelect} disabled:bg-slate-50 disabled:text-slate-400`}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-end pb-3">
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={user.isActive}
                  disabled={!canChangeRole}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)] disabled:opacity-40"
                />
                Account is active
              </label>
            </div>
          </div>

          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <strong className="text-slate-700">{ROLE_LABELS[user.role]}:</strong>{" "}
            {ROLE_DESCRIPTIONS[user.role] ?? ""}
          </p>

          {isSelf ? (
            <p className="mt-3 text-xs text-slate-400">
              You can&rsquo;t change your own role or deactivate yourself &mdash;
              that&rsquo;s what stops you locking yourself out. Ask another Master.
            </p>
          ) : null}

          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>
              Save changes
            </button>
          </div>
        </SectionCard>
      </form>

      <form action={resetAdminPassword}>
        <input type="hidden" name="backTo" value={base} />
        <SectionCard title="Set a new password">
          <input type="hidden" name="id" value={user.id} />
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="New password" htmlFor="password">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                className={fieldInput}
              />
            </Field>
          </div>
          <p className="mt-3 px-5 text-xs text-slate-400">
            At least 12 characters, stored as a bcrypt hash. Setting it signs this
            account out everywhere ({user._count.sessions} active session
            {user._count.sessions === 1 ? "" : "s"}), so tell them the new password.
          </p>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>
              Change password
            </button>
          </div>
        </SectionCard>
      </form>

      {me.role === "OWNER" && !isSelf ? (
        <form action={deleteAdmin}>
        <input type="hidden" name="backTo" value={base} />
          <SectionCard title="Danger zone">
            <input type="hidden" name="id" value={user.id} />
            <button
              type="submit"
              className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete this account
            </button>
            <p className="mt-3 text-xs text-slate-400">
              Deleting removes their sign-in. Anything they already did &mdash;
              confirmed payments, ticket replies &mdash; stays recorded.
            </p>
          </SectionCard>
        </form>
      ) : null}
    </div>
  );
}
