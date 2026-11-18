"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAdmin, verifyPassword } from "@/lib/auth";

const MIN_PASSWORD = 12;

export async function updateOwnProfile(fd: FormData): Promise<void> {
  const me = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!name || !email) redirect("/admin/profile");

  const clash = await prisma.adminUser.findUnique({ where: { email } });
  if (clash && clash.id !== me.id) redirect("/admin/profile?error=email");

  await prisma.adminUser.update({ where: { id: me.id }, data: { name, email } });
  revalidatePath("/admin", "layout");
  redirect("/admin/profile?saved=1");
}

export async function changeOwnPassword(fd: FormData): Promise<void> {
  const me = await requireAdmin();

  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");
  const confirm = String(fd.get("confirmPassword") ?? "");

  if (next.length < MIN_PASSWORD) redirect("/admin/profile?error=weak");
  if (next !== confirm) redirect("/admin/profile?error=mismatch");

  const user = await prisma.adminUser.findUnique({ where: { id: me.id } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    redirect("/admin/profile?error=wrong");
  }

  await prisma.adminUser.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(next) },
  });

  // Invalidate every session, including this one - a password change should
  // log out any other device that was already signed in.
  await prisma.adminSession.deleteMany({ where: { adminUserId: me.id } });

  redirect("/admin/login");
}
