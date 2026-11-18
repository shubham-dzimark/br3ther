"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { parsePriceToCents } from "@/lib/money";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

export async function requestWithdrawal(fd: FormData): Promise<void> {
  await requireCapability("finance");

  const amountCents = parsePriceToCents(String(fd.get("amount") ?? ""));
  if (!amountCents || amountCents <= 0) redirect("/admin/finance/withdraws?error=amount");

  const settings = await getSettings();
  const count = await prisma.payout.count();

  await prisma.payout.create({
    data: {
      reference: `WD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
      amountCents,
      currency: settings[SETTING_KEYS.storeCurrency] || "CAD",
      method: String(fd.get("method") ?? "bank_transfer"),
      note: String(fd.get("note") ?? "").trim() || null,
    },
  });

  revalidatePath("/admin/finance/withdraws");
  redirect("/admin/finance/withdraws?saved=1");
}

export async function setPayoutStatus(fd: FormData): Promise<void> {
  await requireCapability("finance");
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !["REQUESTED", "PAID", "CANCELLED"].includes(status)) {
    redirect("/admin/finance/withdraws");
  }

  await prisma.payout.update({
    where: { id },
    data: {
      status: status as "REQUESTED" | "PAID" | "CANCELLED",
      paidAt: status === "PAID" ? new Date() : null,
    },
  });

  revalidatePath("/admin/finance/withdraws");
  redirect("/admin/finance/withdraws?saved=1");
}
