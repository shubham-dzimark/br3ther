/**
 * One Prisma selection for every listing card, so a card shows the same
 * information wherever it appears - home, shop, search, wishlist.
 *
 * It carries each option's attribute values because the card splits its chips
 * per attribute (a Weight row and a Size row) exactly like the product page,
 * and needs each value's colour or picture to draw a swatch.
 */
export const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  shortDescription: true,
  coverImageUrl: true,
  ratingAverage: true,
  ratingCount: true,
  /** The Bestseller ribbon on the Br3thr card. */
  featured: true,
  discountActive: true,
  discountPercent: true,
  discountStartsAt: true,
  discountEndsAt: true,
  /** The pill on the card. */
  category: { select: { name: true } },
  /** A gift card shows "Choose amount" instead of a quick add. */
  type: true,
  images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true, alt: true } },
  variants: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      name: true,
      priceCents: true,
      compareAtCents: true,
      stock: true,
      stockStatus: true,
      manageStock: true,
      backorders: true,
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
              attribute: {
                select: { id: true, name: true, display: true, sortOrder: true },
              },
            },
          },
        },
      },
    },
  },
};
