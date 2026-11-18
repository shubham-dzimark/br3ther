"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

import { requireCapability } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import {
  displayOf,
  readValueSpecs,
  safeColour,
  safeSwatchImage,
} from "@/lib/attribute-display";
import { isKnownIcon } from "@/lib/attribute-icons";

export async function createAttribute(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) redirect("/admin/attributes");

  let slug = slugify(name);
  let n = 1;
  while (await prisma.attribute.findUnique({ where: { slug }, select: { id: true } })) {
    n += 1;
    slug = `${slugify(name)}-${n}`;
  }

  const display = displayOf(String(fd.get("display") ?? ""));
  const created = await prisma.attribute
    .create({ data: { name, slug, display } })
    .catch(() => null);

  /*
   * Values come with the attribute, each with whatever swatch the picker gave
   * it, so a colour or icon attribute is finished in one go rather than
   * created empty and filled in on a second pass.
   */
  if (created) {
    const specs = readValueSpecs(
      String(fd.get("valuesJson") ?? ""),
      String(fd.get("values") ?? ""),
    );
    if (specs.length > 0) {
      await prisma.attributeValue.createMany({
        data: specs.map((v, i) => ({
          attributeId: created.id,
          value: v.value,
          colour: safeColour(v.colour),
          imageUrl: safeSwatchImage(v.image),
          icon: isKnownIcon(v.icon) ? v.icon : null,
          sortOrder: i,
        })),
        skipDuplicates: true,
      });
    }
  }
  revalidatePath("/admin/attributes");
  redirect("/admin/attributes");
}

export async function deleteAttribute(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.attribute.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/attributes");
  redirect("/admin/attributes");
}

export async function addAttributeValue(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const attributeId = String(fd.get("attributeId") ?? "");
  // Several at once, each with its own colour, picture or icon.
  const specs = readValueSpecs(
    String(fd.get("valuesJson") ?? ""),
    String(fd.get("value") ?? ""),
  );
  if (attributeId && specs.length > 0) {
    let count = await prisma.attributeValue.count({ where: { attributeId } });
    for (const spec of specs) {
      // unique([attributeId, value]) - swallow duplicates rather than erroring.
      await prisma.attributeValue
        .create({
          data: {
            attributeId,
            value: spec.value,
            colour: safeColour(spec.colour),
            imageUrl: safeSwatchImage(spec.image),
            icon: isKnownIcon(spec.icon) ? spec.icon : null,
            sortOrder: count,
          },
        })
        .catch(() => undefined);
      count += 1;
    }
  }
  revalidatePath("/admin/attributes");
  redirect("/admin/attributes");
}

export async function deleteAttributeValue(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  if (id) await prisma.attributeValue.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/attributes");
  redirect("/admin/attributes");
}

/**
 * Variant names are a denormalised copy of their attribute values ("10g",
 * "L / Red"), so renaming a value leaves them stale. Rebuild the name for any
 * variant whose current name still matches what the old values derived to -
 * a hand-written name is left alone.
 */
async function syncVariantNames(valueId: string, oldValue: string, newValue: string) {
  const variants = await prisma.productVariant.findMany({
    where: { values: { some: { attributeValueId: valueId } } },
    select: {
      id: true,
      name: true,
      values: {
        select: { attributeValue: { select: { id: true, value: true } } },
      },
    },
  });

  await Promise.all(
    variants.map((variant) => {
      const parts = variant.values.map((v) => v.attributeValue);
      const derivedOld = parts
        .map((p) => (p.id === valueId ? oldValue : p.value))
        .join(" / ");
      if (variant.name !== derivedOld) return null; // renamed by hand - respect it
      const derivedNew = parts
        .map((p) => (p.id === valueId ? newValue : p.value))
        .join(" / ");
      if (derivedNew === variant.name) return null;
      return prisma.productVariant.update({
        where: { id: variant.id },
        data: { name: derivedNew },
      });
    }),
  );
}

export async function renameAttribute(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!id || !name) redirect("/admin/attributes");

  const current = await prisma.attribute.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!current || current.name === name) redirect("/admin/attributes");

  // name is unique - bail rather than throwing if it is taken.
  const clash = await prisma.attribute.findFirst({
    where: { name, NOT: { id } },
    select: { id: true },
  });
  if (clash) redirect("/admin/attributes");

  let slug = slugify(name);
  let n = 1;
  while (
    await prisma.attribute.findFirst({
      where: { slug, NOT: { id } },
      select: { id: true },
    })
  ) {
    n += 1;
    slug = `${slugify(name)}-${n}`;
  }

  await prisma.attribute.update({ where: { id }, data: { name, slug } });
  revalidatePath("/admin/attributes");
  revalidatePath("/shop");
  redirect("/admin/attributes");
}

export async function renameAttributeValue(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  const value = String(fd.get("value") ?? "").trim();
  if (!id || !value) redirect("/admin/attributes");

  const current = await prisma.attributeValue.findUnique({
    where: { id },
    select: { value: true, attributeId: true },
  });
  if (!current || current.value === value) redirect("/admin/attributes");

  // unique([attributeId, value]) - bail rather than throwing.
  const clash = await prisma.attributeValue.findFirst({
    where: { attributeId: current.attributeId, value, NOT: { id } },
    select: { id: true },
  });
  if (clash) redirect("/admin/attributes");

  await prisma.attributeValue.update({ where: { id }, data: { value } });
  await syncVariantNames(id, current.value, value);

  revalidatePath("/admin/attributes");
  revalidatePath("/shop");
  redirect("/admin/attributes");
}

/** How an attribute's values are shown on the storefront. */
export async function setAttributeDisplay(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  if (id) {
    await prisma.attribute
      .update({ where: { id }, data: { display: displayOf(String(fd.get("display") ?? "")) } })
      .catch(() => undefined);
  }
  revalidatePath("/admin/attributes");
  // The swatches are drawn on the storefront, so its pages are now stale.
  revalidatePath("/shop");
  revalidatePath("/");
  redirect("/admin/attributes");
}

/** The colour or picture behind one value's swatch. */
export async function setAttributeValueSwatch(fd: FormData): Promise<void> {
  await requireCapability("catalog");
  const id = String(fd.get("id") ?? "");
  if (id) {
    /*
     * Only touch what was submitted. A colour attribute's form posts just the
     * colour, and blanking the picture it may go back to later would be a
     * surprise.
     */
    const data: { colour?: string | null; imageUrl?: string | null; icon?: string | null } = {};
    if (fd.has("colour")) data.colour = safeColour(String(fd.get("colour") ?? ""));
    if (fd.has("imageUrl")) data.imageUrl = safeSwatchImage(String(fd.get("imageUrl") ?? ""));
    if (fd.has("icon")) {
      const icon = String(fd.get("icon") ?? "").trim();
      data.icon = isKnownIcon(icon) ? icon : null;
    }
    if (Object.keys(data).length > 0) {
      await prisma.attributeValue.update({ where: { id }, data }).catch(() => undefined);
    }
  }
  revalidatePath("/admin/attributes");
  revalidatePath("/shop");
  revalidatePath("/");
  redirect("/admin/attributes");
}
