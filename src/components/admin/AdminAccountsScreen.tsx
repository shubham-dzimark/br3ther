import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCapability, ROLE_LABELS } from "@/lib/permissions";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { IconPencil, IconTrash } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import {
  createAdmin,
  deleteAdmin,
  setAdminActive,
} from "@/app/admin/(protected)/users/actions";
import { getTimeZone, ymd } from "@/lib/timezone";

const ERRORS: Record<string, string> = {
  missing: "Name and email are both required.",
  weak: "Passwords must be at least 12 characters.",
  duplicate: "An account with that email already exists.",
  forbidden: "Only a Master can manage staff accounts.",
  self: "You can't deactivate or delete your own account.",
  last_owner: "That's the last active Master — promote someone else first.",
};

const STAFF_ROLES = ["STORE_MANAGER", "ACCOUNTANT", "EDITOR", "CUSTOMER_SERVICE"] as const;

/** Shared by /admin/users (Masters) and /admin/staff (everyone else). */
export async function AdminAccountsScreen({
  scope,
  saved,
  error,
}: {
  scope: "admins" | "staff";
  saved?: string;
  error?: string;
}) {
  const me = await requireCapability("admins");
  const tz = await getTimeZone();

  const accounts = await prisma.adminUser.findMany({
    where:
      scope === "admins"
        ? { role: "OWNER" }
        : { role: { not: "OWNER" } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const isOwner = me.role === "OWNER";
  const title = scope === "admins" ? "Administrators" : "Staff accounts";
  const blurb =
    scope === "admins"
      ? "Master accounts with unrestricted access to every screen and setting."
      : "Store Managers, Accountants and Editors. Each role only sees the areas it needs.";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{blurb}</p>
            </div>
            {saved ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                Saved
              </span>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="mx-6 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {ERRORS[error] ?? "Something went wrong."}
            </p>
          ) : null}

          <div className="h-5" />

          {accounts.length === 0 ? (
            <Empty>
              {scope === "admins"
                ? "No Master accounts."
                : "No staff accounts yet — add one on the right."}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>User</TH>
                    <TH>Role</TH>
                    <TH>Last login</TH>
                    <TH>Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((a) => {
                    const isSelf = a.id === me.id;
                    const canEdit = isOwner || isSelf;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--admin-btn)] text-xs font-semibold text-[var(--on-colour)]">
                              {a.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-900">
                                {a.name}
                                {isSelf ? (
                                  <span className="ml-2 text-xs font-normal text-slate-400">
                                    you
                                  </span>
                                ) : null}
                              </span>
                              <span className="block truncate text-xs text-slate-400">
                                {a.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              a.role === "OWNER"
                                ? "bg-[#E2EEEA] text-[var(--admin-accent)]"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {ROLE_LABELS[a.role] ?? a.role}
                          </span>
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-sm text-slate-500">
                          {a.lastLoginAt
                            ? ymd(a.lastLoginAt, tz)
                            : "Never"}
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              a.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {a.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {canEdit ? (
                              <Link
                                href={`${scope === "staff" ? "/admin/staff" : "/admin/users"}/${a.id}`}
                                title="Edit"
                                aria-label={`Edit ${a.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                              >
                                <IconPencil className="h-[17px] w-[17px]" />
                              </Link>
                            ) : null}

                            {isOwner && !isSelf ? (
                              <>
                                <form action={setAdminActive}>
              <input type="hidden" name="backTo" value={scope === "staff" ? "/admin/staff" : "/admin/users"} />
                                  <input type="hidden" name="id" value={a.id} />
                                  <input
                                    type="hidden"
                                    name="active"
                                    value={a.isActive ? "0" : "1"}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                  >
                                    {a.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </form>
                                <form action={deleteAdmin}>
              <input type="hidden" name="backTo" value={scope === "staff" ? "/admin/staff" : "/admin/users"} />
                                  <input type="hidden" name="id" value={a.id} />
                                  <button
                                    type="submit"
                                    aria-label={`Delete ${a.name}`}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                  >
                                    <IconTrash className="h-[17px] w-[17px]" />
                                  </button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="h-fit p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          {scope === "admins" ? "Add a Master" : "Add a staff member"}
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          {isOwner
            ? "Pick the narrowest role that lets someone do their job."
            : "Only a Master account can add accounts."}
        </p>

        <form action={createAdmin} className="space-y-7">
              <input type="hidden" name="backTo" value={scope === "staff" ? "/admin/staff" : "/admin/users"} />
          <Field label="Full name" htmlFor="new-name">
            <input id="new-name" name="name" required disabled={!isOwner} className={fieldInput} />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <input
              id="new-email"
              name="email"
              type="email"
              required
              disabled={!isOwner}
              className={fieldInput}
            />
          </Field>
          <Field label="Role" htmlFor="new-role">
            <select id="new-role" name="role" disabled={!isOwner} className={fieldSelect}>
              {scope === "admins" ? (
                <option value="OWNER">Master — full access</option>
              ) : (
                STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))
              )}
            </select>
          </Field>
          <Field label="Password" htmlFor="new-password">
            <input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              disabled={!isOwner}
              className={fieldInput}
            />
          </Field>
          <p className="-mt-4 px-5 text-xs text-slate-400">
            At least 12 characters. Stored as a bcrypt hash, never in plain text.
          </p>

          <button type="submit" disabled={!isOwner} className={`${btnPrimary} disabled:opacity-50`}>
            Create account
          </button>
        </form>
      </Card>
    </div>
  );
}
