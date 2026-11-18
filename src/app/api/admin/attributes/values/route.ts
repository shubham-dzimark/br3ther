import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  parseValueSpec,
  safeColour,
  safeSwatchImage,
} from "@/lib/attribute-display";
import { isKnownIcon } from "@/lib/attribute-icons";

export const dynamic = "force-dynamic";

/**
 * Add values to an existing attribute from the product editor.
 *
 * Same reason as the attribute route next door: the picker lives inside the
 * product form, so it cannot post a form of its own, and a page reload would
 * throw away a product that has not been saved yet. A new colour or flavour
 * turns up mid-build more often than a whole new attribute does.
 */
export async function POST(request: Request): Promise<Response> {
  const me = await getApiAdmin();
  if (!me || !can(me.role, "catalog")) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { attributeId?: unknown; values?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const attributeId = String(body.attributeId ?? "");
  const attribute = await prisma.attribute.findUnique({
    where: { id: attributeId },
    select: { id: true },
  });
  if (!attribute) return Response.json({ error: "No such attribute." }, { status: 404 });

  const specs = (Array.isArray(body.values) ? body.values : [])
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
    .slice(0, 50);

  if (specs.length === 0) {
    return Response.json({ error: "Add at least one value." }, { status: 400 });
  }

  let sortOrder = await prisma.attributeValue.count({ where: { attributeId } });
  const created: { id: string; value: string; colour: string | null; imageUrl: string | null; icon: string | null }[] = [];

  for (const spec of specs) {
    // unique([attributeId, value]) - an existing value is simply returned, so
    // adding "Mango" twice is not an error the shopkeeper has to think about.
    const row = await prisma.attributeValue
      .upsert({
        where: { attributeId_value: { attributeId, value: spec.value } },
        update: {
          colour: safeColour(spec.colour),
          imageUrl: safeSwatchImage(spec.image),
          icon: isKnownIcon(spec.icon) ? spec.icon : null,
        },
        create: {
          attributeId,
          value: spec.value,
          colour: safeColour(spec.colour),
          imageUrl: safeSwatchImage(spec.image),
          icon: isKnownIcon(spec.icon) ? spec.icon : null,
          sortOrder,
        },
        select: { id: true, value: true, colour: true, imageUrl: true, icon: true },
      })
      .catch(() => null);
    if (row) created.push(row);
    sortOrder += 1;
  }

  return Response.json({ values: created });
}
