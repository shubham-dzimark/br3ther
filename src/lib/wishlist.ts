import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";

/**
 * Wishlist.
 *
 * Owned by a signed-in customer where there is one, and by an anonymous
 * cookie token otherwise - the same split the cart uses, so saving something
 * doesn't demand an account first. The two are merged on sign-in.
 */

const WISHLIST_COOKIE = "nl_wishlist";

async function readToken(): Promise<string | null> {
  return (await cookies()).get(WISHLIST_COOKIE)?.value ?? null;
}

/** Only callable from a server action or route handler - cookies are writable there. */
export async function ensureWishlistToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(WISHLIST_COOKIE)?.value;
  if (existing) return existing;

  const token = crypto.randomUUID();
  jar.set(WISHLIST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return token;
}

/** Who the current wishlist belongs to. */
export async function wishlistOwner(): Promise<
  { customerId: string; token: null } | { customerId: null; token: string } | null
> {
  const customer = await getCurrentCustomer();
  if (customer) return { customerId: customer.id, token: null };
  const token = await readToken();
  return token ? { customerId: null, token } : null;
}

/** Product ids on the wishlist, for rendering the heart in its filled state. */
export async function wishlistProductIds(): Promise<Set<string>> {
  const owner = await wishlistOwner();
  if (!owner) return new Set();

  const rows = await prisma.wishlistItem.findMany({
    where: owner.customerId ? { customerId: owner.customerId } : { token: owner.token },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

export async function wishlistCount(): Promise<number> {
  const owner = await wishlistOwner();
  if (!owner) return 0;
  return prisma.wishlistItem.count({
    where: owner.customerId ? { customerId: owner.customerId } : { token: owner.token },
  });
}

/** The saved products themselves, newest first. */
export async function wishlistProducts() {
  const owner = await wishlistOwner();
  if (!owner) return [];

  const rows = await prisma.wishlistItem.findMany({
    where: owner.customerId ? { customerId: owner.customerId } : { token: owner.token },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
          variants: {
            where: { isActive: true },
            orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
            /*
             * Each option's attribute values, as every other listing card
             * gets them: without these a card cannot split its chips into a
             * Weight row and a Flavour row, and falls back to one chip per
             * combination - a card twice the height of the ones beside it.
             */
            include: {
              values: {
                select: {
                  attributeValueId: true,
                  attributeValue: {
                    select: {
                      id: true,
                      value: true,
                      colour: true,
                      imageUrl: true,
                      icon: true,
                      sortOrder: true,
                      attribute: { select: { id: true, name: true, display: true, sortOrder: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // An unpublished product is dropped rather than linking to a dead page.
  return rows.filter((r) => r.product.status === "PUBLISHED");
}

/**
 * Move an anonymous wishlist onto the account.
 *
 * Called on sign-in and on registration. Duplicates are skipped rather than
 * throwing, so saving something twice - once as a guest, once signed in on
 * another device - is not an error.
 */
export async function mergeWishlistIntoAccount(customerId: string): Promise<void> {
  const token = await readToken();
  if (!token) return;

  const guest = await prisma.wishlistItem.findMany({ where: { token } });
  if (guest.length === 0) return;

  const existing = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });
  const have = new Set(existing.map((e) => e.productId));

  const toMove = guest.filter((g) => !have.has(g.productId));
  if (toMove.length) {
    await prisma.wishlistItem.createMany({
      data: toMove.map((g) => ({ customerId, productId: g.productId })),
      skipDuplicates: true,
    });
  }

  // The guest rows have served their purpose either way.
  await prisma.wishlistItem.deleteMany({ where: { token } });
}
