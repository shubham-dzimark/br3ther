"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/permissions";
import { adjustPointsByAdmin } from "@/lib/loyalty-admin";

const HOME = "/admin/member-points";
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

/**
 * Where to send the admin back to: the same search, filter and page they were
 * on. Only this screen's own URL is accepted, so the field cannot be used to
 * redirect anywhere else.
 */
function backTo(raw: string, params: Record<string, string>): string {
  const url = new URL(raw.startsWith(HOME) ? raw : HOME, "http://admin.local");
  if (url.pathname !== HOME) url.pathname = HOME;
  for (const key of ["saved", "pts", "error"]) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/** Add points to (or remove points from) one member, from the list. */
export async function addMemberPoints(fd: FormData): Promise<void> {
  const me = await requireCapability("customers");

  const id = text(fd, "id");
  const back = text(fd, "back");
  if (!id) redirect(backTo(back, { error: "not_found" }));

  const result = await adjustPointsByAdmin({
    customerId: id,
    points: Math.round(Number(text(fd, "points")) || 0),
    note: text(fd, "note"),
    adminName: me.name || me.email,
  });

  revalidatePath(HOME);
  revalidatePath(`/admin/customers/${id}`);

  redirect(
    backTo(
      back,
      result.ok ? { saved: id, pts: String(result.points) } : { error: result.error },
    ),
  );
}
