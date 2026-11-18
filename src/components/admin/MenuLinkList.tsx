import { prisma } from "@/lib/prisma";
import { SectionCard } from "@/components/admin/Field";

type LinkRow = { label: string; url: string; note?: string };

/**
 * "Links you can use" beside the Header and Footer menu editors.
 *
 * Read fresh from the database on every load, so a category, page or blog
 * post added since appears here with nothing else to update. The fixed rows
 * are the storefront's own routes.
 */
export async function MenuLinkList() {
  const [categories, pages, blogCategories, posts] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.contentPage.findMany({
      orderBy: { title: "asc" },
      select: { title: true, slug: true, isPublished: true },
    }),
    prisma.blogCategory.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { title: true, slug: true },
    }),
  ]);

  const groups: { title: string; rows: LinkRow[] }[] = [
    {
      title: "Store",
      rows: [
        { label: "Home", url: "/" },
        { label: "Shop", url: "/shop" },
        { label: "On sale", url: "/shop?sale=1" },
        { label: "Reviews", url: "/reviews" },
        { label: "Refer a friend", url: "/referral" },
        { label: "Lab Results", url: "/lab-results" },
        { label: "Blog", url: "/blog" },
        { label: "Contact", url: "/contact" },
        { label: "Track your order", url: "/track-order" },
      ],
    },
    {
      title: "Account",
      rows: [
        { label: "My account", url: "/account" },
        { label: "Order history", url: "/account/orders" },
        { label: "Wishlist", url: "/account/wishlist" },
        { label: "Member points", url: "/account/points" },
        { label: "My referrals", url: "/account/referrals" },
        { label: "Sign in", url: "/account/login" },
        { label: "Create account", url: "/account/register" },
      ],
    },
    {
      title: "Categories",
      rows: categories.map((c) => ({ label: c.name, url: `/shop?category=${c.slug}` })),
    },
    {
      title: "Pages",
      rows: pages.map((p) => ({
        label: p.title,
        url: `/pages/${p.slug}`,
        // A draft's link 404s until it is published - say so here.
        note: p.isPublished ? undefined : "draft",
      })),
    },
    {
      title: "Blog categories",
      rows: blogCategories.map((c) => ({ label: c.name, url: `/blog/category/${c.slug}` })),
    },
    {
      title: "Blog posts",
      rows: posts.map((p) => ({ label: p.title, url: `/blog/${p.slug}` })),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <SectionCard title="Links you can use">
      <p className="mb-4 text-xs text-slate-500">
        Copy any of these into a menu item&rsquo;s link field. New categories, pages and blog
        posts show up here on their own.
      </p>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {g.title}
            </p>
            <ul className="space-y-1.5">
              {g.rows.map((row) => (
                <li
                  key={row.url}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0 truncate text-slate-700">
                    {row.label}
                    {row.note ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {row.note}
                      </span>
                    ) : null}
                  </span>
                  <code className="max-w-[60%] shrink-0 truncate rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                    {row.url}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
