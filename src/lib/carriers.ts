import { prisma } from "@/lib/prisma";

export type Carrier = {
  key: string;
  name: string;
  region: string;
  /** Two-or-three letter monogram, used when no logo is uploaded. */
  monogram: string;
  colour: string;
  track: string;
  logoUrl: string | null;
};

/**
 * Carriers now live in the database so they can be added, edited and switched
 * off from the admin. These helpers keep the old call shapes, but the list has
 * to be fetched first and handed in - lookups used to be synchronous against a
 * hardcoded array.
 */
export async function getCarriers(activeOnly = true): Promise<Carrier[]> {
  const rows = await prisma.shippingCarrier.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    region: r.region,
    monogram: r.monogram,
    colour: r.colour,
    track: r.trackUrl,
    logoUrl: r.logoUrl,
  }));
}

export function findCarrier(
  carriers: Carrier[],
  key: string | null | undefined,
): Carrier | null {
  if (!key) return null;
  return carriers.find((c) => c.key === key) ?? null;
}

/** Tracking page for a number, or null when the carrier has no URL pattern. */
export function trackingUrl(
  carriers: Carrier[],
  key: string | null | undefined,
  code: string | null | undefined,
): string | null {
  const carrier = findCarrier(carriers, key);
  if (!carrier || !carrier.track || !code) return null;
  return carrier.track.replace("{n}", encodeURIComponent(code));
}

/**
 * Resolve a carrier's display name without a round trip, for places that only
 * need a label. Falls back to the stored key so a removed carrier still reads
 * as something rather than vanishing from an old order.
 */
export function carrierLabel(
  carriers: Carrier[],
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  return findCarrier(carriers, key)?.name ?? key;
}
