"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {hashPassword } from "@/lib/auth";
import { requireCapability } from "@/lib/permissions";
import type { AdminRole } from "@/generated/prisma";

const MIN_PASSWORD = 12;

/*
 * These actions serve two lists: /admin/users (Masters) and /admin/staff
 * (everyone else). Each form posts where it came from so redirects land back
 * on the right one - otherwise editing a staff member bounced you to Admins.
 * Validated against a fixed set rather than trusted, so it can't be used as an
 * open redirect.
 */
function backBase(fd: FormData): "/admin/staff" | "/admin/users" {
  return String(fd.get("backTo") ?? "") === "/admin/staff"
    ? "/admin/staff"
    : "/admin/users";
}

export async function createAdmin(fd: FormData): Promise<void> {
  const base = backBase(fd);
  const me = await requireCapability("admins");
  if (me.role !== "OWNER") redirect(`${base}?error=forbidden`);

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const requested = String(fd.get("role") ?? "STORE_MANAGER");
  const role = (["OWNER", "STORE_MANAGER", "ACCOUNTANT", "EDITOR", "CUSTOMER_SERVICE"] as const).includes(
    requested as never,
  )
    ? requested
    : "STORE_MANAGER";

  if (!email || !name) redirect(`${base}?error=missing`);
  if (password.length < MIN_PASSWORD) redirect(`${base}?error=weak`);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) redirect(`${base}?error=duplicate`);

  await prisma.adminUser.create({
    data: {
      email,
      name,
      role: role as AdminRole,
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath(base);
  redirect(`${base}?saved=1`);
}

export async function setAdminActive(fd: FormData): Promise<void> {
  const base = backBase(fd);
  const me = await requireCapability("admins");
  if (me.role !== "OWNER") redirect(`${base}?error=forbidden`);

  const id = String(fd.get("id") ?? "");
  const active = String(fd.get("active") ?? "") === "1";

  // Never let someone lock themselves out.
  if (!id || id === me.id) redirect(`${base}?error=self`);

  await prisma.adminUser.update({ where: { id }, data: { isActive: active } });
  // Deactivating must also kill any live sessions for that account.
  if (!active) await prisma.adminSession.deleteMany({ where: { adminUserId: id } });

  revalidatePath(base);
  redirect(`${base}?saved=1`);
}

export async function resetAdminPassword(fd: FormData): Promise<void> {
  const base = backBase(fd);
  const me = await requireCapability("admins");
  const id = String(fd.get("id") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!id) redirect(base);

  // Masters can reset anyone; everyone else only themselves.
  if (me.role !== "OWNER" && id !== me.id) redirect(`${base}?error=forbidden`);
  if (password.length < MIN_PASSWORD) redirect(`${base}/${id}?error=weak`);

  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  // Force a fresh sign-in everywhere after a password change.
  await prisma.adminSession.deleteMany({ where: { adminUserId: id } });

  revalidatePath(base);
  redirect(`${base}/${id}?saved=password`);
}

export async function deleteAdmin(fd: FormData): Promise<void> {
  const base = backBase(fd);
  const me = await requireCapability("admins");
  if (me.role !== "OWNER") redirect(`${base}?error=forbidden`);

  const id = String(fd.get("id") ?? "");
  if (!id || id === me.id) redirect(`${base}?error=self`);

  const owners = await prisma.adminUser.count({
    where: { role: "OWNER", isActive: true },
  });
  const target = await prisma.adminUser.findUnique({ where: { id } });
  // Refuse to remove the last remaining owner.
  if (target?.role === "OWNER" && owners <= 1) redirect(`${base}?error=last_owner`);

  await prisma.adminUser.delete({ where: { id } });
  revalidatePath(base);
  redirect(`${base}?saved=1`);
}


const ROLES = ["OWNER", "STORE_MANAGER", "ACCOUNTANT", "EDITOR", "CUSTOMER_SERVICE"] as const;

/**
 * Edit a staff account. A Master may edit anyone; anyone may edit their own
 * name and email. Role and active-state changes are Master-only and can never
 * be applied to yourself - that is what stops someone locking themselves out.
 */
export async function updateAdmin(fd: FormData): Promise<void> {
  const base = backBase(fd);
  const me = await requireCapability("admins");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect(base);

  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) redirect(base);

  const isSelf = target.id === me.id;
  if (me.role !== "OWNER" && !isSelf) redirect(`${base}?error=forbidden`);

  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!name || !email) redirect(`${base}/${id}?error=missing`);

  const clash = await prisma.adminUser.findUnique({ where: { email } });
  if (clash && clash.id !== id) redirect(`${base}/${id}?error=duplicate`);

  const requestedRole = String(fd.get("role") ?? target.role);
  const wantsActive = fd.get("isActive") === "on";

  let role = target.role;
  let isActive = target.isActive;

  if (me.role === "OWNER" && !isSelf) {
    if ((ROLES as readonly string[]).includes(requestedRole)) {
      role = requestedRole as (typeof ROLES)[number];
    }
    isActive = wantsActive;
  }

  // Never leave the store without an active Master.
  if (target.role === "OWNER" && (role !== "OWNER" || !isActive)) {
    const owners = await prisma.adminUser.count({
      where: { role: "OWNER", isActive: true, id: { not: id } },
    });
    if (owners === 0) redirect(`${base}/${id}?error=last_owner`);
  }

  await prisma.adminUser.update({
    where: { id },
    data: { name, email, role, isActive },
  });

  if (!isActive) {
    await prisma.adminSession.deleteMany({ where: { adminUserId: id } });
  }

  revalidatePath(base);
  revalidatePath("/admin", "layout");
  redirect(`${base}/${id}?saved=1`);
}
