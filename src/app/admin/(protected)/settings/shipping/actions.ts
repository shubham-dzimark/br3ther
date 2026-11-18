"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { parsePriceToCents } from "@/lib/money";
import type { ShippingMethodType } from "@/generated/prisma";
import { getSettings, setSettings, SETTING_KEYS } from "@/lib/settings";
import { testGeoapifyKey } from "@/lib/address-lookup";

const PAGE = "/admin/settings/shipping";
const TYPES = ["FLAT", "FREE", "PICKUP"];

const cents = (fd: FormData, field: string) =>
  parsePriceToCents(String(fd.get(field) ?? "")) ?? 0;

const done = (what: string) => {
  revalidatePath(PAGE);
  // Postage shows on the cart, the checkout and the free-shipping bar.
  revalidatePath("/cart");
  revalidatePath("/checkout");
  redirect(`${PAGE}?saved=${what}`);
};

/** A new shipping choice for the customer. */
export async function createShippingMethod(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${PAGE}?error=name`);

  const rawType = String(fd.get("type") ?? "FLAT");
  const count = await prisma.shippingMethod.count();

  await prisma.shippingMethod.create({
    data: {
      name,
      type: (TYPES.includes(rawType) ? rawType : "FLAT") as ShippingMethodType,
      taxable: fd.get("taxable") === "on",
      costCents: cents(fd, "cost"),
      freeOverCents: cents(fd, "freeOver"),
      minOrderCents: cents(fd, "minOrder"),
      note: String(fd.get("note") ?? "").trim().slice(0, 120) || null,
      isActive: true,
      sortOrder: count,
    },
  });
  done("method");
}

/** Everything about one method, including what each class adds to it. */
export async function saveShippingMethod(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = String(fd.get("id") ?? "");
  if (!id) redirect(PAGE);

  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${PAGE}?error=name`);
  const rawType = String(fd.get("type") ?? "FLAT");

  await prisma.shippingMethod.update({
    where: { id },
    data: {
      name,
      type: (TYPES.includes(rawType) ? rawType : "FLAT") as ShippingMethodType,
      taxable: fd.get("taxable") === "on",
      costCents: cents(fd, "cost"),
      freeOverCents: cents(fd, "freeOver"),
      minOrderCents: cents(fd, "minOrder"),
      note: String(fd.get("note") ?? "").trim().slice(0, 120) || null,
      isActive: fd.get("isActive") === "on",
    },
  });

  /*
   * Class costs arrive as classCost_<classId>. A blank box means "this class
   * adds nothing", which is the same as having no row, so the row is deleted
   * rather than stored as a zero - it keeps the quote's sum honest.
   */
  const classes = await prisma.shippingClass.findMany({ select: { id: true } });
  for (const { id: classId } of classes) {
    const raw = String(fd.get(`classCost_${classId}`) ?? "").trim();
    const value = raw === "" ? null : parsePriceToCents(raw);
    if (value === null || value === 0) {
      await prisma.shippingMethodClassCost
        .delete({ where: { methodId_classId: { methodId: id, classId } } })
        .catch(() => undefined);
    } else {
      await prisma.shippingMethodClassCost.upsert({
        where: { methodId_classId: { methodId: id, classId } },
        update: { costCents: value },
        create: { methodId: id, classId, costCents: value },
      });
    }
  }

  done("method");
}

export async function deleteShippingMethod(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.shippingMethod.delete({ where: { id } }).catch(() => undefined);
  done("method");
}

/** Classes group things that cost the same to post. */
export async function createShippingClass(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  if (!name) redirect(`${PAGE}?error=class`);

  let slug = slugify(name) || "class";
  let n = 1;
  while (await prisma.shippingClass.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${slugify(name)}-${n}`;
  }

  const count = await prisma.shippingClass.count();
  await prisma.shippingClass
    .create({
      data: {
        name,
        slug,
        description: String(fd.get("description") ?? "").trim().slice(0, 160) || null,
        sortOrder: count,
      },
    })
    .catch(() => undefined);
  done("class");
}

export async function deleteShippingClass(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = String(fd.get("id") ?? "");
  // Products fall back to no class, and the method costs for it go with it.
  if (id) await prisma.shippingClass.delete({ where: { id } }).catch(() => undefined);
  done("class");
}

/**
 * Address autocomplete at checkout: the on/off switch and the Geoapify key.
 *
 * The key is write-only - left blank, the saved one is kept. Switching on runs
 * a real test lookup first; if Geoapify refuses it, the key is kept but
 * suggestions stay off and the page says why.
 */
export async function saveAddressLookup(fd: FormData): Promise<void> {
  await requireCapability("settings");

  const current = await getSettings();
  const stored = (current[SETTING_KEYS.addressGeoapifyKey] ?? "").trim();
  const typed = String(fd.get("geoapifyKey") ?? "").trim();
  const key = fd.get("clearKey") === "on" ? "" : typed && !typed.startsWith("\u2022") ? typed : stored;
  const wantOn = fd.get("enabled") === "on";

  let enabled = false;
  let status = "off";
  let detail = "";
  if (wantOn && !key) {
    status = "nokey";
  } else if (wantOn) {
    const test = await testGeoapifyKey(key);
    if (test.ok) {
      enabled = true;
      status = "ok";
    } else {
      status = "fail";
      detail = test.error;
    }
  }

  await setSettings({
    [SETTING_KEYS.addressGeoapifyKey]: key,
    [SETTING_KEYS.addressLookupEnabled]: enabled ? "1" : "0",
  });

  revalidatePath(PAGE);
  revalidatePath("/checkout");
  redirect(`${PAGE}?saved=address&addr=${status}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 160))}` : ""}`);
}
