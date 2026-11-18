"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { CARRIER_CATALOGUE } from "@/lib/carrier-catalogue";

const PAGE = "/admin/orders/carriers";
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

/** Add one carrier from the built-in catalogue. */
export async function addCatalogueCarrier(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const key = text(fd, "key");
  const entry = CARRIER_CATALOGUE.find((c) => c.key === key);
  if (!entry) redirect(`${PAGE}?error=unknown`);

  const count = await prisma.shippingCarrier.count();
  await prisma.shippingCarrier.upsert({
    where: { key: entry.key },
    // Re-adding one that was switched off simply turns it back on, rather
    // than resetting a name or tracking URL that was edited earlier.
    update: { isActive: true },
    create: {
      key: entry.key,
      name: entry.name,
      region: entry.region,
      monogram: entry.monogram,
      colour: entry.colour,
      trackUrl: entry.track,
      sortOrder: count,
    },
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?added=${encodeURIComponent(entry.name)}`);
}

/** Add a courier that is not in the catalogue. */
export async function addCustomCarrier(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const name = text(fd, "name");
  if (!name) redirect(`${PAGE}?error=missing`);

  const key =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `carrier-${Date.now()}`;

  const existing = await prisma.shippingCarrier.findUnique({ where: { key } });
  if (existing) redirect(`${PAGE}?error=duplicate`);

  const count = await prisma.shippingCarrier.count();
  await prisma.shippingCarrier.create({
    data: {
      key,
      name,
      region: text(fd, "region") || "Global",
      trackUrl: text(fd, "trackUrl"),
      logoUrl: text(fd, "logoUrl") || null,
      monogram: name.slice(0, 2).toUpperCase(),
      colour: text(fd, "colour") || "#334155",
      sortOrder: count,
    },
  });

  revalidatePath(PAGE);
  redirect(`${PAGE}?added=${encodeURIComponent(name)}`);
}

export async function updateCarrier(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = text(fd, "id");
  if (!id) redirect(PAGE);

  await prisma.shippingCarrier.update({
    where: { id },
    data: {
      name: text(fd, "name") || undefined,
      region: text(fd, "region") || "Global",
      trackUrl: text(fd, "trackUrl"),
      logoUrl: text(fd, "logoUrl") || null,
      monogram: (text(fd, "monogram") || "··").slice(0, 3),
      colour: text(fd, "colour") || "#334155",
    },
  });

  revalidatePath(PAGE);
  revalidatePath("/admin/orders");
  redirect(`${PAGE}?saved=1`);
}

export async function toggleCarrier(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = text(fd, "id");
  if (id) {
    await prisma.shippingCarrier.update({
      where: { id },
      data: { isActive: fd.get("active") === "1" },
    });
  }
  revalidatePath(PAGE);
  revalidatePath("/admin/orders");
  redirect(PAGE);
}

/**
 * Remove a carrier outright. Refused while orders still reference it - those
 * orders would lose the carrier name on their tracking line. Switching it off
 * is the right move there, and the UI says so.
 */
export async function deleteCarrier(fd: FormData): Promise<void> {
  await requireCapability("settings");
  const id = text(fd, "id");
  if (!id) redirect(PAGE);

  const carrier = await prisma.shippingCarrier.findUnique({ where: { id } });
  if (!carrier) redirect(PAGE);

  const inUse = await prisma.order.count({ where: { trackingCarrier: carrier.key } });
  if (inUse > 0) redirect(`${PAGE}?error=inuse&count=${inUse}`);

  await prisma.shippingCarrier.delete({ where: { id } });
  revalidatePath(PAGE);
  redirect(`${PAGE}?removed=${encodeURIComponent(carrier.name)}`);
}
