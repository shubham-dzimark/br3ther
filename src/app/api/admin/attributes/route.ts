import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import {
  displayOf,
  parseValueSpec,
  safeColour,
  safeSwatchImage,
} from "@/lib/attribute-display";
import { isKnownIcon } from "@/lib/attribute-icons";

export const dynamic = "force-dynamic";

/**
 * Create an attribute and its values from the product editor.
 *
 * The picker sits inside the product form, and a form cannot contain another,
 * so adding an attribute goes through here instead of a nested form. The new
 * attribute is returned so the editor can add it to the list without a reload,
 * which would throw away the half-built product.
 */
export async function POST(request: Request): Promise<Response> {
  const me = await getApiAdmin();
  if (!me || !can(me.role, "catalog")) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { name?: unknown; values?: unknown; display?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 40);
  if (!name) return Response.json({ error: "Give the attribute a name." }, { status: 400 });

  const display = displayOf(String(body.display ?? ""));
  /*
   * Rows from the picker arrive as objects with their swatch; a plain string
   * is still accepted, and read as the typed shorthand.
   */
  const values = (Array.isArray(body.values) ? body.values : [])
    .map((raw) => {
      if (raw && typeof raw === "object") {
        const r = raw as Record<string, unknown>;
        return {
          value: String(r.value ?? "").trim().slice(0, 60),
          colour: safeColour(typeof r.colour === "string" ? r.colour : null),
          image: safeSwatchImage(typeof r.imageUrl === "string" ? r.imageUrl : null),
          icon: typeof r.icon === "string" && isKnownIcon(r.icon) ? r.icon : null,
        };
      }
      return parseValueSpec(String(raw).slice(0, 120));
    })
    .filter((v) => v.value)
    // Same value twice would break the unique index and means nothing anyway.
    .filter(
      (v, i, all) =>
        all.findIndex((x) => x.value.toLowerCase() === v.value.toLowerCase()) === i,
    )
    .slice(0, 50);

  if (values.length === 0) {
    return Response.json({ error: "Add at least one value." }, { status: 400 });
  }

  const existing = await prisma.attribute.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return Response.json({ error: `"${name}" already exists.` }, { status: 409 });
  }

  const count = await prisma.attribute.count();
  const attribute = await prisma.attribute.create({
    data: {
      name,
      slug: await uniqueAttributeSlug(slugify(name) || "attribute"),
      display,
      sortOrder: count,
      values: {
        create: values.map((spec, i) => ({
          value: spec.value.slice(0, 60),
          colour: safeColour(spec.colour),
          imageUrl: safeSwatchImage(spec.image),
          icon: isKnownIcon(spec.icon) ? spec.icon : null,
          sortOrder: i,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      display: true,
      values: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, value: true, colour: true, imageUrl: true, icon: true },
      },
    },
  });

  return Response.json({ attribute });
}

/** Slugs are unique, so a second "Size" becomes size-2. */
async function uniqueAttributeSlug(base: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.attribute.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
